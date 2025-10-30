/**
 * event-mapper.js
 * Maps Tizen AVPlay events to New Relic Video Action schema
 * 
 * New Relic Video Action Schema:
 * - actionName: play, pause, bufferStart, bufferEnd, seekStart, seekEnd, end, error
 * - contentId: unique identifier for the video
 * - contentSrc: URL of the video source
 * - duration: total duration in seconds
 * - playhead: current playback position in seconds
 * - sessionId: unique session identifier
 * - timestamp: ISO 8601 timestamp
 */

export class EventMapper {
    constructor() {
        this.eventMap = {
            // AVPlay event -> New Relic action name
            'play': 'play',
            'pause': 'pause',
            'bufferingstart': 'bufferStart',
            'bufferingcomplete': 'bufferEnd',
            'streamcompleted': 'end',
            'error': 'error',
            'seekStart': 'seekStart',
            'seekEnd': 'seekEnd',
            'timeupdate': 'heartbeat',
            'bitratechange': 'bitrateChange',
            'qualitychange': 'qualityChange'
        };
    }

    /**
     * Map AVPlay event to New Relic VideoAction schema
     * @param {string} avplayEvent - The AVPlay event name
     * @param {Object} eventData - Additional event data
     * @returns {Object} New Relic-compatible event object
     */
    mapEvent(avplayEvent, eventData = {}) {
        const actionName = this.eventMap[avplayEvent] || avplayEvent;
        
        const mappedEvent = {
            actionName: actionName,
            contentId: eventData.contentId || '',
            contentSrc: eventData.contentSrc || '',
            contentTitle: eventData.title || '',
            duration: eventData.duration || 0,
            playhead: eventData.playhead || 0,
            sessionId: eventData.sessionId || '',
            timestamp: new Date().toISOString(),
            
            // Video quality metrics
            bitrate: eventData.bitrate || 0,
            resolution: eventData.resolution || '',
            renditionWidth: eventData.width || 0,
            renditionHeight: eventData.height || 0,
            
            // Playback state
            isLive: eventData.isLive || false,
            isMuted: eventData.isMuted || false,
            playbackRate: eventData.playbackRate || 1.0,
            
            // Custom attributes
            playerName: 'tizen-avplay',
            playerVersion: eventData.playerVersion || '1.0.0',
            
            // Error details (if applicable)
            errorCode: eventData.errorCode || null,
            errorMessage: eventData.errorMessage || null,
            severity: eventData.severity || null,
            
            // Additional metadata
            ...eventData.customAttributes
        };

        // Clean up null/undefined values
        Object.keys(mappedEvent).forEach(key => {
            if (mappedEvent[key] === null || mappedEvent[key] === undefined) {
                delete mappedEvent[key];
            }
        });

        return mappedEvent;
    }

    /**
     * Create a buffer event with additional metrics
     */
    createBufferEvent(isStart, eventData) {
        const event = this.mapEvent(isStart ? 'bufferingstart' : 'bufferingcomplete', eventData);
        
        if (isStart) {
            event.bufferStartTime = Date.now();
        } else if (eventData.bufferStartTime) {
            event.bufferDuration = Date.now() - eventData.bufferStartTime;
        }
        
        return event;
    }

    /**
     * Create a seek event with delta information
     */
    createSeekEvent(isStart, eventData) {
        const event = this.mapEvent(isStart ? 'seekStart' : 'seekEnd', eventData);
        
        if (isStart) {
            event.seekFromPosition = eventData.playhead;
        } else {
            event.seekToPosition = eventData.playhead;
            if (eventData.seekFromPosition !== undefined) {
                event.seekDelta = Math.abs(event.seekToPosition - eventData.seekFromPosition);
            }
        }
        
        return event;
    }

    /**
     * Create an error event with detailed error information
     */
    createErrorEvent(errorCode, errorMessage, eventData) {
        return this.mapEvent('error', {
            ...eventData,
            errorCode: errorCode,
            errorMessage: this.getErrorDescription(errorCode, errorMessage),
            severity: this.getErrorSeverity(errorCode)
        });
    }

    /**
     * Get human-readable error description
     */
    getErrorDescription(errorCode, defaultMessage = '') {
        const errorMap = {
            'PLAYER_ERROR_NONE': 'No error',
            'PLAYER_ERROR_INVALID_PARAMETER': 'Invalid parameter',
            'PLAYER_ERROR_NO_SUCH_FILE': 'File not found',
            'PLAYER_ERROR_INVALID_OPERATION': 'Invalid operation',
            'PLAYER_ERROR_SEEK_FAILED': 'Seek operation failed',
            'PLAYER_ERROR_INVALID_STATE': 'Invalid player state',
            'PLAYER_ERROR_NOT_SUPPORTED_FILE': 'File format not supported',
            'PLAYER_ERROR_CONNECTION_FAILED': 'Network connection failed',
            'PLAYER_ERROR_BUFFER_SPACE': 'Insufficient buffer space',
            'PLAYER_ERROR_NOT_SUPPORTED_VIDEO_CODEC': 'Video codec not supported',
            'PLAYER_ERROR_NOT_SUPPORTED_AUDIO_CODEC': 'Audio codec not supported'
        };

        return errorMap[errorCode] || defaultMessage || `Error code: ${errorCode}`;
    }

    /**
     * Determine error severity level
     */
    getErrorSeverity(errorCode) {
        const critical = [
            'PLAYER_ERROR_NO_SUCH_FILE',
            'PLAYER_ERROR_NOT_SUPPORTED_FILE',
            'PLAYER_ERROR_CONNECTION_FAILED'
        ];
        
        const warning = [
            'PLAYER_ERROR_SEEK_FAILED',
            'PLAYER_ERROR_BUFFER_SPACE'
        ];

        if (critical.includes(errorCode)) return 'critical';
        if (warning.includes(errorCode)) return 'warning';
        return 'error';
    }

    /**
     * Create heartbeat event for periodic playback tracking
     */
    createHeartbeatEvent(eventData) {
        return this.mapEvent('timeupdate', {
            ...eventData,
            timeSinceLastEvent: eventData.timeSinceLastEvent || 0
        });
    }

    /**
     * Generate unique session ID
     */
    static generateSessionId() {
        return `avplay-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}

export default EventMapper;
