/**
 * avplay-tracker.js
 * Core Tizen AVPlay tracker for New Relic video analytics
 * 
 */

import { EventMapper } from './event-mapper.js';
import { Transport } from './transport.js';

export class AVPlayTracker {
    constructor(config = {}) {
        // Validate required config
        if (!config.player) {
            throw new Error('AVPlayTracker requires a player instance (webapis.avplay)');
        }

        this.config = {
            player: config.player, // webapis.avplay instance
            contentId: config.contentId || '',
            title: config.title || '',
            contentSrc: config.contentSrc || '',
            newRelicKey: config.newRelicKey || '',
            newRelicAccountId: config.newRelicAccountId || '',
            customEndpoint: config.customEndpoint || null,
            enableBatching: config.enableBatching || false,
            heartbeatInterval: config.heartbeatInterval || 10000, // ms
            enableLogging: config.enableLogging !== false,
            autoTrackPlayhead: config.autoTrackPlayhead !== false,
            ...config
        };

        // Initialize components
        this.eventMapper = new EventMapper();
        this.transport = new Transport({
            newRelicKey: this.config.newRelicKey,
            newRelicAccountId: this.config.newRelicAccountId,
            customEndpoint: this.config.customEndpoint,
            enableBatching: this.config.enableBatching,
            enableLogging: this.config.enableLogging
        });

        // State management
        this.state = {
            sessionId: EventMapper.generateSessionId(),
            isInitialized: false,
            isPlaying: false,
            isPaused: false,
            isSeeking: false,
            isBuffering: false,
            currentTime: 0,
            duration: 0,
            bitrate: 0,
            resolution: '',
            width: 0,
            height: 0,
            bufferStartTime: null,
            seekFromPosition: null,
            lastHeartbeatTime: 0,
            errorCount: 0
        };

        // Timers
        this.heartbeatTimer = null;
        this.playheadTimer = null;

        // Bind methods
        this._onBufferingStart = this._onBufferingStart.bind(this);
        this._onBufferingComplete = this._onBufferingComplete.bind(this);
        this._onStreamCompleted = this._onStreamCompleted.bind(this);
        this._onError = this._onError.bind(this);
        this._onCurrentPlayTime = this._onCurrentPlayTime.bind(this);
        this._onEvent = this._onEvent.bind(this);

        this._log('info', 'AVPlayTracker initialized', { sessionId: this.state.sessionId });
    }

    /**
     * Initialize tracker and register AVPlay callbacks
     */
    init() {
        if (this.state.isInitialized) {
            this._log('warn', 'Tracker already initialized');
            return;
        }

        try {
            const player = this.config.player;

            // Register AVPlay callbacks
            player.setListener({
                onbufferingstart: this._onBufferingStart,
                onbufferingcomplete: this._onBufferingComplete,
                onstreamcompleted: this._onStreamCompleted,
                onerror: this._onError,
                oncurrentplaytime: this._onCurrentPlayTime,
                onevent: this._onEvent
            });

            this.state.isInitialized = true;
            this._log('info', 'AVPlay callbacks registered successfully');

            // Start heartbeat tracking if enabled
            if (this.config.heartbeatInterval > 0) {
                this._startHeartbeat();
            }

        } catch (error) {
            this._log('error', 'Failed to initialize tracker:', error);
            throw error;
        }
    }

    /**
     * Open and prepare video for playback
     * @param {string} url - Video source URL
     */
    async open(url) {
        if (!this.state.isInitialized) {
            throw new Error('Tracker not initialized. Call init() first.');
        }

        try {
            this.config.contentSrc = url;
            const player = this.config.player;

            player.open(url);
            this._log('info', 'Video opened:', url);

            // Prepare player
            player.prepareAsync(
                () => {
                    this._log('info', 'Video prepared successfully');
                    this._updateVideoMetadata();
                },
                (error) => {
                    this._log('error', 'Failed to prepare video:', error);
                }
            );

        } catch (error) {
            this._log('error', 'Failed to open video:', error);
            this._trackError('PLAYER_ERROR_INVALID_OPERATION', error.message);
        }
    }

    /**
     * Start video playback
     */
    play() {
        if (!this.state.isInitialized) {
            this._log('warn', 'Cannot play: tracker not initialized');
            return;
        }

        try {
            const player = this.config.player;
            player.play();

            this.state.isPlaying = true;
            this.state.isPaused = false;

            this._trackEvent('play');
            this._startPlayheadTracking();

            this._log('info', 'Playback started');

        } catch (error) {
            this._log('error', 'Failed to start playback:', error);
            this._trackError('PLAYER_ERROR_INVALID_OPERATION', error.message);
        }
    }

    /**
     * Pause video playback
     */
    pause() {
        if (!this.state.isInitialized) {
            this._log('warn', 'Cannot pause: tracker not initialized');
            return;
        }

        try {
            const player = this.config.player;
            player.pause();

            this.state.isPlaying = false;
            this.state.isPaused = true;

            this._trackEvent('pause');
            this._stopPlayheadTracking();

            this._log('info', 'Playback paused');

        } catch (error) {
            this._log('error', 'Failed to pause playback:', error);
        }
    }

    /**
     * Seek to specific position
     * @param {number} position - Position in milliseconds
     */
    seekTo(position) {
        if (!this.state.isInitialized) {
            this._log('warn', 'Cannot seek: tracker not initialized');
            return;
        }

        try {
            // Track seek start
            this.state.isSeeking = true;
            this.state.seekFromPosition = this.state.currentTime;

            this._trackEvent('seekStart', {
                seekFromPosition: this.state.currentTime
            });

            const player = this.config.player;
            player.seekTo(position, () => {
                // Seek completed
                this.state.isSeeking = false;
                this.state.currentTime = position / 1000; // Convert to seconds

                this._trackEvent('seekEnd', {
                    seekFromPosition: this.state.seekFromPosition,
                    seekToPosition: this.state.currentTime
                });

                this.state.seekFromPosition = null;
                this._log('info', 'Seek completed:', position);
            });

        } catch (error) {
            this.state.isSeeking = false;
            this._log('error', 'Failed to seek:', error);
            this._trackError('PLAYER_ERROR_SEEK_FAILED', error.message);
        }
    }

    /**
     * Stop playback and reset
     */
    stop() {
        if (!this.state.isInitialized) {
            return;
        }

        try {
            const player = this.config.player;
            player.stop();

            this.state.isPlaying = false;
            this.state.isPaused = false;

            this._stopPlayheadTracking();
            this._stopHeartbeat();

            this._log('info', 'Playback stopped');

        } catch (error) {
            this._log('error', 'Failed to stop playback:', error);
        }
    }

    /**
     * Close player and clean up resources
     */
    close() {
        try {
            this.stop();
            
            const player = this.config.player;
            player.close();

            this._cleanup();
            this._log('info', 'Player closed');

        } catch (error) {
            this._log('error', 'Failed to close player:', error);
        }
    }

    // ========================================================================
    // AVPlay Event Handlers
    // ========================================================================

    _onBufferingStart() {
        this.state.isBuffering = true;
        this.state.bufferStartTime = Date.now();

        this._trackEvent('bufferingstart', {
            bufferStartTime: this.state.bufferStartTime
        });

        this._log('info', 'Buffering started');
    }

    _onBufferingComplete() {
        this.state.isBuffering = false;

        const bufferDuration = this.state.bufferStartTime 
            ? Date.now() - this.state.bufferStartTime 
            : 0;

        this._trackEvent('bufferingcomplete', {
            bufferStartTime: this.state.bufferStartTime,
            bufferDuration: bufferDuration
        });

        this.state.bufferStartTime = null;
        this._log('info', 'Buffering complete. Duration:', bufferDuration, 'ms');
    }

    _onStreamCompleted() {
        this.state.isPlaying = false;
        this.state.isPaused = false;

        this._trackEvent('streamcompleted');
        this._stopPlayheadTracking();

        this._log('info', 'Stream completed');
    }

    _onError(error) {
        this.state.errorCount++;

        const errorCode = error || 'PLAYER_ERROR_UNKNOWN';
        const errorMessage = this.eventMapper.getErrorDescription(errorCode);

        this._trackError(errorCode, errorMessage);
        this._log('error', 'AVPlay error:', errorCode, errorMessage);
    }

    _onCurrentPlayTime(currentTime) {
        // Update current playhead position (in milliseconds from AVPlay)
        this.state.currentTime = currentTime / 1000; // Convert to seconds
    }

    _onEvent(event, eventData) {
        // Handle custom AVPlay events
        this._log('info', 'AVPlay event:', event, eventData);
        
        // You can extend this to handle specific events like:
        // - Resolution change
        // - Bitrate change
        // - Subtitle track change
        // etc.
    }

    // ========================================================================
    // Helper Methods
    // ========================================================================

    /**
     * Track an event
     */
    _trackEvent(eventName, additionalData = {}) {
        const eventData = {
            contentId: this.config.contentId,
            contentSrc: this.config.contentSrc,
            title: this.config.title,
            duration: this.state.duration,
            playhead: this.state.currentTime,
            sessionId: this.state.sessionId,
            bitrate: this.state.bitrate,
            resolution: this.state.resolution,
            width: this.state.width,
            height: this.state.height,
            isLive: this._isLiveStream(),
            playerVersion: '1.0.0',
            ...additionalData
        };

        const mappedEvent = this.eventMapper.mapEvent(eventName, eventData);
        this.transport.send(mappedEvent);
    }

    /**
     * Track an error event
     */
    _trackError(errorCode, errorMessage) {
        const errorEvent = this.eventMapper.createErrorEvent(errorCode, errorMessage, {
            contentId: this.config.contentId,
            contentSrc: this.config.contentSrc,
            title: this.config.title,
            duration: this.state.duration,
            playhead: this.state.currentTime,
            sessionId: this.state.sessionId
        });

        this.transport.send(errorEvent);
    }

    /**
     * Update video metadata from player
     */
    _updateVideoMetadata() {
        try {
            const player = this.config.player;
            
            // Get duration
            this.state.duration = player.getDuration() / 1000; // Convert to seconds

            // Get video resolution (if available)
            // Note: AVPlay doesn't always expose this directly
            // You may need to parse from stream info or video element

            this._log('info', 'Metadata updated:', {
                duration: this.state.duration,
                resolution: this.state.resolution
            });

        } catch (error) {
            this._log('warn', 'Could not update metadata:', error);
        }
    }

    /**
     * Check if stream is live
     */
    _isLiveStream() {
        // Heuristic: if duration is 0 or very large, likely live
        return this.state.duration === 0 || this.state.duration > 86400; // > 24 hours
    }

    /**
     * Start heartbeat tracking
     */
    _startHeartbeat() {
        if (this.heartbeatTimer) {
            return;
        }

        this.heartbeatTimer = setInterval(() => {
            if (this.state.isPlaying) {
                const timeSinceLastEvent = Date.now() - this.state.lastHeartbeatTime;
                
                this._trackEvent('timeupdate', {
                    timeSinceLastEvent: timeSinceLastEvent
                });

                this.state.lastHeartbeatTime = Date.now();
            }
        }, this.config.heartbeatInterval);

        this._log('info', 'Heartbeat tracking started');
    }

    /**
     * Stop heartbeat tracking
     */
    _stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
            this._log('info', 'Heartbeat tracking stopped');
        }
    }

    /**
     * Start playhead position tracking
     */
    _startPlayheadTracking() {
        if (!this.config.autoTrackPlayhead || this.playheadTimer) {
            return;
        }

        this.playheadTimer = setInterval(() => {
            try {
                const currentTime = this.config.player.getCurrentTime();
                this.state.currentTime = currentTime / 1000; // Convert to seconds
            } catch (error) {
                // Silently fail
            }
        }, 500); // Update every 500ms
    }

    /**
     * Stop playhead tracking
     */
    _stopPlayheadTracking() {
        if (this.playheadTimer) {
            clearInterval(this.playheadTimer);
            this.playheadTimer = null;
        }
    }

    /**
     * Clean up resources
     */
    _cleanup() {
        this._stopHeartbeat();
        this._stopPlayheadTracking();
        
        if (this.transport) {
            this.transport.destroy();
        }

        this.state.isInitialized = false;
    }

    /**
     * Logging helper
     */
    _log(level, ...args) {
        if (!this.config.enableLogging) return;

        const prefix = '[video-tizen-js/tracker]';
        
        switch (level) {
            case 'info':
                console.info(prefix, ...args);
                break;
            case 'warn':
                console.warn(prefix, ...args);
                break;
            case 'error':
                console.error(prefix, ...args);
                break;
            default:
                console.log(prefix, ...args);
        }
    }

    /**
     * Get current tracker state
     */
    getState() {
        return {
            ...this.state,
            transportStatus: this.transport.getStatus()
        };
    }

    /**
     * Destroy tracker instance
     */
    destroy() {
        this.close();
        this._log('info', 'Tracker destroyed');
    }
}

export default AVPlayTracker;
