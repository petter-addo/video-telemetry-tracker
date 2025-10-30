# video-tizen-js

> 🎬 Tizen AVPlay video analytics tracker for New Relic

A lightweight JavaScript library for tracking video playback on Samsung Tizen Smart TVs using the AVPlay API. Replicates the functionality of [@newrelic/video-html5-js](https://github.com/newrelic/video-html5-js) but designed specifically for Tizen's `webapis.avplay`.

[![Tizen](https://img.shields.io/badge/Tizen-6.0%2B-blue)](https://developer.samsung.com/smarttv/develop/specifications/tv-model-groups.html)

## ✨ Features

- 📊 **Complete playback tracking** - play, pause, seek, buffer, errors, completion
- 📡 **New Relic integration** - Send telemetry to New Relic Browser Agent or Insights API
- 🎯 **AVPlay native support** - Built specifically for Tizen's webapis.avplay
- 🔄 **Automatic heartbeats** - Periodic playback position tracking
- 📦 **Batching support** - Efficient event batching with retry logic
- 🪶 **Lightweight** - < 50KB, zero dependencies, plain ES6
- 🐛 **Debug-friendly** - Comprehensive logging and state inspection

## 📦 Installation

### NPM (recommended)

```bash
npm install video-tizen-js
```

### Direct Download

Download the latest release from [GitHub Releases](https://github.com/petter-addo/video-telemetry-tracker/releases) and copy the `src/` folder to your project.

### CDN (for quick testing)

```html
<script type="module">
  import { AVPlayTracker } from 'https://cdn.example.com/video-tizen-js/1.0.0/avplay-tracker.js';
</script>
```

## 🚀 Quick Start

### Basic Usage

```javascript
import { AVPlayTracker } from 'video-tizen-js';

// Initialize the tracker
const tracker = new AVPlayTracker({
  player: webapis.avplay,
  contentId: 'demo001',
  title: 'My Video Title',
  newRelicKey: 'YOUR_NEW_RELIC_LICENSE_KEY',
  newRelicAccountId: 'YOUR_ACCOUNT_ID'
});

// Initialize callbacks
tracker.init();

// Open and play video
await tracker.open('https://example.com/video.mp4');
tracker.play();

// Control playback
tracker.pause();
tracker.seekTo(30000); // Seek to 30 seconds (in milliseconds)
tracker.stop();

// Clean up
tracker.destroy();
```

### With New Relic Browser Agent

If you have the New Relic Browser Agent loaded, events will automatically be sent using `newrelic.addPageAction()`:

```html
<!-- Load New Relic Browser Agent -->
<script src="https://js-agent.newrelic.com/nr-loader-spa-current.min.js"></script>

<script type="module">
  import { AVPlayTracker } from 'video-tizen-js';

  const tracker = new AVPlayTracker({
    player: webapis.avplay,
    contentId: 'video123',
    title: 'Awesome Video',
    // No need for newRelicKey if Browser Agent is loaded
  });

  tracker.init();
</script>
```

## ⚙️ Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `player` | Object | **required** | The `webapis.avplay` instance |
| `contentId` | String | `''` | Unique identifier for the video content |
| `title` | String | `''` | Human-readable video title |
| `contentSrc` | String | `''` | Video source URL |
| `newRelicKey` | String | `''` | New Relic License Key (for Insights API) |
| `newRelicAccountId` | String | `''` | New Relic Account ID (for Insights API) |
| `customEndpoint` | String | `null` | Custom endpoint for telemetry (overrides New Relic) |
| `enableBatching` | Boolean | `false` | Enable event batching before sending |
| `batchSize` | Number | `10` | Number of events to batch before sending |
| `batchTimeout` | Number | `5000` | Max time (ms) to wait before flushing batch |
| `heartbeatInterval` | Number | `10000` | Interval (ms) for heartbeat events |
| `enableLogging` | Boolean | `true` | Enable console logging |
| `autoTrackPlayhead` | Boolean | `true` | Automatically track playhead position |

## 📊 Events Tracked

All events are sent to New Relic with the `VideoAction` event type:

| Event | Description | Triggered By |
|-------|-------------|--------------|
| `play` | Playback started | `tracker.play()` or AVPlay callback |
| `pause` | Playback paused | `tracker.pause()` or AVPlay callback |
| `bufferStart` | Buffering started | AVPlay `onbufferingstart` |
| `bufferEnd` | Buffering completed | AVPlay `onbufferingcomplete` |
| `seekStart` | Seek operation started | `tracker.seekTo()` |
| `seekEnd` | Seek operation completed | AVPlay seek callback |
| `end` | Playback completed | AVPlay `onstreamcompleted` |
| `error` | Playback error occurred | AVPlay `onerror` |
| `heartbeat` | Periodic position update | Automatic (every `heartbeatInterval`) |

## 📈 Viewing Analytics in New Relic

Query your video analytics using NRQL:

```sql
-- All video events from the last hour
SELECT * FROM VideoAction SINCE 1 hour ago

-- Play events by content
SELECT count(*) FROM VideoAction 
WHERE actionName = 'play' 
FACET contentTitle 
SINCE 1 day ago

-- Average buffer duration
SELECT average(bufferDuration) FROM VideoAction 
WHERE actionName = 'bufferEnd' 
SINCE 1 hour ago

-- Errors by type
SELECT count(*) FROM VideoAction 
WHERE actionName = 'error' 
FACET errorCode 
SINCE 1 day ago

-- Playback completion rate
SELECT 
  (filter(count(*), WHERE actionName = 'end') / 
   filter(count(*), WHERE actionName = 'play')) * 100 as completionRate
FROM VideoAction 
SINCE 1 day ago
```

## 🔧 API Reference

### `AVPlayTracker`

Main tracker class for monitoring AVPlay playback.

#### Constructor

```javascript
new AVPlayTracker(config)
```

#### Methods

##### `init()`

Initialize the tracker and register AVPlay callbacks.

```javascript
tracker.init();
```

##### `open(url)`

Open a video URL for playback.

```javascript
await tracker.open('https://example.com/video.mp4');
```

##### `play()`

Start video playback.

```javascript
tracker.play();
```

##### `pause()`

Pause video playback.

```javascript
tracker.pause();
```

##### `seekTo(position)`

Seek to a specific position (in milliseconds).

```javascript
tracker.seekTo(60000); // Seek to 1 minute
```

##### `stop()`

Stop playback and reset state.

```javascript
tracker.stop();
```

##### `close()`

Close the player and clean up resources.

```javascript
tracker.close();
```

##### `getState()`

Get current tracker state.

```javascript
const state = tracker.getState();
console.log(state);
/*
{
  sessionId: 'avplay-1234567890-abc123',
  isInitialized: true,
  isPlaying: true,
  isPaused: false,
  currentTime: 45.2,
  duration: 180.5,
  ...
}
*/
```

##### `destroy()`

Destroy the tracker instance and clean up all resources.

```javascript
tracker.destroy();
```

## 📘 Data Model

See [DATAMODEL.md](./DATAMODEL.md) for complete event schema and attribute definitions.

## 🎯 Use Cases

### E-commerce Analytics

Track product video views and engagement:

```javascript
const tracker = new AVPlayTracker({
  player: webapis.avplay,
  contentId: `product-${productId}`,
  title: productName,
  newRelicKey: NR_KEY,
  customAttributes: {
    productCategory: 'electronics',
    price: 299.99,
    userId: currentUserId
  }
});
```

### Content Recommendations

Track viewing patterns for personalized recommendations:

```javascript
const tracker = new AVPlayTracker({
  player: webapis.avplay,
  contentId: videoId,
  title: videoTitle,
  newRelicKey: NR_KEY,
  heartbeatInterval: 5000, // Frequent updates for ML
  customAttributes: {
    genre: 'action',
    releaseYear: 2024
  }
});
```

### Quality Monitoring

Monitor playback quality and buffering issues:

```javascript
const tracker = new AVPlayTracker({
  player: webapis.avplay,
  contentId: videoId,
  title: videoTitle,
  newRelicKey: NR_KEY,
  customAttributes: {
    cdn: 'cloudflare',
    connectionType: getConnectionType(),
    deviceModel: tizen.systeminfo.getCapability('http://tizen.org/feature/platform.version')
  }
});
```

## 🧪 Testing

### Unit Tests

```bash
npm test
```

### Manual Testing

Use the included sample app:

```bash
cd examples/sample-tizen-app
python -m http.server 8000
# Open http://localhost:8000
```

### Tizen Emulator Testing

1. Install [Tizen Studio](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html)
2. Launch Tizen TV Emulator
3. Deploy the sample app
4. Test with real AVPlay APIs

## 📱 Compatibility

- ✅ Tizen 6.0+ (recommended)
- ✅ Tizen 5.5
- ✅ Tizen 5.0
- ⚠️ Tizen 4.0 (limited support)

Tested on:
- Samsung Smart TV (2020-2024 models)
- Tizen TV Emulator

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) first.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

MIT License - see [LICENSE](./LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by [@newrelic/video-html5-js](https://github.com/newrelic/video-html5-js)
- Built for the Samsung Tizen developer community
- Thanks to all contributors

## 📞 Support

- 📧 Email: [email protected]
- 🐛 Issues: [GitHub Issues](https://github.com/petter-addo/video-telemetry-tracker/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/petter-addo/video-telemetry-tracker/discussions)
- 📚 Docs: [Full Documentation](https://github.com/petter-addo/video-telemetry-tracker/wiki)

## 🗺️ Roadmap

- [ ] TypeScript definitions
- [ ] Advanced quality metrics (QoE, QoS)
- [ ] DRM support tracking
- [ ] Multi-bitrate stream tracking
- [ ] Offline event queue with persistence
- [ ] React/Vue component wrappers

