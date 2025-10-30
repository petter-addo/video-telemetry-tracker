/*
 * Video Tizen AVPlay Manager
 * Safely manages the lifecycle of Tizen webapis.avplay to prevent Resource Allocation Failure errors.
 *
 * Responsibilities:
 * - Automatically allocate, open, prepare, play, pause, resume, and stop video playback
 * - Always deallocate resources when playback is finished, on app exit, or before reinitializing playback
 * - Robust error handling for:
 *   - Resource allocation failure (e.g., locked by tvs-daemon)
 *   - Double initialization
 *   - Missing deallocation (idempotent release)
 *   - Network or invalid URL problems
 * - Logs all actions for debugging
 *
 * Public API (ES modules):
 *   init(url: string): Promise<void>
 *   play(): void
 *   pause(): void
 *   resume(): void
 *   stop(): void
 *   release(): void
 *
 * Example usage:
 *   import AVPlayManager from './video_tizen_avplay_manager.js';
 *   AVPlayManager.init('https://example.com/video.mp4');
 *   AVPlayManager.play();
 */

// Small helper to check AVPlay availability without throwing at import time
function hasAVPlay() {
  try {
    return typeof window !== 'undefined' &&
      typeof window.webapis !== 'undefined' &&
      window.webapis &&
      window.webapis.avplay;
  } catch (_) {
    return false;
  }
}

function isValidUrl(url) {
  try {
    const u = new URL(url);
    return ['http:', 'https:', 'file:'].includes(u.protocol);
  } catch (_) {
    return false;
  }
}

// Internal state for the singleton manager
const _state = {
  url: null,
  allocated: false,
  opened: false,
  prepared: false,
  playing: false,
  paused: false,
  preparingPromise: null,
  listenersSet: false,
  // Avoids overlapping init calls
  initInProgress: false,
};

// Map AVPlay error conditions into readable messages when possible
function normalizeError(err) {
  if (!err) return new Error('Unknown AVPlay error');
  if (err instanceof Error) return err;
  try {
    const msg = typeof err === 'string' ? err : JSON.stringify(err);
    return new Error(msg);
  } catch (_) {
    return new Error(String(err));
  }
}

// Attach AVPlay listeners that help with cleanup and debugging
function attachAvplayListeners() {
  if (!hasAVPlay() || _state.listenersSet) return;

  try {
    // setListener may throw if not supported; wrap in try/catch
    webapis.avplay.setListener({
      onbufferingstart: () => console.log('[AVPlay] buffering start'),
      onbufferingprogress: (p) => console.log('[AVPlay] buffering progress', p),
      onbufferingcomplete: () => console.log('[AVPlay] buffering complete'),
      onstreamcompleted: () => {
        console.log('[AVPlay] stream completed — stopping and releasing');
        // Ensure full cleanup when playback ends
        VideoTizenAVPlayManager.stop();
      },
      onerror: (e) => {
        console.error('[AVPlay] error event', e);
      },
      onevent: (type, data) => console.log('[AVPlay] event', type, data),
      ondrmevent: (type, data) => console.log('[AVPlay] drm event', type, data),
      onsubtitlechange: (duration, text) => console.log('[AVPlay] subtitle', { duration, text }),
      oncaptioninfo: (data) => console.log('[AVPlay] caption info', data),
    });
    _state.listenersSet = true;
  } catch (e) {
    console.warn('[AVPlay] setListener not available or failed:', e);
  }
}

async function doPrepareAsync() {
  if (!hasAVPlay()) throw new Error('Tizen webapis.avplay not available');

  if (_state.prepared) return; // already prepared
  if (_state.preparingPromise) return _state.preparingPromise;

  console.log('[AVPlay] preparing...');
  _state.preparingPromise = new Promise((resolve, reject) => {
    try {
      webapis.avplay.prepareAsync(
        () => {
          console.log('[AVPlay] prepared');
          _state.prepared = true;
          _state.preparingPromise = null;
          resolve();
        },
        (err) => {
          const ne = normalizeError(err);
          console.error('[AVPlay] prepareAsync failed:', ne.message);
          _state.preparingPromise = null;
          reject(ne);
        },
      );
    } catch (e) {
      const ne = normalizeError(e);
      console.error('[AVPlay] prepareAsync threw:', ne.message);
      _state.preparingPromise = null;
      reject(ne);
    }
  });

  return _state.preparingPromise;
}

// Required cleanup sequence to run on every stop/release
function requiredCleanupSequence() {
  if (!hasAVPlay()) return;
  try {
    console.log('[AVPlay] cleanup: stop -> close -> deallocate');
    webapis.avplay.stop();
    webapis.avplay.close();
    webapis.avplay.deallocate();
  } catch (e) {
    console.warn('AVPlay cleanup failed:', e);
  }
}

const VideoTizenAVPlayManager = {
  // Initialize playback pipeline and prepare the stream
  async init(url) {
    if (!hasAVPlay()) {
      const msg = 'Tizen webapis.avplay is not available in this environment';
      console.error('[AVPlay] init error:', msg);
      throw new Error(msg);
    }

    if (!isValidUrl(url)) {
      const msg = `Invalid or unsupported URL: ${url}`;
      console.error('[AVPlay] init error:', msg);
      throw new Error(msg);
    }

    if (_state.initInProgress) {
      console.log('[AVPlay] init already in progress — waiting');
      // Busy-wait for the in-progress init to complete by polling the promise
      // or short delay loop; here we do a minimal delay.
      await new Promise((r) => setTimeout(r, 50));
    }

    // Double initialization protection
    if (_state.allocated || _state.opened || _state.prepared) {
      console.warn('[AVPlay] double initialization detected — releasing previous session');
      this.release();
    }

    _state.initInProgress = true;

    try {
      console.log('[AVPlay] allocate');
      try {
        webapis.avplay.allocate();
        _state.allocated = true;
      } catch (e) {
        const ne = normalizeError(e);
        console.error('[AVPlay] allocate failed:', ne.message);
        // Attempt a forced cleanup in case of stale allocation (e.g., tvs-daemon lock)
        requiredCleanupSequence();
        // Retry once
        try {
          console.log('[AVPlay] allocate retry after cleanup');
          webapis.avplay.allocate();
          _state.allocated = true;
        } catch (e2) {
          const ne2 = normalizeError(e2);
          console.error('[AVPlay] allocate retry failed — possible Resource Allocation Failure (tvs-daemon lock):', ne2.message);
          throw ne2;
        }
      }

      attachAvplayListeners();

      console.log('[AVPlay] open', url);
      try {
        webapis.avplay.open(url);
        _state.opened = true;
        _state.url = url;
      } catch (e) {
        const ne = normalizeError(e);
        console.error('[AVPlay] open failed:', ne.message);
        throw ne;
      }

      await doPrepareAsync();
      console.log('[AVPlay] init complete');
    } finally {
      _state.initInProgress = false;
    }
  },

  // Start playback, preparing if necessary
  async play() {
    if (!hasAVPlay()) {
      console.error('[AVPlay] play error: AVPlay not available');
      return;
    }

    try {
      if (!_state.prepared) {
        if (_state.url) {
          console.log('[AVPlay] play: not prepared — preparing first');
          await doPrepareAsync();
        } else {
          console.warn('[AVPlay] play called before init — nothing to play');
          return;
        }
      }

      console.log('[AVPlay] play');
      webapis.avplay.play();
      _state.playing = true;
      _state.paused = false;
    } catch (e) {
      const ne = normalizeError(e);
      console.error('[AVPlay] play failed:', ne.message);
    }
  },

  // Pause playback if playing
  pause() {
    if (!hasAVPlay()) return;

    try {
      if (_state.playing && !_state.paused) {
        console.log('[AVPlay] pause');
        webapis.avplay.pause();
        _state.paused = true;
        _state.playing = false;
      } else {
        console.log('[AVPlay] pause ignored — not playing');
      }
    } catch (e) {
      console.warn('[AVPlay] pause failed:', e);
    }
  },

  // Resume playback if paused
  resume() {
    if (!hasAVPlay()) return;

    try {
      if (_state.paused && _state.prepared) {
        console.log('[AVPlay] resume');
        webapis.avplay.resume();
        _state.paused = false;
        _state.playing = true;
      } else if (_state.prepared && !_state.playing) {
        console.log('[AVPlay] resume fallback — calling play');
        webapis.avplay.play();
        _state.playing = true;
        _state.paused = false;
      } else {
        console.log('[AVPlay] resume ignored — not paused or not prepared');
      }
    } catch (e) {
      console.warn('[AVPlay] resume failed:', e);
    }
  },

  // Stop playback and fully release resources (idempotent)
  stop() {
    if (!hasAVPlay()) {
      // Still reset our internal state to be safe even if AVPlay missing
      this._resetState();
      return;
    }

    console.log('[AVPlay] stop requested');
    requiredCleanupSequence();
    this._resetState();
  },

  // Full release (alias for stop) — safe to call multiple times
  release() {
    if (!hasAVPlay()) {
      this._resetState();
      return;
    }

    console.log('[AVPlay] release requested');
    requiredCleanupSequence();
    this._resetState();
  },

  // Internal helper to reset state
  _resetState() {
    _state.url = null;
    _state.allocated = false;
    _state.opened = false;
    _state.prepared = false;
    _state.playing = false;
    _state.paused = false;
    _state.preparingPromise = null;
    console.log('[AVPlay] state reset');
  },
};

// App lifecycle listeners: release on exit, pause/resume on visibility
if (typeof window !== 'undefined') {
  try {
    window.addEventListener('beforeunload', VideoTizenAVPlayManager.release);
  } catch (e) {
    // ignore
  }
}

if (typeof document !== 'undefined') {
  try {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) VideoTizenAVPlayManager.pause();
      else VideoTizenAVPlayManager.resume();
    });
  } catch (e) {
    // ignore
  }
}

export default VideoTizenAVPlayManager;
