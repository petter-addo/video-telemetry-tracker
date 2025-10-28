import Html5Tracker from '@newrelic/video-html5';

// ========================================================================
// CONFIGURATION
// ========================================================================
var MAX_LOGS = 10;
var NEW_RELIC_CONFIG = {
    accountID: process.env.VITE_NR_ACCOUNT_ID || '',
    trustKey: process.env.VITE_NR_TRUST_KEY || '',
    agentID: process.env.VITE_NR_AGENT_ID || '',
    licenseKey: process.env.VITE_NR_LICENSE_KEY || '',
    applicationID: process.env.VITE_NR_APPLICATION_ID || ''
};


var DEFAULT_VIDEO_SOURCE = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
var TIZEN_VIDEO_SOURCE = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny_320x180.mp4';

// ========================================================================
// STATE
// ========================================================================
var logs = [];
var milestonesTracked = [false, false, false]; // 25%, 50%, 75%
var videoElement = null;
var tracker = null;
var trackerInitialized = false;
var suppressPointerToggleUntil = 0; // timestamp to temporarily ignore pointer toggles

// ========================================================================
// DOM ELEMENTS
// ========================================================================
var statusValue = null;
var eventsCount = null;
var logContent = null;
var milestone25 = null;
var milestone50 = null;
var milestone75 = null;
var playOverlay = null; // overlay to start playback on TVs with autoplay restrictions
var startButton = null;

// ========================================================================
// HELPER FUNCTIONS
// ========================================================================
function isTizenEnvironment() {
    try {
        return (typeof tizen !== 'undefined') || 
               (navigator && /Tizen|SMART-TV|SMARTTV|Web0S/i.test(navigator.userAgent));
    } catch (e) {
        return false;
    }
}

function addLog(eventName, position) {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = {
        id: Date.now(),
        timestamp: timestamp,
        event: eventName,
        position: Math.round(position * 10) / 10
    };

    logs.unshift(logEntry);
    if (logs.length > MAX_LOGS) {
        logs = logs.slice(0, MAX_LOGS);
    }

    updateLogDisplay();
    updateEventsCount();
}

function updateLogDisplay() {
    if (!logContent) return;
    
    if (logs.length === 0) {
        logContent.innerHTML = '<div class="log-empty">No events tracked yet. Start playing the video!</div>';
    } else {
        logContent.innerHTML = logs.map(log => 
            `<div class="log-entry">[${log.timestamp}] ${log.event} - Position: ${log.position}s</div>`
        ).join('');
    }
}

function updateEventsCount() {
    if (eventsCount) {
        eventsCount.textContent = logs.length;
    }
}

function updateStatus(status) {
    if (statusValue) {
        statusValue.textContent = status;
    }
}

// Human readable video error
function describeVideoError(err) {
    if (!err) return 'Unknown error';
    var code = err.code;
    switch (code) {
        case 1: return 'MEDIA_ERR_ABORTED: fetching process aborted by user';
        case 2: return 'MEDIA_ERR_NETWORK: error occurred when downloading';
        case 3: return 'MEDIA_ERR_DECODE: error occurred when decoding';
        case 4: return 'MEDIA_ERR_SRC_NOT_SUPPORTED: not supported or invalid source';
        default: return 'Unknown error code: ' + code;
    }
}

// Try sources with fallback (useful for emulator network restrictions)
function setVideoSourceWithFallbacks(candidates, onDone) {
    if (!videoElement || !candidates || !candidates.length) {
        if (typeof onDone === 'function') onDone(false, 'No candidates');
        return;
    }
    var idx = 0;
    var timeoutId = null;

    var onLoadedMetadata = function () {
        cleanup();
        console.log('✅ Source loaded:', videoElement.currentSrc || candidates[idx]);
        if (typeof onDone === 'function') onDone(true);
    };
    var onError = function () {
        var srcTried = candidates[idx];
        cleanup();
        console.warn('❌ Failed to load source:', srcTried, videoElement && videoElement.error ? describeVideoError(videoElement.error) : '');
        idx++;
        if (idx < candidates.length) {
            trySource(idx);
        } else {
            if (typeof onDone === 'function') onDone(false, 'All sources failed');
        }
    };

    function cleanup() {
        try { videoElement.removeEventListener('loadedmetadata', onLoadedMetadata); } catch(_){}
        try { videoElement.removeEventListener('error', onError); } catch(_){}
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
    }

    function trySource(i) {
        idx = i;
        var src = candidates[i];
        console.log('↻ Trying source:', src);
        try {
            var sourceEl = videoElement.querySelector('source');
            if (sourceEl) sourceEl.src = src;
            videoElement.src = src;
            videoElement.load();
        } catch (e) {
            console.warn('Setting source failed, skipping:', src, e);
            return onError();
        }

        // Listen for success/failure
        videoElement.addEventListener('loadedmetadata', onLoadedMetadata);
        videoElement.addEventListener('error', onError);

        // Timeout fallback (network stalls)
        timeoutId = setTimeout(function(){
            console.warn('⏱️ Load timeout, switching to next:', src);
            onError();
        }, 7000);
    }

    trySource(0);
}

// Enable simple mouse/touch click-to-toggle for emulator/desktop
function togglePlayPause() {
    if (!videoElement) return;
    try {
        if (videoElement.paused) {
            const p = videoElement.play();
            if (p && typeof p.then === 'function') {
                p.catch((e) => {
                    console.warn('play() was blocked or failed:', e);
                });
            }
        } else {
            videoElement.pause();
        }
    } catch (e) {
        console.warn('togglePlayPause error:', e);
    }
}

// ========================================================================
// NEW RELIC VIDEO TRACKER SETUP
// ========================================================================
function initializeNewRelicTracker() {
    if (!videoElement) {
        console.error('❌ Video element not found');
        return;
    }

    if (trackerInitialized) {
        console.log('ℹ️ Tracker already initialized');
        return;
    }

    // Check if New Relic Browser Agent is available
    if (typeof newrelic === 'undefined' && typeof NREUM === 'undefined') {
        console.warn('⚠️ New Relic Browser Agent not loaded. VideoAction events will not be sent.');
        initializeBasicEventHandlers();
        return;
    }

    try {
        // New Relic video tracker options
        const beacon = process.env.VITE_NR_BEACON || 'bam.nr-data.net';
        const options = {
            // New Relic Browser Agent configuration
            info: {
                beacon: beacon,
                errorBeacon: beacon,
                licenseKey: NEW_RELIC_CONFIG.licenseKey,
                applicationID: NEW_RELIC_CONFIG.applicationID,
                sa: 1
            }
        };

        // Initialize the Html5Tracker
        tracker = new Html5Tracker(videoElement, options);
        trackerInitialized = true;

        console.log('✅ New Relic Video Tracker initialized successfully');
        console.log('📊 VideoAction events will be sent to New Relic');
        console.log('🔍 Query in New Relic: SELECT * FROM VideoAction SINCE 1 hour ago');

        // Add custom event handlers for UI updates
        initializeUIEventHandlers();

    } catch (error) {
        console.error('❌ Error initializing New Relic Video Tracker:', error);
        console.warn('⚠️ Falling back to basic event handlers');
        initializeBasicEventHandlers();
    }
}

// ========================================================================
// UI EVENT HANDLERS (for display only)
// ========================================================================
function initializeUIEventHandlers() {
    if (!videoElement) return;

    // Play event
    videoElement.addEventListener('play', () => {
        addLog('play', videoElement.currentTime);
        updateStatus('▶️ Playing');
    });

    // Playing event (rendering started) — safe to hide overlay now
    videoElement.addEventListener('playing', () => {
        hideStartOverlay();
    });

    // Pause event
    videoElement.addEventListener('pause', () => {
        addLog('pause', videoElement.currentTime);
        updateStatus('⏸️ Paused');
    });

    // Ended event
    videoElement.addEventListener('ended', () => {
        addLog('end', videoElement.currentTime);
        updateStatus('✅ Completed');
    });

    // Time update for milestone tracking
    videoElement.addEventListener('timeupdate', () => {
        if (!videoElement.duration || videoElement.duration === 0) return;

        const percentage = (videoElement.currentTime / videoElement.duration) * 100;

        // Check 25% milestone
        if (percentage >= 25 && !milestonesTracked[0]) {
            addLog('milestone_25%', videoElement.currentTime);
            milestonesTracked[0] = true;
            if (milestone25) milestone25.classList.add('active');
        }
        // Check 50% milestone
        else if (percentage >= 50 && !milestonesTracked[1]) {
            addLog('milestone_50%', videoElement.currentTime);
            milestonesTracked[1] = true;
            if (milestone50) milestone50.classList.add('active');
        }
        // Check 75% milestone
        else if (percentage >= 75 && !milestonesTracked[2]) {
            addLog('milestone_75%', videoElement.currentTime);
            milestonesTracked[2] = true;
            if (milestone75) milestone75.classList.add('active');
        }
    });

    // Error event
    videoElement.addEventListener('error', () => {
        var err = videoElement.error;
        var msg = describeVideoError(err);
        addLog('error: ' + msg, videoElement.currentTime);
        updateStatus('❌ Error: ' + msg);
        console.warn('Video error:', err, 'networkState=', videoElement.networkState, 'readyState=', videoElement.readyState, 'src=', videoElement.currentSrc || videoElement.src);
    });

    // Seeking events
    videoElement.addEventListener('seeking', () => {
        addLog('seeking', videoElement.currentTime);
    });

    videoElement.addEventListener('seeked', () => {
        addLog('seeked', videoElement.currentTime);
    });

    // Loaded metadata event (reset tracking)
    videoElement.addEventListener('loadedmetadata', () => {
        milestonesTracked = [false, false, false];
        logs = [];
        updateLogDisplay();
        updateEventsCount();
        if (milestone25) milestone25.classList.remove('active');
        if (milestone50) milestone50.classList.remove('active');
        if (milestone75) milestone75.classList.remove('active');
        
        addLog('metadata_loaded', 0);
    });

    // Buffer events
    videoElement.addEventListener('waiting', () => {
        addLog('buffering', videoElement.currentTime);
    });

    videoElement.addEventListener('canplay', () => {
        addLog('can_play', videoElement.currentTime);
    });
}

// ========================================================================
// BASIC EVENT HANDLERS (fallback when New Relic is not available)
// ========================================================================
function initializeBasicEventHandlers() {
    console.log('ℹ️ Using basic event handlers (no New Relic tracking)');
    initializeUIEventHandlers();
}

// Try muted autoplay (some Tizen builds allow muted autoplay). Show overlay if it fails.
function tryAutoplayOrShowOverlay() {
    if (!videoElement) return;
    // First attempt: muted autoplay (least likely to be blocked)
    var prevMuted = videoElement.muted;
    videoElement.muted = true;
    var p;
    try {
        p = videoElement.play();
    } catch (e) {
        p = null;
    }
    if (p && typeof p.then === 'function') {
        p.then(function(){
            // Autoplay succeeded; hide overlay on 'playing' event
            suppressPointerToggleUntil = Date.now() + 700;
            updateStatus('▶️ Playing');
        }).catch(function(){
            // Restore previous mute state and show overlay
            videoElement.muted = prevMuted;
            showStartOverlay();
        });
    } else {
        // No promise (older engines) — assume blocked and show overlay
        videoElement.muted = prevMuted;
        showStartOverlay();
    }
}

function showStartOverlay() {
    if (playOverlay) {
        try { playOverlay.classList.remove('hidden'); } catch (_) {}
    }
}

function hideStartOverlay() {
    if (playOverlay) {
        try { playOverlay.classList.add('hidden'); } catch (_) {}
    }
}

function isOverlayVisible() {
    if (!playOverlay) return false;
    try {
        return !playOverlay.classList.contains('hidden');
    } catch (_) {
        return false;
    }
}

function handleStartButtonClick(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    if (!videoElement) return;
    try {
        // Attempt play without re-loading to avoid resetting the element
        suppressPointerToggleUntil = Date.now() + 700; // avoid immediate toggle after user click
        var res = videoElement.play();
        if (res && typeof res.then === 'function') {
            res.then(function(){
                updateStatus('▶️ Playing');
            }).catch(function(err){
                // As a fallback, force muted then try again
                try {
                    videoElement.muted = true;
                    var r2 = videoElement.play();
                    if (r2 && typeof r2.then === 'function') {
                        r2.then(function(){ updateStatus('▶️ Playing (muted)'); });
                    }
                } catch (_) {}
            });
        } else {
            // Older engines: just assume it worked
            updateStatus('▶️ Playing');
        }
    } catch (err) {
        console.warn('⚠️ Start button play() failed:', err);
        showStartOverlay();
    }
}

// ========================================================================
// INITIALIZATION
// ========================================================================
window.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Initializing Tizen Video Telemetry Tracker');

    // Initialize DOM element references
    try {
        videoElement = document.getElementById('myVideoPlayer');
        statusValue = document.getElementById('statusValue');
        eventsCount = document.getElementById('eventsCount');
        logContent = document.getElementById('logContent');
        milestone25 = document.getElementById('milestone25');
        milestone50 = document.getElementById('milestone50');
        milestone75 = document.getElementById('milestone75');
        playOverlay = document.getElementById('playOverlay');
        startButton = document.getElementById('btnStartPlayback');
    } catch (e) {
        console.error('❌ Error initializing DOM elements:', e);
    }

    // Detect Tizen environment
    const _isTizen = isTizenEnvironment();
    if (_isTizen) {
        console.warn('⚠️ Tizen environment detected');
        try {
            document.documentElement.classList.add('tizen');
        } catch (e) {}
    }

    // Set appropriate video source
    if (videoElement) {
        try {
            const primary = _isTizen ? TIZEN_VIDEO_SOURCE : DEFAULT_VIDEO_SOURCE;
            const candidates = Array.from(new Set([
                primary,
                DEFAULT_VIDEO_SOURCE,
                'videos/local.mp4' // Put a small mp4 here for emulator offline tests
            ])).filter(Boolean);

            if (_isTizen) videoElement.setAttribute('preload', 'auto');

            setVideoSourceWithFallbacks(candidates, function(success, reason){
                if (!success) {
                    console.error('❌ All sources failed to load.', reason);
                    showStartOverlay();
                }
            });
        } catch (e) {
            console.error('❌ Error setting video source:', e);
        }

        // Enable mouse/touch click-to-toggle and click-to-seek (bottom bar) for emulator/desktop usage
        try {
            var onPointerToggle = function (e) {
                try {
                    // Debounce toggles shortly after starting playback
                    if (Date.now() < suppressPointerToggleUntil) return;
                    // If start overlay is visible, ignore generic toggle/seek
                    if (isOverlayVisible()) return;
                    // Avoid toggling when interacting with custom controls (e.g., Video.js)
                    if (e && e.target && typeof e.target.closest === 'function') {
                        var inCustomControls = e.target.closest('.vjs-control, .controls, .control-bar');
                        if (inCustomControls) return;
                    }

                    var rect = videoElement.getBoundingClientRect();
                    var cx = (e && (e.clientX != null)) ? e.clientX : (e && e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : null);
                    var cy = (e && (e.clientY != null)) ? e.clientY : (e && e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientY : null);
                    if (cx == null || cy == null) {
                        // Fallback to simple toggle
                        togglePlayPause();
                        return;
                    }

                    // Only act if click is within video bounding box
                    if (cx < rect.left || cx > rect.right || cy < rect.top || cy > rect.bottom) {
                        return;
                    }

                    // Only react when pointer is targeting the actual video element
                    if (e.target !== videoElement) {
                        return;
                    }

                    var withinBottomBar = (cy > (rect.bottom - rect.height * 0.2));
                    if (withinBottomBar && videoElement.duration && videoElement.duration > 0) {
                        // Seek based on horizontal position
                        var ratio = (cx - rect.left) / rect.width;
                        if (ratio < 0) ratio = 0;
                        if (ratio > 1) ratio = 1;
                        var newTime = ratio * videoElement.duration;
                        videoElement.currentTime = newTime;
                        addLog('seek_click', newTime);
                    } else {
                        // Toggle play/pause
                        togglePlayPause();
                    }
                } catch (err) {
                    console.warn('⚠️ pointer toggle failed:', err);
                }
            };

            // Use pointerup/touchend only to avoid duplicate click events toggling twice
            ['pointerup', 'touchend'].forEach(function (evt) {
                videoElement.addEventListener(evt, onPointerToggle, { passive: true });
            });

            // Prevent context menu from interfering
            try {
                videoElement.addEventListener('contextmenu', function (evt) { evt.preventDefault(); }, { passive: false });
            } catch (_) {}
            // Visual hint in emulator/desktop
            try { videoElement.style.cursor = 'pointer'; } catch (_) {}
            console.log('🖱️ Mouse/touch click-to-toggle enabled');
        } catch (e) {
            console.warn('⚠️ Unable to attach click-to-toggle handlers:', e);
        }
    }

    // Remote key controls (OK = toggle; LEFT/RIGHT = seek)
    try {
        document.addEventListener('keydown', function (e) {
            if (!videoElement) return;
            var key = e.key || '';
            var code = e.keyCode || 0;
            // Normalize common remote keys
            var isEnter = key === 'Enter' || code === 13;
            var isPlayPause = key === 'MediaPlayPause' || code === 179;
            var isPlay = key === 'MediaPlay' || code === 415;
            var isPause = key === 'MediaPause' || code === 19;
            var isLeft = key === 'ArrowLeft' || code === 37;
            var isRight = key === 'ArrowRight' || code === 39;

            if (isEnter || isPlayPause) {
                e.preventDefault();
                suppressPointerToggleUntil = Date.now() + 500;
                togglePlayPause();
            } else if (isPlay) {
                e.preventDefault();
                if (videoElement.paused) {
                    try { videoElement.play(); } catch(_){}
                }
            } else if (isPause) {
                e.preventDefault();
                if (!videoElement.paused) videoElement.pause();
            } else if (isLeft || isRight) {
                e.preventDefault();
                var delta = isLeft ? -10 : 10; // seconds
                try {
                    var t = Math.max(0, Math.min((videoElement.currentTime || 0) + delta, videoElement.duration || Number.MAX_SAFE_INTEGER));
                    videoElement.currentTime = t;
                    addLog('remote_seek', t);
                } catch(_){}
            }
        });
    } catch (e) {
        console.warn('⚠️ Remote key handlers unsupported:', e);
    }

    // Wire up the Start overlay button (works with TV mouse click / touch)
    try {
        if (startButton) {
            ['click', 'pointerup', 'touchend'].forEach(function(evt){
                startButton.addEventListener(evt, handleStartButtonClick, { passive: false });
            });
        }
    } catch (e) {
        console.warn('⚠️ Unable to attach start button handlers:', e);
    }

    // Add Tizen hardware key listener
    document.addEventListener('tizenhwkey', function(e) {
        if (e.keyName === "back") {
            try {
                tizen.application.getCurrentApplication().exit();
            } catch (ignore) {}
        }
    });

    // Wait a bit for New Relic Browser Agent to fully load, then initialize tracker
    setTimeout(function() {
        initializeNewRelicTracker();
        // Attempt muted autoplay, else show overlay prompting the user to click
        tryAutoplayOrShowOverlay();
        
        // Expose tracker globally for debugging
        window.videoTracker = tracker;
        window.debugInfo = {
            tracker: tracker,
            videoElement: videoElement,
            trackerInitialized: trackerInitialized,
            isTizen: _isTizen,
            newRelicAvailable: (typeof newrelic !== 'undefined' || typeof NREUM !== 'undefined')
        };
    }, 500);

    console.log('✅ Initialization complete');
    console.log('📊 New Relic Account ID:', NEW_RELIC_CONFIG.accountID);
    console.log('🔍 To view events in New Relic, run: SELECT * FROM VideoAction SINCE 1 hour ago');
    console.log('🐛 Debug info available at: window.debugInfo');
});
