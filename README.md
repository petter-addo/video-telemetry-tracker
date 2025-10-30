# Tizen Video Telemetry Tracker

Samsung TV web app for AVPlay video playback with New Relic Video telemetry tracking. Features automatic event capture, internet connectivity monitoring, and simple integration.

## 🚀 Quick Start - Simple Example

**Want to get started fast?** Check out the simplified example:

📄 **[`test-avplay-simple.html`](./test-avplay-simple.html)** - Standalone simple example  
📖 **[QUICK-START.md](./QUICK-START.md)** - 1-minute setup guide  
📚 **[SIMPLE-EXAMPLE.md](./SIMPLE-EXAMPLE.md)** - Complete documentation

```bash
npm run build
# Then open test-avplay-simple.html
```

Video URL: **Big Buck Bunny** - https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4

### ⚠️ Important: Video Playback

**AVPlay only works on Tizen TV devices and emulators!**

- 🌐 **Browser** - Uses mock AVPlay (no video, but tracking works)
- 📺 **Tizen TV/Emulator** - Real video playback

**Video not showing?** See **[WHY-NO-VIDEO.md](./WHY-NO-VIDEO.md)** for quick diagnosis.

## Features

- 🎬 Tizen AVPlay video playback (native TV player)
- 📊 Automatic New Relic video telemetry tracking (library-based)
- 🌐 Real-time internet connectivity monitoring
- 📱 Remote control support (play/pause/seek)
- 🎮 Simple, clean UI with event log
- 🧪 Browser testing with mock AVPlay
- ✅ Works on Tizen TV, emulator, and browser

## Quick Start (Web)

### 1. Configure Credentials

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your New Relic credentials from https://one.newrelic.com
```

### 2. Update HTML (only for deployment)

```bash
# Windows
npm run update-html

# Linux/Mac
chmod +x update-credentials.sh && ./update-credentials.sh
```

### 3. Install & Build

```bash
npm install
npm run build
```

### 4. Run

```bash
npm run serve
# Open http://localhost:8000
```

## Configuration

Store credentials in `.env` file:

```env
VITE_NR_ACCOUNT_ID=your_account_id
VITE_NR_TRUST_KEY=your_trust_key
VITE_NR_AGENT_ID=your_agent_id
VITE_NR_LICENSE_KEY=your_license_key
VITE_NR_APPLICATION_ID=your_application_id
```

## View Events in New Relic

Query VideoAction events:

```sql
SELECT * FROM VideoAction 
WHERE contentId = 'big-buck-bunny'
SINCE 1 hour ago
```

### Example Queries

**Play count:**
```sql
SELECT count(*) FROM VideoAction 
WHERE actionName = 'CONTENT_START'
SINCE 1 day ago
```

**Average watch time:**
```sql
SELECT average(playhead) FROM VideoAction 
WHERE actionName = 'CONTENT_HEARTBEAT'
SINCE 1 hour ago
```

## 📚 AVPlay Tracker Library

The project includes `AVPlayTracker` - a reusable library for tracking Tizen AVPlay video events.

### Usage

```javascript
import { AVPlayTracker } from './src/video-tizen-js/src/index.js';

// Create tracker
const tracker = new AVPlayTracker({
    player: webapis.avplay,           // Tizen AVPlay player
    contentId: 'my-video',            // Unique video ID
    title: 'My Video Title',          // Human-readable title
    contentSrc: 'https://video.mp4',  // Video URL
    newRelicKey: 'your-license-key',  // New Relic license key
    newRelicAccountId: 'your-account',// New Relic account ID
    enableLogging: true,              // Enable console logs
    heartbeatInterval: 10000          // Heartbeat interval (ms)
});

// Initialize
tracker.init();

// Open and prepare video
await tracker.open('https://video.mp4');

// Play (all events tracked automatically!)
tracker.play();

// Pause
tracker.pause();

// Seek
tracker.seekTo(position_in_milliseconds);

// Stop
tracker.stop();

// Cleanup
tracker.close();
```

### What Gets Tracked Automatically

- ✅ `play` - Playback started
- ✅ `pause` - Playback paused
- ✅ `seekStart` / `seekEnd` - Seeking events
- ✅ `bufferingstart` / `bufferingcomplete` - Buffer events
- ✅ `streamcompleted` - Video finished
- ✅ `timeupdate` - Heartbeat (every 10s by default)
- ✅ `error` - Playback errors with details

All events include:
- Session ID
- Playback position (playhead)
- Video duration
- Content metadata
- Timestamps

See **[SIMPLE-EXAMPLE.md](./SIMPLE-EXAMPLE.md)** for detailed documentation.

## Tracked Events

- CONTENT_REQUEST - Video requested
- CONTENT_START - Playback started
- CONTENT_PAUSE/RESUME - Pause/resume
- CONTENT_END - Playback completed
- CONTENT_SEEK_START/END - Seeking
- CONTENT_BUFFER_START/END - Buffering
- ERROR - Playback errors

## File Structure

```
├── src/main.js           # Source code with New Relic tracker
├── js/main.js            # Compiled bundle (generated)
├── index.html            # Main HTML with Browser Agent
├── .env                  # Your credentials (not in git)
├── .env.example          # Template
├── webpack.config.js     # Build config
└── package.json          # Dependencies
```

## Scripts

```bash
npm run build      # Production build
npm run build:dev  # Development build
npm run watch      # Watch mode
npm run update-html # Update HTML with .env credentials
npm run serve      # Start HTTP server
```

## Security

- Never commit `.env` file
- Use `.env.example` as template
- HTML contains placeholder credentials (XXXX)
- Run `update-credentials.ps1` to inject real credentials
- Credentials compiled into JS bundle at build time

## Tizen (Emulator + TV)

Short version using VS Code “tizend extension”:

1) Build
```bash
npm install
npm run build
```

2) Start emulator (VS Code → tizend extension)
- Install the “tizend extension” in VS Code
- Open its panel → Create/Launch a TV emulator (choose a TV image)

3) Run the app on emulator (VS Code → tizend extension)
- With this folder open, use the extension to run/deploy the web app to the running emulator
- Ensure `config.xml` has internet privilege (already included)

Notes
- Autoplay is blocked: click the Start overlay or press OK/Enter on the remote
- Remote keys: OK/Enter = play/pause, Left/Right = ±10s seek
- Emulator networks can block external media/CDNs. If video won’t load, place a small MP4 at `videos/local.mp4` (H.264/AAC) — the app will auto-fallback to it

## Troubleshooting

### Quick Debug

**Three test pages included:**
1. **test-simple.html** - Basic video test (no libraries)
2. **test-tracker.html** - Tracker library test
3. **index.html** - Full application

**Deploy them in order to find where the issue is.**

📖 **See [TIZEN-DEBUG.md](TIZEN-DEBUG.md) for complete debugging guide**

### Debug on Tizen TV

Enable remote inspector:
```bash
# On TV: Apps → 12345 → Enable Developer Mode
# On Chrome: chrome://inspect → Add TV IP:9222
```

Check debug info in console:
```javascript
console.log(window.debugInfo)
```

### Debug Test Pages

Use these test pages to diagnose Tizen TV issues:

**1. Simple Video Test (No dependencies):**
```bash
# Open test-simple.html in Tizen
# Tests basic video playback without any libraries
```

**2. Tracker Test (With New Relic libs):**
```bash
# Open test-tracker.html in Tizen
# Tests if the compiled tracker loads
```

### Tizen Emulator Issues

**App works on web but not on Tizen emulator:**
- Emulator may block external CDN resources (New Relic agent)
- Rebuild with ES5 compatibility: `npm run build`
- The app logs events in the UI even if New Relic is blocked
- Try a local file fallback at `videos/local.mp4`
- Test on a real TV for full functionality

**Testing Steps:**
1. Deploy `test-simple.html` first - Tests basic video
2. If video plays: Deploy `test-tracker.html` - Tests tracker library
3. If tracker works: Deploy `index.html` - Full app
4. Check console logs on each step

**Common console errors in emulator:**
- "New Relic agent failed to load" - Expected, app will work without it
- "CORS error" - Network restrictions in emulator
- "Uncaught ReferenceError" - JavaScript compatibility issue
- Events will still be tracked in the UI event log

**Debugging on Tizen TV:**
1. Enable Developer Mode on TV
2. Connect via Chrome Remote Inspector: `chrome://inspect`
3. Check console for actual errors
4. Use test pages to isolate the issue

**To test without New Relic:**
- The app gracefully degrades if New Relic isn't available
- All events are logged in the UI's "Telemetry Event Log" section
- Video playback and milestone tracking will work normally

### Known Tizen Limitations

- External CDN scripts may be blocked in emulator
- Webpack bundles must be ES5 compatible
- Some modern JavaScript features need polyfills
- Network requests may be restricted in emulator

## License

Apache-2.0
