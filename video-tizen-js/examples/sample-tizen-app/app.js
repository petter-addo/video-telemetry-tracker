/**
 * Sample Tizen App using video-tizen-js
 * Demonstrates how to use AVPlayTracker with webapis.avplay
 */

import { AVPlayTracker } from '../../src/avplay-tracker.js';
import { config } from './config.js';

// ========================================================================
// GLOBAL STATE
// ========================================================================
let tracker = null;
let avplay = null;
let eventCount = 0;
let logs = [];
const MAX_LOGS = 50;

// ========================================================================
// INITIALIZE
// ========================================================================
window.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Initializing video-tizen-js demo...');

    // Check if we're in a Tizen environment
    if (typeof webapis !== 'undefined' && webapis.avplay) {
        console.log('✅ Tizen environment detected');
        avplay = webapis.avplay;
    } else {
        console.warn('⚠️ Not running in Tizen environment. Using mock AVPlay.');
        avplay = createMockAVPlay();
    }

    // Initialize tracker
    initializeTracker();

    // Set up UI event handlers
    setupEventHandlers();

    // Set up hardware key listener (Tizen specific)
    setupTizenKeyHandler();

    addLog('info', 'Application initialized', { sessionId: tracker?.getState().sessionId });
});

// ========================================================================
// TRACKER INITIALIZATION
// ========================================================================
function initializeTracker() {
    try {
        tracker = new AVPlayTracker({
            player: avplay,
            contentId: config.contentId,
            title: config.title,
            newRelicKey: config.newRelicKey,
            newRelicAccountId: config.newRelicAccountId,
            enableBatching: config.enableBatching,
            heartbeatInterval: config.heartbeatInterval,
            enableLogging: true,
            autoTrackPlayhead: true
        });

        // Initialize the tracker
        tracker.init();

        console.log('✅ AVPlayTracker initialized successfully');
        addLog('success', 'Tracker initialized', tracker.getState());

        // Expose tracker globally for debugging
        window.videoTracker = tracker;
        window.debugInfo = {
            tracker: tracker,
            avplay: avplay,
            config: config
        };

    } catch (error) {
        console.error('❌ Failed to initialize tracker:', error);
        addLog('error', 'Failed to initialize tracker', { error: error.message });
    }
}

// ========================================================================
// UI EVENT HANDLERS
// ========================================================================
function setupEventHandlers() {
    // Open video button
    document.getElementById('btnOpen').addEventListener('click', () => {
        openVideo(config.videoUrl);
    });

    // Play button
    document.getElementById('btnPlay').addEventListener('click', () => {
        if (tracker) {
            tracker.play();
            updateStatus('playing');
            addLog('info', 'Play button clicked');
        }
    });

    // Pause button
    document.getElementById('btnPause').addEventListener('click', () => {
        if (tracker) {
            tracker.pause();
            updateStatus('paused');
            addLog('info', 'Pause button clicked');
        }
    });

    // Seek back (-10s)
    document.getElementById('btnSeekBack').addEventListener('click', () => {
        if (tracker) {
            const currentTime = avplay.getCurrentTime();
            const newTime = Math.max(0, currentTime - 10000); // -10 seconds
            tracker.seekTo(newTime);
            addLog('info', 'Seek back 10s', { from: currentTime, to: newTime });
        }
    });

    // Seek forward (+10s)
    document.getElementById('btnSeekForward').addEventListener('click', () => {
        if (tracker) {
            const currentTime = avplay.getCurrentTime();
            const duration = avplay.getDuration();
            const newTime = Math.min(duration, currentTime + 10000); // +10 seconds
            tracker.seekTo(newTime);
            addLog('info', 'Seek forward 10s', { from: currentTime, to: newTime });
        }
    });

    // Stop button
    document.getElementById('btnStop').addEventListener('click', () => {
        if (tracker) {
            tracker.stop();
            updateStatus('stopped');
            enableControls(false);
            addLog('info', 'Stop button clicked');
        }
    });

    // Get state button
    document.getElementById('btnGetState').addEventListener('click', () => {
        if (tracker) {
            const state = tracker.getState();
            console.log('Current tracker state:', state);
            addLog('info', 'Tracker state', state);
            alert(JSON.stringify(state, null, 2));
        }
    });

    // Clear log button
    document.getElementById('btnClearLog').addEventListener('click', () => {
        logs = [];
        eventCount = 0;
        updateLogDisplay();
        updateEventCount();
    });
}

// ========================================================================
// TIZEN HARDWARE KEY HANDLER
// ========================================================================
function setupTizenKeyHandler() {
    // Handle Tizen hardware back key
    document.addEventListener('tizenhwkey', (e) => {
        if (e.keyName === 'back') {
            try {
                if (tracker) {
                    tracker.destroy();
                }
                if (typeof tizen !== 'undefined') {
                    tizen.application.getCurrentApplication().exit();
                }
            } catch (error) {
                console.error('Error handling back key:', error);
            }
        }
    });

    // Handle remote control keys
    document.addEventListener('keydown', (e) => {
        if (!tracker) return;

        const key = e.key || '';
        const code = e.keyCode || 0;

        // Play/Pause with Enter or MediaPlayPause
        if (key === 'Enter' || code === 13 || key === 'MediaPlayPause' || code === 179) {
            e.preventDefault();
            const state = tracker.getState();
            if (state.isPlaying) {
                tracker.pause();
                updateStatus('paused');
            } else {
                tracker.play();
                updateStatus('playing');
            }
        }
        // Seek with arrow keys
        else if (key === 'ArrowLeft' || code === 37) {
            e.preventDefault();
            document.getElementById('btnSeekBack').click();
        }
        else if (key === 'ArrowRight' || code === 39) {
            e.preventDefault();
            document.getElementById('btnSeekForward').click();
        }
    });
}

// ========================================================================
// VIDEO OPERATIONS
// ========================================================================
async function openVideo(url) {
    if (!tracker) {
        alert('Tracker not initialized!');
        return;
    }

    try {
        addLog('info', 'Opening video', { url });
        updateStatus('opening');

        await tracker.open(url);

        enableControls(true);
        updateStatus('ready');
        addLog('success', 'Video opened successfully', { url });

        // Update duration display
        setTimeout(() => {
            updateDurationDisplay();
        }, 500);

    } catch (error) {
        console.error('❌ Failed to open video:', error);
        addLog('error', 'Failed to open video', { error: error.message });
        alert('Failed to open video: ' + error.message);
    }
}

// ========================================================================
// UI UPDATES
// ========================================================================
function updateStatus(status) {
    const statusEl = document.getElementById('statStatus');
    const indicator = statusEl.querySelector('.status-indicator');

    let displayText = status;
    let indicatorClass = 'paused';

    switch (status) {
        case 'playing':
            displayText = 'Playing';
            indicatorClass = '';
            break;
        case 'paused':
            displayText = 'Paused';
            indicatorClass = 'paused';
            break;
        case 'stopped':
            displayText = 'Stopped';
            indicatorClass = 'paused';
            break;
        case 'opening':
            displayText = 'Opening...';
            indicatorClass = 'paused';
            break;
        case 'ready':
            displayText = 'Ready';
            indicatorClass = 'paused';
            break;
    }

    statusEl.innerHTML = `<span class="status-indicator ${indicatorClass}"></span> ${displayText}`;
}

function updateTimeDisplay() {
    try {
        const currentTime = avplay.getCurrentTime() / 1000; // Convert to seconds
        const timeEl = document.getElementById('statTime');
        timeEl.textContent = formatTime(currentTime);
    } catch (error) {
        // Silently fail
    }
}

function updateDurationDisplay() {
    try {
        const duration = avplay.getDuration() / 1000; // Convert to seconds
        const durationEl = document.getElementById('statDuration');
        durationEl.textContent = formatTime(duration);
    } catch (error) {
        // Silently fail
    }
}

function updateEventCount() {
    const eventsEl = document.getElementById('statEvents');
    eventsEl.textContent = eventCount;
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function enableControls(enabled) {
    document.getElementById('btnPlay').disabled = !enabled;
    document.getElementById('btnPause').disabled = !enabled;
    document.getElementById('btnSeekBack').disabled = !enabled;
    document.getElementById('btnSeekForward').disabled = !enabled;
    document.getElementById('btnStop').disabled = !enabled;
}

// ========================================================================
// LOGGING
// ========================================================================
function addLog(type, message, data = null) {
    eventCount++;

    const logEntry = {
        id: Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        type: type,
        message: message,
        data: data
    };

    logs.unshift(logEntry);

    // Keep only last MAX_LOGS entries
    if (logs.length > MAX_LOGS) {
        logs = logs.slice(0, MAX_LOGS);
    }

    updateLogDisplay();
    updateEventCount();
}

function updateLogDisplay() {
    const logContainer = document.getElementById('logContainer');

    if (logs.length === 0) {
        logContainer.innerHTML = '<div class="log-empty">No events yet. Open and play a video to see analytics!</div>';
        return;
    }

    logContainer.innerHTML = logs.map(log => {
        const cssClass = log.type === 'error' ? 'error' : '';
        const icon = getLogIcon(log.type);
        const dataStr = log.data ? `<br><small>${JSON.stringify(log.data)}</small>` : '';

        return `
            <div class="log-entry ${cssClass}">
                ${icon} [${log.timestamp}] ${log.message}${dataStr}
            </div>
        `;
    }).join('');

    // Auto-scroll to top
    logContainer.scrollTop = 0;
}

function getLogIcon(type) {
    switch (type) {
        case 'success': return '✅';
        case 'error': return '❌';
        case 'warning': return '⚠️';
        case 'info':
        default: return 'ℹ️';
    }
}

// ========================================================================
// MOCK AVPLAY (for non-Tizen environments)
// ========================================================================
function createMockAVPlay() {
    console.log('⚠️ Creating mock AVPlay for testing...');

    let mockState = {
        currentTime: 0,
        duration: 300000, // 5 minutes in ms
        isPlaying: false,
        listener: {}
    };

    let mockTimer = null;

    const mockAVPlay = {
        open: (url) => {
            console.log('[Mock AVPlay] open:', url);
            mockState.currentTime = 0;
        },

        prepareAsync: (successCallback, errorCallback) => {
            console.log('[Mock AVPlay] prepareAsync');
            setTimeout(() => {
                if (successCallback) successCallback();
            }, 500);
        },

        play: () => {
            console.log('[Mock AVPlay] play');
            mockState.isPlaying = true;

            // Simulate time updates
            mockTimer = setInterval(() => {
                mockState.currentTime += 1000;
                if (mockState.listener.oncurrentplaytime) {
                    mockState.listener.oncurrentplaytime(mockState.currentTime);
                }

                // Simulate completion
                if (mockState.currentTime >= mockState.duration) {
                    mockAVPlay.stop();
                    if (mockState.listener.onstreamcompleted) {
                        mockState.listener.onstreamcompleted();
                    }
                }
            }, 1000);
        },

        pause: () => {
            console.log('[Mock AVPlay] pause');
            mockState.isPlaying = false;
            if (mockTimer) {
                clearInterval(mockTimer);
                mockTimer = null;
            }
        },

        stop: () => {
            console.log('[Mock AVPlay] stop');
            mockState.isPlaying = false;
            mockState.currentTime = 0;
            if (mockTimer) {
                clearInterval(mockTimer);
                mockTimer = null;
            }
        },

        close: () => {
            console.log('[Mock AVPlay] close');
            mockAVPlay.stop();
        },

        seekTo: (position, callback) => {
            console.log('[Mock AVPlay] seekTo:', position);
            mockState.currentTime = position;
            if (callback) {
                setTimeout(callback, 200);
            }
        },

        getCurrentTime: () => {
            return mockState.currentTime;
        },

        getDuration: () => {
            return mockState.duration;
        },

        setListener: (listener) => {
            console.log('[Mock AVPlay] setListener');
            mockState.listener = listener;
        }
    };

    return mockAVPlay;
}

// Start time display update interval
setInterval(() => {
    if (tracker && tracker.getState().isPlaying) {
        updateTimeDisplay();
    }
}, 500);
