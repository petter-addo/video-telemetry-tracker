// ========================================================================
// CONFIGURATION
// ========================================================================
const TELEMETRY_ENDPOINT = 'https://your.telemetry.server/track';
const MAX_LOGS = 10;

// ========================================================================
// STATE
// ========================================================================
let logs = [];
let milestonesTracked = [false, false, false]; // 25%, 50%, 75%

// ========================================================================
// DOM ELEMENTS
// ========================================================================
const video = document.getElementById('myVideoPlayer');
const statusValue = document.getElementById('statusValue');
const eventsCount = document.getElementById('eventsCount');
const logContent = document.getElementById('logContent');
const milestone25 = document.getElementById('milestone25');
const milestone50 = document.getElementById('milestone50');
const milestone75 = document.getElementById('milestone75');

// ========================================================================
// TELEMETRY SERVICE
// ========================================================================
function sendTelemetry(eventName) {
    const data = {
        event: eventName,
        video_url: video.src,
        position: Math.round(video.currentTime * 100) / 100,
        duration: Math.round(video.duration * 100) / 100,
        timestamp: new Date().toISOString()
    };

    // Log to console
    console.log('📡 Telemetry Event:', data);

    // Add to UI log
    addLog(eventName, video.currentTime);

    // Send to server (uncomment for production)
    /*
    fetch(TELEMETRY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .catch(error => console.error('Telemetry send failed:', error));
    */
}

// ========================================================================
// LOG MANAGEMENT
// ========================================================================
function addLog(eventName, position) {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = {
        id: Date.now(),
        timestamp: timestamp,
        event: eventName,
        position: Math.round(position)
    };

    logs.unshift(logEntry);
    if (logs.length > MAX_LOGS) {
        logs = logs.slice(0, MAX_LOGS);
    }

    updateLogDisplay();
    updateEventsCount();
}

function updateLogDisplay() {
    if (logs.length === 0) {
        logContent.innerHTML = '<div class="log-empty">No events tracked yet. Start playing the video!</div>';
    } else {
        logContent.innerHTML = logs.map(log => 
            `<div class="log-entry">[${log.timestamp}] ${log.event} - Position: ${log.position}s</div>`
        ).join('');
    }
}

function updateEventsCount() {
    eventsCount.textContent = logs.length;
}

// ========================================================================
// VIDEO EVENT HANDLERS
// ========================================================================

// Play event
video.addEventListener('play', () => {
    sendTelemetry('play_start');
    statusValue.textContent = '▶️ Playing';
});

// Pause event
video.addEventListener('pause', () => {
    sendTelemetry('pause');
    statusValue.textContent = '⏸️ Paused';
});

// Ended event
video.addEventListener('ended', () => {
    sendTelemetry('complete');
    statusValue.textContent = '⏸️ Paused';
});

// Time update event (for milestone tracking)
video.addEventListener('timeupdate', () => {
    if (!video.duration || video.duration === 0) return;

    const percentage = (video.currentTime / video.duration) * 100;

    // Check 25% milestone
    if (percentage >= 25 && !milestonesTracked[0]) {
        sendTelemetry('quarter_play');
        milestonesTracked[0] = true;
        milestone25.classList.add('active');
    }
    // Check 50% milestone
    else if (percentage >= 50 && !milestonesTracked[1]) {
        sendTelemetry('half_play');
        milestonesTracked[1] = true;
        milestone50.classList.add('active');
    }
    // Check 75% milestone
    else if (percentage >= 75 && !milestonesTracked[2]) {
        sendTelemetry('three_quarter_play');
        milestonesTracked[2] = true;
        milestone75.classList.add('active');
    }
});

// Error event
video.addEventListener('error', () => {
    sendTelemetry('playback_failure');
    statusValue.textContent = '❌ Error';
});

// Seeking event
video.addEventListener('seeking', () => {
    sendTelemetry('seek_start');
});

// Seeked event
video.addEventListener('seeked', () => {
    sendTelemetry('seek_end');
});

// Loaded metadata event (reset tracking)
video.addEventListener('loadedmetadata', () => {
    milestonesTracked = [false, false, false];
    logs = [];
    updateLogDisplay();
    updateEventsCount();
    milestone25.classList.remove('active');
    milestone50.classList.remove('active');
    milestone75.classList.remove('active');
});

// ========================================================================
// TIZEN SPECIFIC INITIALIZATION
// ========================================================================
window.onload = function() {
    // Add eventListener for tizenhwkey
    document.addEventListener('tizenhwkey', function(e) {
        if (e.keyName === "back") {
            try {
                tizen.application.getCurrentApplication().exit();
            } catch (ignore) {}
        }
    });

    // Initialize video telemetry tracker
    console.log('✅ Tizen Video Telemetry Tracker Initialized');
    console.log('📺 Video Source:', video.src);
};