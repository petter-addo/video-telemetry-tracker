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
            // Max time to wait for prepareAsync before treating it as a failure
            prepareTimeoutMs: typeof config.prepareTimeoutMs === 'number' ? config.prepareTimeoutMs : 10000,
            enableLogging: config.enableLogging !== false,
            autoTrackPlayhead: config.autoTrackPlayhead !== false,
            // Optional streaming properties for AVPlay
            streamingProps: {
                USER_AGENT: (config.streamingProps && config.streamingProps.USER_AGENT) || null,
                COOKIE: (config.streamingProps && config.streamingProps.COOKIE) || null,
                REFERER: (config.streamingProps && config.streamingProps.REFERER) || null,
            },
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

        // Resource & timers
        this.allocatedByTracker = false;
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
     * Compute a best-effort full-screen rect for AVPlay
     */
    _getFullScreenRect() {
        try {
            // Prefer physical screen size if available
            const w = (window.screen && (window.screen.availWidth || window.screen.width)) || window.innerWidth || 1920;
            const h = (window.screen && (window.screen.availHeight || window.screen.height)) || window.innerHeight || 1080;
            const W = Math.max(1, Math.round(w));
            const H = Math.max(1, Math.round(h));
            return { x: 0, y: 0, w: W, h: H };
        } catch (_) {
            return { x: 0, y: 0, w: 1920, h: 1080 };
        }
    }

    /**
     * Initialize tracker and register AVPlay callbacks
     */
    init() {
        if (this.state.isInitialized) {
            this._log('warn', 'Tracker already initialized');
            return;
        }

        const player = this.config.player;
        
        this._log('info', 'Initializing tracker...');
        this._log('info', 'Player object:', typeof player);
        this._log('info', 'Player.setListener:', typeof player.setListener);

        // Register AVPlay callbacks (non-fatal if it fails)
        try {
            if (typeof player.setListener === 'function') {
                player.setListener({
                    onbufferingstart: this._onBufferingStart,
                    onbufferingcomplete: this._onBufferingComplete,
                    onstreamcompleted: this._onStreamCompleted,
                    onerror: this._onError,
                    oncurrentplaytime: this._onCurrentPlayTime,
                    onevent: this._onEvent
                });
                this._log('info', '✅ AVPlay callbacks registered successfully');
            } else {
                this._log('warn', '⚠️ setListener not available, skipping callback registration');
            }
        } catch (listenerError) {
            // Don't fail initialization if setListener fails
            this._log('warn', '⚠️ Failed to set listeners (non-fatal):', listenerError.message);
        }

        // Mark as initialized even if listeners failed
        this.state.isInitialized = true;

        // Start heartbeat tracking if enabled
        try {
            if (this.config.heartbeatInterval > 0) {
                this._startHeartbeat();
            }
        } catch (heartbeatError) {
            this._log('warn', '⚠️ Failed to start heartbeat (non-fatal):', heartbeatError.message);
        }
        
        this._log('info', '✅ Tracker initialized successfully');
    }

    /**
     * Open and prepare video for playback
     * @param {string} url - Video source URL
     * @returns {Promise} Resolves when video is prepared
     */
    async open(url) {
        if (!this.state.isInitialized) {
            // Be tolerant: auto-initialize instead of throwing
            this._log('warn', 'open() called before init(); attempting auto-initialize');
            try {
                this.init();
                this._log('info', 'Auto-initialize successful');
            } catch (autoInitErr) {
                this._log('error', 'Auto-initialize failed:', autoInitErr);
                throw new Error('Tracker not initialized. Call init() first.');
            }
        }

        return new Promise((resolve, reject) => {
            try {
                this.config.contentSrc = url;
                const player = this.config.player;

                // Check current state
                try {
                    const currentState = player.getState();
                    this._log('info', '🔍 Player state before open:', currentState);
                    
                    // If not in IDLE state, we need to close first
                    if (currentState !== 'IDLE' && currentState !== 'NONE') {
                        this._log('warn', '⚠️ Player not in IDLE state, closing first...');
                        player.close();
                        this._log('info', '✅ Player closed, now in IDLE state');
                    }
                } catch (stateErr) {
                    this._log('warn', 'Could not check state, proceeding with open:', stateErr);
                }

                // Allocate AVPlay resources if available
                try {
                    if (typeof player.allocate === 'function') {
                        player.allocate();
                        this.allocatedByTracker = true;
                        this._log('info', '✅ AVPlay resources allocated');
                    }
                } catch (allocErr) {
                    this._log('warn', '⚠️ allocate() failed (non-fatal, will try cleanup then continue):', allocErr);
                    try {
                        // Attempt cleanup then retry once
                        try { player.stop && player.stop(); } catch(_) {}
                        try { player.close && player.close(); } catch(_) {}
                        try { player.deallocate && player.deallocate(); } catch(_) {}
                        if (typeof player.allocate === 'function') {
                            player.allocate();
                            this.allocatedByTracker = true;
                            this._log('info', '✅ AVPlay resources allocated (after cleanup)');
                        }
                    } catch (allocRetryErr) {
                        this._log('warn', '⚠️ allocate() retry failed, proceeding without explicit allocation:', allocRetryErr);
                    }
                }

                // Set optional streaming properties: USER_AGENT, COOKIE, REFERER
                try {
                    if (typeof player.setStreamingProperty === 'function') {
                        var props = this.config.streamingProps || {};
                        var ua = props.USER_AGENT || ('Mozilla/5.0 (SMART-TV; Tizen ' + ((typeof tizen !== 'undefined' && tizen.systeminfo) ? 'TV' : '9.0') + ') AVPlay/1.0');
                        try { player.setStreamingProperty('USER_AGENT', ua); this._log('info', '✅ USER_AGENT set for AVPlay'); } catch (e1) { this._log('warn', 'UA set failed:', e1); }
                        if (props.COOKIE) {
                            try { player.setStreamingProperty('COOKIE', props.COOKIE); this._log('info', '✅ COOKIE set for AVPlay'); } catch (e2) { this._log('warn', 'COOKIE set failed:', e2); }
                        }
                        if (props.REFERER) {
                            try { player.setStreamingProperty('REFERER', props.REFERER); this._log('info', '✅ REFERER set for AVPlay'); } catch (e3) { this._log('warn', 'REFERER set failed:', e3); }
                        }
                    }
                } catch (uaErr) {
                    this._log('warn', '⚠️ setStreamingProperty(USER_AGENT) failed (non-fatal):', uaErr);
                }

                this._log('info', 'Opening video:', url);
                player.open(url);
                this._log('info', '✅ Video opened successfully');

                // Set display to full screen after opening
                try {
                    const rect = this._getFullScreenRect();
                    // Try to set full-screen display mode (non-fatal if unsupported)
                    if (typeof player.setDisplayMethod === 'function') {
                        try {
                            player.setDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN');
                            this._log('info', '✅ Display mode set to FULL_SCREEN');
                        } catch (dmErr) {
                            this._log('warn', '⚠️ setDisplayMethod failed (non-fatal):', dmErr);
                        }
                    }

                    // Always set the display rect explicitly
                    if (typeof player.setDisplayRect === 'function') {
                        try {
                            player.setDisplayRect(rect.x, rect.y, rect.w, rect.h);
                            this._log('info', `✅ Display rect set to ${rect.w}x${rect.h} @ (${rect.x},${rect.y})`);
                        } catch (srErr) {
                            this._log('warn', '⚠️ setDisplayRect failed, trying inset workaround:', srErr);
                            // Some firmwares misbehave with exact full-screen; try a 1px inset
                            const inset = { x: rect.x + 1, y: rect.y + 1, w: Math.max(1, rect.w - 2), h: Math.max(1, rect.h - 2) };
                            try {
                                player.setDisplayRect(inset.x, inset.y, inset.w, inset.h);
                                this._log('info', `✅ Display rect set (inset) to ${inset.w}x${inset.h} @ (${inset.x},${inset.y})`);
                            } catch (srErr2) {
                                this._log('error', '❌ setDisplayRect inset workaround failed:', srErr2);
                            }
                        }
                    }
                } catch (displayError) {
                    this._log('warn', '⚠️ Could not set display mode:', displayError);
                }

                // Tune buffering behavior to reduce startup wait, when supported
                try {
                    if (typeof player.setTimeoutForBuffering === 'function') {
                        // Seconds to wait for buffering to start/resume before timing out internally
                        player.setTimeoutForBuffering(5);
                        this._log('info', '✅ setTimeoutForBuffering(5) applied');
                    }
                } catch (btErr) {
                    this._log('warn', '⚠️ setTimeoutForBuffering failed (non-fatal):', btErr);
                }

                // Prepare player
                this._log('info', 'Calling prepareAsync...');
                let settled = false;
                const timeoutMs = Math.max(1000, Number(this.config.prepareTimeoutMs) || 10000);
                const timer = setTimeout(() => {
                    if (settled) return;
                    settled = true;
                    const err = new Error(`Prepare timed out after ${timeoutMs} ms`);
                    this._log('error', '❌ prepareAsync timeout:', err.message);
                    this._trackError('PLAYER_ERROR_CONNECTION_FAILED', err.message);
                    // Best-effort cleanup
                    try { player.stop && player.stop(); } catch(_) {}
                    try { player.close && player.close(); } catch(_) {}
                    try { if (this.allocatedByTracker && typeof player.deallocate === 'function') { player.deallocate(); this.allocatedByTracker = false; } } catch(_) {}
                    reject(err);
                }, timeoutMs);

                player.prepareAsync(
                    () => {
                        if (settled) return; settled = true;
                        clearTimeout(timer);
                        this._log('info', '✅ Video prepared successfully');
                        this._updateVideoMetadata();
                        
                        // Log current player state
                        try {
                            const state = player.getState();
                            this._log('info', '📊 Player state after prepare:', state);
                        } catch (e) {
                            this._log('warn', 'Could not get player state:', e);
                        }
                        
                        resolve();
                    },
                    (error) => {
                        if (settled) return; settled = true;
                        clearTimeout(timer);
                        this._log('error', '❌ Failed to prepare video:', error);
                        try { this._log('error', 'Error details:', JSON.stringify(error)); } catch(_) {}
                        this._trackError('PLAYER_ERROR_INVALID_OPERATION', (error && error.message) || 'Prepare failed');
                        reject(new Error((error && error.message) || 'Failed to prepare video'));
                    }
                );

            } catch (error) {
                this._log('error', '❌ Failed to open video:', error);
                this._log('error', 'Error stack:', error.stack);
                this._trackError('PLAYER_ERROR_INVALID_OPERATION', error.message);
                reject(error);
            }
        });
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
            
            // Log current state before playing
            try {
                const state = player.getState();
                this._log('info', '▶️ Current player state before play:', state);
            } catch (e) {
                this._log('warn', 'Could not get player state:', e);
            }
            
            player.play();
            this._log('info', '✅ Play command executed');

            this.state.isPlaying = true;
            this.state.isPaused = false;

            this._trackEvent('play');
            this._startPlayheadTracking();

            this._log('info', '✅ Playback started');

        } catch (error) {
            this._log('error', '❌ Failed to start playback:', error);
            this._log('error', 'Error details:', JSON.stringify(error));
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
            const player = this.config.player;
            
            // Try to stop first if player is not in IDLE state
            try {
                const state = player.getState();
                this._log('info', '🔍 Current state before close:', state);
                
                if (state !== 'IDLE' && state !== 'NONE') {
                    this.stop();
                }
            } catch (stateErr) {
                this._log('warn', 'Could not get player state:', stateErr);
                // Try to stop anyway
                try {
                    this.stop();
                } catch (stopErr) {
                    this._log('warn', 'Stop failed, continuing with close:', stopErr);
                }
            }
            
            // Now close
            player.close();
            this._log('info', '✅ Player closed');

            // Try to deallocate if we allocated
            try {
                if (this.allocatedByTracker && typeof player.deallocate === 'function') {
                    player.deallocate();
                    this._log('info', '✅ AVPlay resources deallocated');
                    this.allocatedByTracker = false;
                }
            } catch (deallocErr) {
                this._log('warn', '⚠️ deallocate() failed (non-fatal):', deallocErr);
            }

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

        // Surface error to application for UI visibility
        try {
            if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
                const detail = { errorCode, errorMessage, contentSrc: this.config.contentSrc };
                window.dispatchEvent(new CustomEvent('avplayError', { detail }));
            }
        } catch (_) { /* ignore */ }
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
