import { AVPlayTracker } from './video-tizen-js/src/index.js';

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

// Allow overriding the media URL from env or querystring for quick tests
var DEFAULT_VIDEO_SOURCE = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';

function getQueryParam(name) {
    try {
        var params = new URLSearchParams(window.location.search || '');
        return params.get(name);
    } catch (_) { return null; }
}

function resolveMediaUrl() {
    // Priority: ?src or ?media > env VITE_MEDIA_URL > env VITE_TIZEN_VIDEO_SOURCE > default
    var qs = getQueryParam('src') || getQueryParam('media');
    if (qs && /^https?:\/\//i.test(qs)) return qs;
    var fromEnv = process.env.VITE_MEDIA_URL || process.env.VITE_TIZEN_VIDEO_SOURCE || '';
    if (fromEnv && /^https?:\/\//i.test(fromEnv)) return fromEnv;
    return DEFAULT_VIDEO_SOURCE; // Use Big Buck Bunny by default
}

var TIZEN_VIDEO_SOURCE = resolveMediaUrl();

// ========================================================================
// STATE
// ========================================================================
var logs = [];
var milestonesTracked = [false, false, false]; // 25%, 50%, 75%
var tracker = null;
var trackerInitialized = false;
var trackerReadyPromise = null;
var suppressPointerToggleUntil = 0;
var isOpening = false;
var isPrepared = false;
var initialOpenPromise = null;

// ========================================================================
// DOM ELEMENTS
// ========================================================================
var statusValue = null;
var eventsCount = null;
var logContent = null;
var milestone25 = null;
var milestone50 = null;
var milestone75 = null;
var playOverlay = null;
var startButton = null;
var netStatusDot = null;
var netStatusLabel = null;

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

function createMockAVPlay() {
    console.log('⚠️ Creating mock AVPlay for browser testing...');

    let mockState = {
        currentTime: 0,
        duration: 300000, // 5 minutes in ms
        isPlaying: false,
        listener: {},
        url: ''
    };

    let mockTimer = null;

    const mockAVPlay = {
        isMock: true, // Mark as mock for detection
        
        open: (url) => {
            console.log('[Mock AVPlay] open:', url);
            mockState.url = url;
            mockState.currentTime = 0;
        },

        prepareAsync: (successCallback, errorCallback) => {
            console.log('[Mock AVPlay] prepareAsync - simulating success');
            setTimeout(() => {
                console.log('[Mock AVPlay] prepareAsync SUCCESS');
                if (successCallback) {
                    successCallback();
                }
            }, 300);
        },

        play: () => {
            console.log('[Mock AVPlay] ▶️ PLAY - Starting simulated playback');
            console.log('[Mock AVPlay] ⚠️ NO VIDEO WILL DISPLAY - This is mock mode');
            mockState.isPlaying = true;

            // Simulate time updates
            mockTimer = setInterval(() => {
                mockState.currentTime += 1000;
                console.log('[Mock AVPlay] Time update:', mockState.currentTime / 1000, 's');
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

        setDisplayRect: (x, y, width, height) => {
            console.log('[Mock AVPlay] setDisplayRect:', x, y, width, height);
        },

        setListener: (listener) => {
            console.log('[Mock AVPlay] setListener');
            mockState.listener = listener;
        },

        getState: () => {
            return mockState.isPlaying ? 'PLAYING' : 'PAUSED';
        }
    };

    return mockAVPlay;
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

// ========================================================================
// NETWORK INDICATOR
// ========================================================================
var CONNECTIVITY_CHECK_URL = 'https://www.google.com/generate_204';
var CONNECTIVITY_CHECK_INTERVAL_MS = 5000; // check every 5s
var CONNECTIVITY_TIMEOUT_MS = 3000; // 3s timeout

function getBoolQueryParam(name) {
    var v = getQueryParam(name);
    if (v === null || v === undefined) return null; // explicit: not provided
    return /^(1|true|yes|on)$/i.test(v);
}

// Decide whether to check general internet or the actual media URL
// Priority: query param > env > default(true)
var MEDIA_CONNECTIVITY_CHECK = (function(){
    var qs = getBoolQueryParam('checkMedia');
    if (qs !== null) return qs;
    var envVal = String(process.env.VITE_CHECK_MEDIA || '').trim();
    if (envVal) return /^(1|true|yes|on)$/i.test(envVal);
    return true; // default to checking the selected media URL for higher fidelity
})();

function checkInternetConnectivity() {
    // Returns a Promise<boolean> indicating if we can reach the check URL
    try {
        var targetUrl = CONNECTIVITY_CHECK_URL;
        // When enabled, try to check reachability of the actual media URL
        if (MEDIA_CONNECTIVITY_CHECK && typeof TIZEN_VIDEO_SOURCE === 'string' && /^https?:\/\//i.test(TIZEN_VIDEO_SOURCE)) {
            targetUrl = TIZEN_VIDEO_SOURCE;
        }

        // Helper to run a timed fetch with given method
        function timedFetch(method) {
            var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
            var timeoutId = null;
            var p = new Promise(function(resolve, reject){
                try {
                    timeoutId = setTimeout(function(){
                        try { controller && controller.abort && controller.abort(); } catch(_) {}
                        reject(new Error('timeout'));
                    }, CONNECTIVITY_TIMEOUT_MS);
                    fetch(targetUrl, {
                        method: method,
                        mode: 'no-cors',
                        cache: 'no-store',
                        signal: controller ? controller.signal : undefined,
                    }).then(function(){
                        resolve(true);
                    }).catch(function(err){
                        reject(err || new Error('fetch failed'));
                    });
                } catch (e) {
                    reject(e);
                }
            });
            return p.finally(function(){ if (timeoutId) clearTimeout(timeoutId); });
        }

        // Try HEAD first; if it fails (some CDNs block HEAD), try a short GET
        return timedFetch('HEAD').catch(function(){
            return timedFetch('GET');
        }).then(function(){
            return true;
        }).catch(function(){
            return false;
        });
    } catch (e) {
        // If fetch not available or something went wrong, fallback to navigator.onLine
        try { return Promise.resolve(!!navigator.onLine); } catch(_) { return Promise.resolve(false); }
    }
}

function updateNetworkDot(isOnline) {
    try {
        if (!netStatusDot) return;
        netStatusDot.classList.toggle('net-dot--online', !!isOnline);
        netStatusDot.classList.toggle('net-dot--offline', !isOnline);
        netStatusDot.title = 'Network: ' + (isOnline ? 'online' : 'offline');
        if (netStatusLabel) {
            netStatusLabel.textContent = isOnline ? 'Online' : 'Offline';
        }
    } catch (e) {
        // ignore
    }
}

function initNetworkIndicator() {
    try {
        netStatusDot = document.getElementById('netStatusDot');
        netStatusLabel = document.getElementById('netStatusLabel');
        if (!netStatusDot) return;

    // Initial active check (log what we're checking)
    console.log('[NetCheck] Mode:', MEDIA_CONNECTIVITY_CHECK ? 'media' : 'internet');
    checkInternetConnectivity().then(updateNetworkDot);

        // Listen to browser online/offline events and trigger an active check for confirmation
        window.addEventListener('online', function() { 
            checkInternetConnectivity().then(updateNetworkDot);
        });
        window.addEventListener('offline', function() { 
            updateNetworkDot(false);
        });

        // Periodic active check (helps emulator/device accurately reflect connectivity)
        setInterval(function(){
            checkInternetConnectivity().then(updateNetworkDot);
        }, CONNECTIVITY_CHECK_INTERVAL_MS);
    } catch (e) {
        // ignore
    }
}

// ========================================================================
// TV WINDOW / RESOURCE MANAGEMENT (prevents Resource Allocation Failure)
// ========================================================================
function hideTVWindowIfPresent() {
    try {
        if (typeof webapis !== 'undefined' && webapis.tvwindow && typeof webapis.tvwindow.hide === 'function') {
            webapis.tvwindow.hide();
            console.log('🪟 TV window hidden to free video resource');
            return true;
        }
    } catch (e) {
        console.warn('⚠️ Failed to hide TV window:', e);
    }
    return false;
}

function showTVWindowIfPresent() {
    try {
        if (typeof webapis !== 'undefined' && webapis.tvwindow && typeof webapis.tvwindow.show === 'function') {
            webapis.tvwindow.show();
            console.log('🪟 TV window shown');
            return true;
        }
    } catch (e) {
        console.warn('⚠️ Failed to show TV window:', e);
    }
    return false;
}

function releaseVideoResources() {
    try {
        if (tracker) {
            console.log('🧹 Releasing AVPlay resources (stop/close)');
            try { tracker.stop && tracker.stop(); } catch (_) {}
            try { tracker.close && tracker.close(); } catch (_) {}
        }
        showTVWindowIfPresent();
    } catch (e) {
        console.warn('⚠️ Failed releasing resources:', e);
    }
}

// ========================================================================
// NEW RELIC VIDEO TRACKER SETUP
// ========================================================================
function initializeNewRelicTracker() {
    if (trackerInitialized) {
        console.log('ℹ️ Tracker already initialized');
        return trackerReadyPromise || Promise.resolve();
    }

    // Create a promise that resolves when tracker is ready
    trackerReadyPromise = new Promise(function(resolveReady){
    try {
        // Check if we're in Tizen environment
        const isTizen = isTizenEnvironment();
        
        console.log('🔍 Environment check - isTizen:', isTizen);
        console.log('🔍 window.tizen:', typeof window.tizen);
        console.log('🔍 webapis available:', typeof webapis !== 'undefined');
        
        // Log ALL available properties on window object that might be Tizen-related
        const tizenProps = Object.keys(window).filter(key => 
            key.toLowerCase().includes('tizen') || 
            key.toLowerCase().includes('webapi') || 
            key.toLowerCase().includes('avplay')
        );
        console.log('🔍 Tizen-related window properties:', tizenProps);
        
        // Check webapis structure if it exists
        if (typeof webapis !== 'undefined') {
            console.log('🔍 webapis properties:', Object.keys(webapis));
            console.log('🔍 webapis.avplay available:', typeof webapis.avplay !== 'undefined');
        }
        
        // Check window.tizen structure if it exists
        if (typeof window.tizen !== 'undefined') {
            console.log('🔍 tizen properties:', Object.keys(window.tizen));
        }
        
        // If webapis.avplay is not available, create mock (even on Tizen emulator)
        if (typeof webapis === 'undefined' || !webapis.avplay) {
            console.warn('⚠️ webapis.avplay not available - creating mock for testing');
            console.warn('⚠️ Video will NOT display, but telemetry will work');
            if (typeof webapis === 'undefined') {
                window.webapis = {};
            }
            window.webapis.avplay = createMockAVPlay();
            console.log('✅ Mock AVPlay created (simulated playback only)');
        } else {
            console.log('✅ Real webapis.avplay detected!');
        }

        console.log('✅ Initializing AVPlayTracker');
        
        // Create tracker (display rect will be set after open() is called)
        tracker = new AVPlayTracker({
            player: webapis.avplay,
            contentId: 'tizen-demo-video',
            title: 'Big Buck Bunny',
            contentSrc: TIZEN_VIDEO_SOURCE,
            newRelicKey: NEW_RELIC_CONFIG.licenseKey,
            newRelicAccountId: NEW_RELIC_CONFIG.accountID,
            enableLogging: true,
            heartbeatInterval: 10000,
            // Optional streaming properties: override via query/env
            streamingProps: (function(){
                var props = {};
                var qCookie = getQueryParam('cookie');
                var qReferer = getQueryParam('referer');
                var qUA = getQueryParam('ua') || getQueryParam('useragent');
                if (process && process.env) {
                    props.COOKIE = qCookie || process.env.VITE_MEDIA_COOKIE || null;
                    props.REFERER = qReferer || process.env.VITE_MEDIA_REFERER || null;
                    props.USER_AGENT = qUA || process.env.VITE_MEDIA_UA || null;
                } else {
                    props.COOKIE = qCookie || null;
                    props.REFERER = qReferer || null;
                    props.USER_AGENT = qUA || null;
                }
                return props;
            })()
        });

        console.log('✅ AVPlayTracker created, calling init()...');
        
        tracker.init();
        console.log('✅ tracker.init() completed successfully');
        
        trackerInitialized = true;

        console.log('✅ AVPlay Video Tracker initialized successfully');
        console.log('📊 VideoAction events will be sent to New Relic');
        console.log('🔍 Query in New Relic: SELECT * FROM VideoAction SINCE 1 hour ago');

        // Add custom event handlers for UI updates
        initializeUIEventHandlers();
        try {
            // Show AVPlay error details in UI when available
            window.addEventListener('avplayError', function(ev){
                var d = ev && ev.detail || {};
                var msg = 'AVPlay Error: ' + (d.errorCode || 'UNKNOWN') + (d.errorMessage ? (' - ' + d.errorMessage) : '');
                console.error('🚨', msg, d);
                updateStatus('❌ ' + msg);
                addLog('error', tracker && tracker.getState ? (tracker.getState().currentTime || 0) : 0);
            });
        } catch (_) {}

        // Resolve when initialization reached
        resolveReady();

    } catch (error) {
        console.error('❌ Error initializing Video Tracker:', error);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        
        // Still mark as initialized if tracker was created
        if (tracker) {
            trackerInitialized = true;
            console.warn('⚠️ Tracker created despite errors, will attempt to use it');
            resolveReady();
        }
    }
    });
    return trackerReadyPromise;
}

// ========================================================================
// UI EVENT HANDLERS (for display only)
// ========================================================================
function initializeUIEventHandlers() {
    // UI updates are now triggered by tracking events from AVPlayTracker
    // The tracker callbacks will update milestones and status
    console.log('✅ UI event handlers ready');
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
    console.log('👁️ Showing play overlay');
    if (playOverlay) {
        try { 
            playOverlay.style.display = 'block';
            playOverlay.classList.remove('hidden'); 
        } catch (_) {}
    }
    
    // Show mock indicator if in browser mode
    const isTizen = isTizenEnvironment();
    if (!isTizen) {
        const mockIndicator = document.getElementById('mockIndicator');
        if (mockIndicator) {
            mockIndicator.style.display = 'block';
        }
    }
}

function hideStartOverlay() {
    console.log('🙈 Hiding play overlay');
    if (playOverlay) {
        try { 
            playOverlay.style.display = 'none';
            playOverlay.classList.add('hidden');
        } catch (_) {}
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
    console.log('▶️▶️▶️ PLAY BUTTON CLICKED! ▶️▶️▶️');
    
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    
    console.log('📊 State check:');
    console.log('  - tracker:', !!tracker);
    console.log('  - isPrepared:', isPrepared);
    console.log('  - isOpening:', isOpening);
    console.log('  - trackerInitialized:', trackerInitialized);
    console.log('  - TIZEN_VIDEO_SOURCE:', TIZEN_VIDEO_SOURCE);
    
    try {
        suppressPointerToggleUntil = Date.now() + 700;
        
        console.log('🔍 Tracker available:', !!tracker);
        if (tracker) {
            try {
                var currentState = tracker.getState();
                console.log('🔍 Tracker state:', currentState);
            } catch (stateErr) {
                console.log('⚠️ Could not get tracker state:', stateErr.message);
            }
        }

        var ensureReady = trackerInitialized ? Promise.resolve() : (trackerReadyPromise || initializeNewRelicTracker());
        ensureReady.then(function(){
            if (!tracker) throw new Error('Tracker not initialized');
            updateStatus('🔄 Preparing player...');
            
            // If already prepared from startup, just play
            if (isPrepared) {
                console.log('✅ Already prepared, calling tracker.play()...');
                updateStatus('▶️ Starting playback...');
                tracker.play();
                console.log('✅ tracker.play() called');
                hideStartOverlay();
                updateStatus('▶️ Playing');
                addLog('play', 0);
                return;
            }

            // If still preparing from startup, wait for it and then play
            if (isOpening && initialOpenPromise) {
                console.log('⏳ Still preparing from initial open; will start when ready');
                updateStatus('⏳ Preparing...');
                initialOpenPromise.then(function(){
                    console.log('✅ Prepared, calling tracker.play()...');
                    updateStatus('▶️ Starting playback...');
                    tracker.play();
                    console.log('✅ tracker.play() called after prepare');
                    hideStartOverlay();
                    updateStatus('▶️ Playing');
                    addLog('play', 0);
                }).catch(function(err){
                    console.error('❌ Initial prepare failed:', err && err.message || err);
                    proceedToOpenWithFallback();
                });
                return;
            }

            // Otherwise open now with one fallback
            console.log('⚠️ Not prepared, opening now...');
            proceedToOpenWithFallback();

            function proceedToOpenWithFallback() {
                updateStatus('🔄 Opening video...');
                console.log('📂 Opening media:', TIZEN_VIDEO_SOURCE);
                var primaryUrl = TIZEN_VIDEO_SOURCE;
                var triedFallback = false;
                function tryOpen(url) {
                    console.log('🔄 Calling tracker.open(' + url + ')...');
                    isOpening = true;
                    return tracker.open(url).then(function(){
                        isPrepared = true;
                        isOpening = false;
                        console.log('✅ Media opened successfully!');
                        console.log('✅ Calling tracker.play()...');
                        updateStatus('▶️ Starting playback...');
                        tracker.play();
                        console.log('✅ tracker.play() called after open');
                        hideStartOverlay();
                        updateStatus('▶️ Playing');
                        addLog('play', 0);
                        console.log('✅ Playback started');
                    }).catch(function(err){
                        isOpening = false;
                        var msg = (err && err.message) || String(err || 'unknown error');
                        console.error('❌ Failed to open media:', msg);
                        // One retry: if https, try http; otherwise try well-known MP4 sample
                        if (!triedFallback) {
                            triedFallback = true;
                            var fallbackUrl = primaryUrl;
                            if (/^https:\/\//i.test(primaryUrl)) {
                                fallbackUrl = primaryUrl.replace(/^https:/i, 'http:');
                                console.warn('⚠️ Retrying with HTTP fallback:', fallbackUrl);
                            } else {
                                fallbackUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
                                console.warn('⚠️ Retrying with known-good MP4:', fallbackUrl);
                            }
                            return tryOpen(fallbackUrl);
                        }
                        updateStatus('❌ Error: ' + msg);
                        alert('Failed to load media: ' + msg);
                        showStartOverlay();
                    });
                }
                tryOpen(primaryUrl);
            }
        }).catch(function(err){
            console.error('❌ Tracker not initialized:', err);
            updateStatus('❌ Error: Tracker not initialized');
            alert('Tracker not initialized!');
        });
    } catch (err) {
        console.error('❌ Start button handler failed:', err);
        updateStatus('❌ Error: ' + err.message);
        alert('Play failed: ' + err.message);
        showStartOverlay();
    }
}

// ========================================================================
// INITIALIZATION
// ========================================================================
window.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Initializing Tizen AVPlay Video Telemetry Tracker');

    // Initialize DOM element references
    try {
        statusValue = document.getElementById('statusValue');
        eventsCount = document.getElementById('eventsCount');
        logContent = document.getElementById('logContent');
        milestone25 = document.getElementById('milestone25');
        milestone50 = document.getElementById('milestone50');
        milestone75 = document.getElementById('milestone75');
        playOverlay = document.getElementById('playOverlay');
        startButton = document.getElementById('btnStartPlayback');
        netStatusDot = document.getElementById('netStatusDot');
        netStatusLabel = document.getElementById('netStatusLabel');
    } catch (e) {
        console.error('❌ Error initializing DOM elements:', e);
    }

    // Initialize network status indicator (supports emulator)
    initNetworkIndicator();

    // Detect Tizen environment
    const _isTizen = isTizenEnvironment();
    if (_isTizen) {
        console.log('✅ Tizen environment detected');
    } else {
        console.warn('⚠️ Tizen environment not detected; will use mock AVPlay');
    }
    console.log('🎯 Media URL:', TIZEN_VIDEO_SOURCE);

    // Remote key controls for AVPlay
    try {
        document.addEventListener('keydown', function (e) {
            var key = e.key || '';
            var code = e.keyCode || 0;
            var isEnter = key === 'Enter' || code === 13;
            var isPlayPause = key === 'MediaPlayPause' || code === 179;
            var isPlay = key === 'MediaPlay' || code === 415;
            var isPause = key === 'MediaPause' || code === 19;
            var isLeft = key === 'ArrowLeft' || code === 37;
            var isRight = key === 'ArrowRight' || code === 39;

            if (!tracker) return;

            if (isEnter || isPlayPause) {
                e.preventDefault();
                var state = tracker.getState();
                if (state.isPlaying) {
                    tracker.pause();
                    updateStatus('⏸️ Paused');
                    addLog('pause', state.currentTime);
                } else {
                    tracker.play();
                    updateStatus('▶️ Playing');
                    addLog('play', state.currentTime);
                }
            } else if (isPlay) {
                e.preventDefault();
                tracker.play();
                updateStatus('▶️ Playing');
            } else if (isPause) {
                e.preventDefault();
                tracker.pause();
                updateStatus('⏸️ Paused');
            } else if (isLeft || isRight) {
                e.preventDefault();
                var delta = isLeft ? -10000 : 10000; // milliseconds
                var currentTime = tracker.getState().currentTime * 1000; // convert to ms
                var newTime = Math.max(0, currentTime + delta);
                tracker.seekTo(newTime);
                addLog('seek', newTime / 1000);
            }
        });
        console.log('✅ Remote control handlers registered');
    } catch (e) {
        console.warn('⚠️ Remote key handlers unsupported:', e);
    }

    // Wire up the Start overlay button
    try {
        if (startButton) {
            try { 
                startButton.disabled = true; 
                startButton.textContent = '▶';
            } catch(_) {}
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
                if (tracker) {
                    tracker.close();
                }
                tizen.application.getCurrentApplication().exit();
            } catch (ignore) {}
        }
    });

    // Wait for webapis to be ready before initializing tracker
    function startApp() {
        console.log('🚀 Starting tracker initialization...');
        console.log('🔍 Pre-init webapis check:');
        console.log('  typeof webapis:', typeof webapis);
        console.log('  typeof window.webapis:', typeof window.webapis);
        console.log('  typeof webapis.avplay:', typeof webapis !== 'undefined' ? typeof webapis.avplay : 'N/A');
        
        if (typeof webapis !== 'undefined' && typeof webapis.avplay !== 'undefined') {
            console.log('  ✅ webapis.avplay methods:', Object.keys(webapis.avplay).slice(0, 10).join(', '));
        }
        
        initializeNewRelicTracker().then(function(){
        
        // Open video with AVPlay
        if (tracker) {
            // Hide TV broadcast window if present to avoid resource conflicts
            hideTVWindowIfPresent();

            console.log('📹 Opening video:', TIZEN_VIDEO_SOURCE);
            isOpening = true;
            initialOpenPromise = tracker.open(TIZEN_VIDEO_SOURCE).then(() => {
                isPrepared = true;
                isOpening = false;
                console.log('✅ Video opened with AVPlay successfully!');
                console.log('📺 Video should now be visible on screen');
                console.log('🎮 Click play button to start playback');
                try { 
                    if (startButton) { 
                        startButton.disabled = false; 
                        startButton.textContent = '▶'; 
                    }
                } catch(_) {}
            }).catch((err) => {
                isOpening = false;
                console.error('❌ Failed to open video:', err);
                console.error('Error details:', err.message, err.stack);
                alert('Failed to open video: ' + (err.message || err));
                try { 
                    if (startButton) { 
                        startButton.disabled = false; 
                        startButton.textContent = '▶'; 
                    }
                } catch(_) {}
            });
        } else {
            console.error('❌ Tracker not initialized!');
            alert('Tracker not initialized!');
            try { 
                if (startButton) { 
                    startButton.disabled = false; 
                    startButton.textContent = '▶'; 
                }
            } catch(_) {}
        }
        }).catch(function(err){
            console.error('❌ Tracker initialization failed:', err);
            try { 
                if (startButton) { 
                    startButton.disabled = false; 
                    startButton.textContent = '▶'; 
                }
            } catch(_) {}
        });
        
        // Expose tracker globally for debugging
        window.videoTracker = tracker;
        window.debugInfo = {
            tracker: tracker,
            trackerInitialized: trackerInitialized,
            isTizen: _isTizen,
            newRelicAvailable: (typeof newrelic !== 'undefined' || typeof NREUM !== 'undefined'),
            avplayAvailable: (typeof webapis !== 'undefined' && typeof webapis.avplay !== 'undefined')
        };
        console.log('🐛 Debug info:', window.debugInfo);
        
        console.log('✅ Initialization complete');
        console.log('📊 New Relic Account ID:', NEW_RELIC_CONFIG.accountID);
        console.log('🔍 To view events in New Relic, run: SELECT * FROM VideoAction SINCE 1 hour ago');
        console.log('🐛 Debug info available at: window.debugInfo');
    }

    // Check if webapis already loaded, otherwise wait for event
    if (window.webapisReady) {
        console.log('✅ webapis already loaded, starting app immediately');
        startApp();
    } else {
        console.log('⏳ Waiting for webapis to load...');
        window.addEventListener('webapisready', function() {
            console.log('✅ webapis ready event received');
            startApp();
        });
        // Fallback timeout in case event doesn't fire
        setTimeout(function() {
            console.log('⏰ Fallback timeout triggered');
            startApp();
        }, 1000);
    }

    // Clean up on page hide/unload to free resources
    window.addEventListener('pagehide', releaseVideoResources);
    window.addEventListener('beforeunload', releaseVideoResources);
});
