/**
 * tests/tracker.test.js
 * Unit tests for video-tizen-js
 * 
 * Run with: node tests/tracker.test.js
 */

import { AVPlayTracker } from '../src/avplay-tracker.js';
import { EventMapper } from '../src/event-mapper.js';
import { Transport } from '../src/transport.js';

// ========================================================================
// MOCK AVPLAY
// ========================================================================
class MockAVPlay {
    constructor() {
        this.state = {
            currentTime: 0,
            duration: 300000, // 5 minutes
            isPlaying: false,
            listener: {}
        };
        this.eventLog = [];
    }

    open(url) {
        this.log('open', { url });
        this.state.currentTime = 0;
    }

    prepareAsync(onSuccess, onError) {
        this.log('prepareAsync');
        setTimeout(() => {
            if (onSuccess) onSuccess();
        }, 10);
    }

    play() {
        this.log('play');
        this.state.isPlaying = true;
    }

    pause() {
        this.log('pause');
        this.state.isPlaying = false;
    }

    stop() {
        this.log('stop');
        this.state.isPlaying = false;
        this.state.currentTime = 0;
    }

    close() {
        this.log('close');
    }

    seekTo(position, callback) {
        this.log('seekTo', { position });
        this.state.currentTime = position;
        if (callback) {
            setTimeout(callback, 10);
        }
    }

    getCurrentTime() {
        return this.state.currentTime;
    }

    getDuration() {
        return this.state.duration;
    }

    setListener(listener) {
        this.log('setListener');
        this.state.listener = listener;
    }

    // Test helpers
    log(method, data) {
        this.eventLog.push({ method, data, timestamp: Date.now() });
    }

    triggerBufferingStart() {
        if (this.state.listener.onbufferingstart) {
            this.state.listener.onbufferingstart();
        }
    }

    triggerBufferingComplete() {
        if (this.state.listener.onbufferingcomplete) {
            this.state.listener.onbufferingcomplete();
        }
    }

    triggerStreamCompleted() {
        if (this.state.listener.onstreamcompleted) {
            this.state.listener.onstreamcompleted();
        }
    }

    triggerError(error) {
        if (this.state.listener.onerror) {
            this.state.listener.onerror(error);
        }
    }

    triggerCurrentPlayTime(time) {
        this.state.currentTime = time;
        if (this.state.listener.oncurrentplaytime) {
            this.state.listener.oncurrentplaytime(time);
        }
    }

    reset() {
        this.eventLog = [];
        this.state.currentTime = 0;
        this.state.isPlaying = false;
    }
}

// ========================================================================
// TEST FRAMEWORK
// ========================================================================
class TestRunner {
    constructor() {
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
    }

    test(name, fn) {
        this.tests.push({ name, fn });
    }

    async run() {
        console.log('\n🧪 Running video-tizen-js tests...\n');

        for (const test of this.tests) {
            try {
                await test.fn();
                this.passed++;
                console.log(`✅ ${test.name}`);
            } catch (error) {
                this.failed++;
                console.error(`❌ ${test.name}`);
                console.error(`   Error: ${error.message}`);
                if (error.stack) {
                    console.error(`   ${error.stack.split('\n')[1]}`);
                }
            }
        }

        console.log(`\n📊 Results: ${this.passed} passed, ${this.failed} failed\n`);
        
        if (this.failed > 0) {
            process.exit(1);
        }
    }
}

// ========================================================================
// ASSERTIONS
// ========================================================================
function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
}

function assertDeepEqual(actual, expected, message) {
    const actualStr = JSON.stringify(actual);
    const expectedStr = JSON.stringify(expected);
    if (actualStr !== expectedStr) {
        throw new Error(message || `Expected ${expectedStr}, got ${actualStr}`);
    }
}

function assertThrows(fn, message) {
    let threw = false;
    try {
        fn();
    } catch (error) {
        threw = true;
    }
    if (!threw) {
        throw new Error(message || 'Expected function to throw');
    }
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ========================================================================
// TESTS
// ========================================================================
const runner = new TestRunner();

// Test 1: EventMapper - Basic event mapping
runner.test('EventMapper maps events correctly', () => {
    const mapper = new EventMapper();
    
    const event = mapper.mapEvent('play', {
        contentId: 'test-001',
        playhead: 10.5
    });

    assertEqual(event.actionName, 'play', 'Action name should be "play"');
    assertEqual(event.contentId, 'test-001', 'Content ID should match');
    assertEqual(event.playhead, 10.5, 'Playhead should match');
    assert(event.timestamp, 'Timestamp should be set');
});

// Test 2: EventMapper - Buffer events
runner.test('EventMapper creates buffer events with duration', () => {
    const mapper = new EventMapper();
    
    const bufferStartTime = Date.now();
    const startEvent = mapper.createBufferEvent(true, { contentId: 'test-001' });
    
    assertEqual(startEvent.actionName, 'bufferStart', 'Should be bufferStart event');
    assert(startEvent.bufferStartTime, 'Buffer start time should be set');

    // Simulate buffer completion
    const endEvent = mapper.createBufferEvent(false, { 
        contentId: 'test-001',
        bufferStartTime: bufferStartTime
    });
    
    assertEqual(endEvent.actionName, 'bufferEnd', 'Should be bufferEnd event');
    assert(endEvent.bufferDuration >= 0, 'Buffer duration should be calculated');
});

// Test 3: EventMapper - Seek events
runner.test('EventMapper creates seek events with delta', () => {
    const mapper = new EventMapper();
    
    const seekStart = mapper.createSeekEvent(true, { playhead: 30 });
    assertEqual(seekStart.actionName, 'seekStart', 'Should be seekStart event');
    assertEqual(seekStart.seekFromPosition, 30, 'Seek from position should match');

    const seekEnd = mapper.createSeekEvent(false, { 
        playhead: 90,
        seekFromPosition: 30
    });
    assertEqual(seekEnd.actionName, 'seekEnd', 'Should be seekEnd event');
    assertEqual(seekEnd.seekToPosition, 90, 'Seek to position should match');
    assertEqual(seekEnd.seekDelta, 60, 'Seek delta should be calculated');
});

// Test 4: EventMapper - Error events
runner.test('EventMapper creates error events with descriptions', () => {
    const mapper = new EventMapper();
    
    const error = mapper.createErrorEvent(
        'PLAYER_ERROR_CONNECTION_FAILED',
        'Network error',
        { contentId: 'test-001' }
    );

    assertEqual(error.actionName, 'error', 'Should be error event');
    assertEqual(error.errorCode, 'PLAYER_ERROR_CONNECTION_FAILED', 'Error code should match');
    assert(error.errorMessage, 'Error message should be set');
    assert(error.severity, 'Severity should be set');
    assertEqual(error.severity, 'critical', `Severity should be critical, got: ${error.severity}`);
});

// Test 5: EventMapper - Session ID generation
runner.test('EventMapper generates unique session IDs', () => {
    const id1 = EventMapper.generateSessionId();
    const id2 = EventMapper.generateSessionId();
    
    assert(id1, 'Session ID 1 should be generated');
    assert(id2, 'Session ID 2 should be generated');
    assert(id1 !== id2, 'Session IDs should be unique');
    assert(id1.startsWith('avplay-'), 'Session ID should have correct prefix');
});

// Test 6: Transport - Endpoint determination
runner.test('Transport determines correct endpoint', () => {
    const transport = new Transport({
        newRelicKey: 'test-key',
        newRelicAccountId: '12345'
    });

    assert(transport.endpoint, 'Endpoint should be set');
    assert(transport.endpoint.includes('insights-collector'), 'Should use Insights API');
});

// Test 7: Transport - Event queuing with batching
runner.test('Transport queues events when batching enabled', async () => {
    const transport = new Transport({
        enableBatching: true,
        batchSize: 3,
        enableLogging: false
    });

    const status1 = transport.getStatus();
    assertEqual(status1.queueSize, 0, 'Queue should be empty initially');

    // Add events (won't send yet)
    await transport.send({ actionName: 'play' });
    await transport.send({ actionName: 'pause' });

    const status2 = transport.getStatus();
    assertEqual(status2.queueSize, 2, 'Queue should have 2 events');
});

// Test 8: AVPlayTracker - Initialization
runner.test('AVPlayTracker initializes correctly', () => {
    const mockPlayer = new MockAVPlay();
    
    const tracker = new AVPlayTracker({
        player: mockPlayer,
        contentId: 'test-001',
        title: 'Test Video',
        enableLogging: false
    });

    tracker.init();

    const state = tracker.getState();
    assert(state.isInitialized, 'Tracker should be initialized');
    assert(state.sessionId, 'Session ID should be set');
    assertEqual(state.isPlaying, false, 'Should not be playing initially');
});

// Test 9: AVPlayTracker - Requires player
runner.test('AVPlayTracker throws without player', () => {
    assertThrows(() => {
        new AVPlayTracker({
            contentId: 'test-001'
        });
    }, 'Should throw when player is missing');
});

// Test 10: AVPlayTracker - Play tracking
runner.test('AVPlayTracker tracks play events', () => {
    const mockPlayer = new MockAVPlay();
    
    const tracker = new AVPlayTracker({
        player: mockPlayer,
        contentId: 'test-001',
        enableLogging: false
    });

    tracker.init();
    tracker.play();

    const state = tracker.getState();
    assert(state.isPlaying, 'Should be playing');
    assertEqual(state.isPaused, false, 'Should not be paused');

    // Check that AVPlay.play was called
    const playEvents = mockPlayer.eventLog.filter(e => e.method === 'play');
    assertEqual(playEvents.length, 1, 'AVPlay.play should be called once');
});

// Test 11: AVPlayTracker - Pause tracking
runner.test('AVPlayTracker tracks pause events', () => {
    const mockPlayer = new MockAVPlay();
    
    const tracker = new AVPlayTracker({
        player: mockPlayer,
        contentId: 'test-001',
        enableLogging: false
    });

    tracker.init();
    tracker.play();
    tracker.pause();

    const state = tracker.getState();
    assertEqual(state.isPlaying, false, 'Should not be playing');
    assert(state.isPaused, 'Should be paused');
});

// Test 12: AVPlayTracker - Seek tracking
runner.test('AVPlayTracker tracks seek events', async () => {
    const mockPlayer = new MockAVPlay();
    
    const tracker = new AVPlayTracker({
        player: mockPlayer,
        contentId: 'test-001',
        enableLogging: false
    });

    tracker.init();
    tracker.seekTo(60000); // 60 seconds in ms

    await sleep(20); // Wait for async callback

    const seekEvents = mockPlayer.eventLog.filter(e => e.method === 'seekTo');
    assertEqual(seekEvents.length, 1, 'AVPlay.seekTo should be called');
    assertEqual(seekEvents[0].data.position, 60000, 'Seek position should match');
});

// Test 13: AVPlayTracker - Buffering callbacks
runner.test('AVPlayTracker handles buffering callbacks', () => {
    const mockPlayer = new MockAVPlay();
    
    const tracker = new AVPlayTracker({
        player: mockPlayer,
        contentId: 'test-001',
        enableLogging: false
    });

    tracker.init();

    // Trigger buffering
    mockPlayer.triggerBufferingStart();
    let state = tracker.getState();
    assert(state.isBuffering, 'Should be buffering');

    // Complete buffering
    mockPlayer.triggerBufferingComplete();
    state = tracker.getState();
    assertEqual(state.isBuffering, false, 'Should not be buffering');
});

// Test 14: AVPlayTracker - Stream completion
runner.test('AVPlayTracker handles stream completion', () => {
    const mockPlayer = new MockAVPlay();
    
    const tracker = new AVPlayTracker({
        player: mockPlayer,
        contentId: 'test-001',
        enableLogging: false
    });

    tracker.init();
    tracker.play();
    mockPlayer.triggerStreamCompleted();

    const state = tracker.getState();
    assertEqual(state.isPlaying, false, 'Should not be playing after completion');
});

// Test 15: AVPlayTracker - Error handling
runner.test('AVPlayTracker handles errors', () => {
    const mockPlayer = new MockAVPlay();
    
    const tracker = new AVPlayTracker({
        player: mockPlayer,
        contentId: 'test-001',
        enableLogging: false
    });

    tracker.init();
    mockPlayer.triggerError('PLAYER_ERROR_CONNECTION_FAILED');

    const state = tracker.getState();
    assert(state.errorCount > 0, 'Error count should be incremented');
});

// Test 16: AVPlayTracker - Current time updates
runner.test('AVPlayTracker tracks current time', () => {
    const mockPlayer = new MockAVPlay();
    
    const tracker = new AVPlayTracker({
        player: mockPlayer,
        contentId: 'test-001',
        enableLogging: false
    });

    tracker.init();
    mockPlayer.triggerCurrentPlayTime(45000); // 45 seconds in ms

    const state = tracker.getState();
    assertEqual(state.currentTime, 45, 'Current time should be 45 seconds');
});

// Test 17: AVPlayTracker - Open video
runner.test('AVPlayTracker opens video correctly', async () => {
    const mockPlayer = new MockAVPlay();
    
    const tracker = new AVPlayTracker({
        player: mockPlayer,
        contentId: 'test-001',
        enableLogging: false
    });

    tracker.init();
    await tracker.open('https://example.com/video.mp4');

    await sleep(20); // Wait for prepareAsync

    const openEvents = mockPlayer.eventLog.filter(e => e.method === 'open');
    assertEqual(openEvents.length, 1, 'AVPlay.open should be called');
    assertEqual(openEvents[0].data.url, 'https://example.com/video.mp4', 'URL should match');
});

// Test 18: AVPlayTracker - Stop playback
runner.test('AVPlayTracker stops playback correctly', () => {
    const mockPlayer = new MockAVPlay();
    
    const tracker = new AVPlayTracker({
        player: mockPlayer,
        contentId: 'test-001',
        enableLogging: false
    });

    tracker.init();
    tracker.play();
    tracker.stop();

    const state = tracker.getState();
    assertEqual(state.isPlaying, false, 'Should not be playing');
    assertEqual(state.isPaused, false, 'Should not be paused');
});

// Test 19: AVPlayTracker - Close and cleanup
runner.test('AVPlayTracker cleans up on close', () => {
    const mockPlayer = new MockAVPlay();
    
    const tracker = new AVPlayTracker({
        player: mockPlayer,
        contentId: 'test-001',
        enableLogging: false
    });

    tracker.init();
    tracker.close();

    const closeEvents = mockPlayer.eventLog.filter(e => e.method === 'close');
    assertEqual(closeEvents.length, 1, 'AVPlay.close should be called');
});

// Test 20: Integration - Full playback session
runner.test('Integration: Full playback session', async () => {
    const mockPlayer = new MockAVPlay();
    
    const tracker = new AVPlayTracker({
        player: mockPlayer,
        contentId: 'test-001',
        title: 'Integration Test Video',
        enableLogging: false,
        heartbeatInterval: 0 // Disable heartbeat for testing
    });

    tracker.init();
    await tracker.open('https://example.com/video.mp4');
    
    await sleep(20);

    tracker.play();
    mockPlayer.triggerCurrentPlayTime(10000);
    
    mockPlayer.triggerBufferingStart();
    await sleep(10);
    mockPlayer.triggerBufferingComplete();
    
    tracker.seekTo(60000);
    await sleep(20);
    
    mockPlayer.triggerStreamCompleted();
    
    tracker.close();

    const state = tracker.getState();
    assertEqual(state.isInitialized, false, 'Should be cleaned up');
    
    assert(mockPlayer.eventLog.length > 0, 'Should have logged events');
});

// ========================================================================
// RUN TESTS
// ========================================================================
runner.run().catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
});
