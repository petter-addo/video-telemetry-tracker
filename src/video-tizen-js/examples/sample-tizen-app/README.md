# Sample Tizen App - video-tizen-js Demo

This is a complete demo application showing how to use the `video-tizen-js` library to track video playback on Samsung Tizen Smart TVs with New Relic analytics.

## 📁 Files

- **`index.html`** - Main HTML file with UI
- **`app.js`** - Application logic and tracker initialization
- **`config.js`** - Configuration file (New Relic credentials, video URL, etc.)

## 🚀 Quick Start

### 1. Configure New Relic Credentials

Edit `config.js` and replace the placeholder values with your actual New Relic credentials:

```javascript
export const config = {
    newRelicKey: 'YOUR_NEW_RELIC_LICENSE_KEY',
    newRelicAccountId: 'YOUR_ACCOUNT_ID',
    // ... other settings
};
```

Get your credentials from: https://one.newrelic.com/launcher/nr1-core.settings

### 2. Run on Tizen TV or Emulator

#### Option A: Tizen Studio

1. Open Tizen Studio
2. Create a new Tizen Web Project
3. Copy these files into the project directory
4. Build and run on emulator or real device

#### Option B: Local Development Server

For desktop/browser testing (uses mock AVPlay):

```bash
# Using Python
python -m http.server 8000

# Or using Node.js
npx http-server -p 8000

# Or using PHP
php -S localhost:8000
```

Then open: http://localhost:8000

### 3. Using the Demo

1. **Open Video** - Click to load the demo video
2. **Play/Pause** - Control playback
3. **Seek** - Use ⏪/⏩ buttons or arrow keys
4. **View Analytics** - Watch the event log update in real-time
5. **Check State** - Click "Get State" to see current tracker status

## 🎮 Keyboard Controls

When running on a Tizen TV or with a keyboard:

- **Enter / Play/Pause** - Toggle playback
- **Arrow Left** - Seek backward 10 seconds
- **Arrow Right** - Seek forward 10 seconds
- **Back** - Exit application (Tizen only)

## 📊 New Relic Integration

All playback events are automatically sent to New Relic as `VideoAction` events. To view your analytics:

1. Log in to New Relic
2. Go to Query your data
3. Run this NRQL query:

```sql
SELECT * FROM VideoAction 
WHERE contentId = 'demo-video-001' 
SINCE 1 hour ago
```

### Event Types Tracked

- `play` - Playback started
- `pause` - Playback paused
- `bufferStart` - Buffering started
- `bufferEnd` - Buffering completed
- `seekStart` / `seekEnd` - Seek operations
- `end` - Playback completed
- `error` - Playback errors
- `heartbeat` - Periodic playback position updates

## 🧪 Testing

### Desktop Browser Testing

The demo includes a mock AVPlay implementation for testing on desktop browsers. It simulates:

- Video playback
- Seek operations
- Time updates
- Event callbacks

This allows you to develop and test the integration without a real Tizen device.

### Tizen Emulator

For more realistic testing:

1. Install Tizen Studio
2. Launch Tizen TV Emulator (6.0+)
3. Deploy the app to the emulator
4. Test with real AVPlay APIs

## 📝 Example Usage in Your App

```javascript
import { AVPlayTracker } from 'video-tizen-js';

// Initialize tracker
const tracker = new AVPlayTracker({
    player: webapis.avplay,
    contentId: 'my-video-123',
    title: 'My Awesome Video',
    newRelicKey: 'YOUR_LICENSE_KEY',
    newRelicAccountId: 'YOUR_ACCOUNT_ID',
    enableLogging: true
});

// Initialize callbacks
tracker.init();

// Open video
await tracker.open('https://example.com/video.mp4');

// Control playback
tracker.play();
tracker.pause();
tracker.seekTo(30000); // Seek to 30 seconds (in ms)
tracker.stop();

// Get current state
const state = tracker.getState();
console.log(state);

// Clean up
tracker.destroy();
```

## 🛠️ Customization

### Change Video Source

Edit `config.js`:

```javascript
videoUrl: 'https://your-video-url.mp4'
// or HLS stream:
videoUrl: 'https://your-stream.m3u8'
```

### Adjust Tracking Settings

```javascript
heartbeatInterval: 5000, // Send heartbeat every 5 seconds
enableBatching: true,     // Batch events before sending
batchSize: 20,            // Send after 20 events
```

### Custom Event Attributes

Pass custom attributes when initializing:

```javascript
const tracker = new AVPlayTracker({
    // ... standard config
    customAttributes: {
        userId: 'user123',
        subscriptionTier: 'premium',
        deviceModel: 'Samsung UN55RU7100'
    }
});
```

## 🐛 Debugging

The demo exposes debugging utilities in the browser console:

```javascript
// Access tracker instance
window.videoTracker

// View current state
window.videoTracker.getState()

// Debug info
window.debugInfo
```

Enable verbose logging:

```javascript
const tracker = new AVPlayTracker({
    enableLogging: true,
    // ...
});
```

## 📱 Supported Tizen Versions

- Tizen 6.0+
- Tizen 5.5 (with limited features)
- Tizen 5.0 (with limited features)

## ⚠️ Known Limitations

1. **Emulator Network**: Tizen emulator may have restricted network access. Test on real device for full functionality.
2. **Autoplay**: Some Tizen versions restrict autoplay. User interaction required.
3. **CORS**: Ensure video URLs support CORS for cross-origin requests.

## 📚 Additional Resources

- [Tizen Web API Documentation](https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references.html)
- [New Relic Browser Agent](https://docs.newrelic.com/docs/browser/)
- [video-tizen-js GitHub](https://github.com/petter-addo/video-telemetry-tracker)

## 🤝 Support

For issues or questions:
- GitHub Issues: https://github.com/petter-addo/video-telemetry-tracker/issues
- Documentation: See main README.md

## 📄 License

MIT License - See LICENSE file
