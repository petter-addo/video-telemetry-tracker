# Data Model - New Relic VideoAction Schema

This document describes the data model for video telemetry events sent to New Relic. All events are sent as `VideoAction` custom events and can be queried using NRQL.

## Event Schema

### Base Attributes

All `VideoAction` events include these base attributes:

| Attribute | Type | Description | Example |
|-----------|------|-------------|---------|
| `actionName` | String | The type of video action | `play`, `pause`, `bufferStart`, `end` |
| `contentId` | String | Unique identifier for the video content | `demo-video-001` |
| `contentSrc` | String | URL of the video source | `https://example.com/video.mp4` |
| `contentTitle` | String | Human-readable title of the video | `Big Buck Bunny` |
| `duration` | Number | Total duration of the video in seconds | `596.5` |
| `playhead` | Number | Current playback position in seconds | `45.2` |
| `sessionId` | String | Unique session identifier | `avplay-1640995200000-abc123` |
| `timestamp` | String | ISO 8601 timestamp | `2025-10-29T14:30:00.000Z` |
| `playerName` | String | Name of the player | `tizen-avplay` |
| `playerVersion` | String | Version of the tracker library | `1.0.0` |

### Quality Metrics

| Attribute | Type | Description | Example |
|-----------|------|-------------|---------|
| `bitrate` | Number | Current bitrate in bits per second | `2500000` (2.5 Mbps) |
| `resolution` | String | Video resolution | `1920x1080` |
| `renditionWidth` | Number | Video width in pixels | `1920` |
| `renditionHeight` | Number | Video height in pixels | `1080` |

### Playback State

| Attribute | Type | Description | Example |
|-----------|------|-------------|---------|
| `isLive` | Boolean | Whether the stream is live | `false` |
| `isMuted` | Boolean | Whether audio is muted | `false` |
| `playbackRate` | Number | Playback speed multiplier | `1.0` |

## Event Types

### 1. Play Event

Triggered when playback starts.

**Action Name:** `play`

**Example Payload:**

```json
{
  "actionName": "play",
  "contentId": "demo-video-001",
  "contentSrc": "https://example.com/video.mp4",
  "contentTitle": "Big Buck Bunny",
  "duration": 596.5,
  "playhead": 0,
  "sessionId": "avplay-1640995200000-abc123",
  "timestamp": "2025-10-29T14:30:00.000Z",
  "playerName": "tizen-avplay",
  "playerVersion": "1.0.0",
  "bitrate": 2500000,
  "resolution": "1920x1080",
  "isLive": false,
  "isMuted": false,
  "playbackRate": 1.0
}
```

---

### 2. Pause Event

Triggered when playback is paused.

**Action Name:** `pause`

**Example Payload:**

```json
{
  "actionName": "pause",
  "contentId": "demo-video-001",
  "contentSrc": "https://example.com/video.mp4",
  "contentTitle": "Big Buck Bunny",
  "duration": 596.5,
  "playhead": 45.2,
  "sessionId": "avplay-1640995200000-abc123",
  "timestamp": "2025-10-29T14:30:45.200Z",
  "playerName": "tizen-avplay",
  "playerVersion": "1.0.0"
}
```

---

### 3. Buffer Start Event

Triggered when buffering begins.

**Action Name:** `bufferStart`

**Additional Attributes:**

| Attribute | Type | Description |
|-----------|------|-------------|
| `bufferStartTime` | Number | Timestamp when buffering started (Unix ms) |

**Example Payload:**

```json
{
  "actionName": "bufferStart",
  "contentId": "demo-video-001",
  "playhead": 30.5,
  "bufferStartTime": 1640995230500,
  "timestamp": "2025-10-29T14:30:30.500Z"
}
```

---

### 4. Buffer End Event

Triggered when buffering completes.

**Action Name:** `bufferEnd`

**Additional Attributes:**

| Attribute | Type | Description |
|-----------|------|-------------|
| `bufferStartTime` | Number | Timestamp when buffering started (Unix ms) |
| `bufferDuration` | Number | Duration of buffering in milliseconds |

**Example Payload:**

```json
{
  "actionName": "bufferEnd",
  "contentId": "demo-video-001",
  "playhead": 30.5,
  "bufferStartTime": 1640995230500,
  "bufferDuration": 2300,
  "timestamp": "2025-10-29T14:30:32.800Z"
}
```

---

### 5. Seek Start Event

Triggered when a seek operation begins.

**Action Name:** `seekStart`

**Additional Attributes:**

| Attribute | Type | Description |
|-----------|------|-------------|
| `seekFromPosition` | Number | Position before seeking (seconds) |

**Example Payload:**

```json
{
  "actionName": "seekStart",
  "contentId": "demo-video-001",
  "playhead": 45.2,
  "seekFromPosition": 45.2,
  "timestamp": "2025-10-29T14:31:00.000Z"
}
```

---

### 6. Seek End Event

Triggered when a seek operation completes.

**Action Name:** `seekEnd`

**Additional Attributes:**

| Attribute | Type | Description |
|-----------|------|-------------|
| `seekFromPosition` | Number | Position before seeking (seconds) |
| `seekToPosition` | Number | Position after seeking (seconds) |
| `seekDelta` | Number | Absolute difference between positions (seconds) |

**Example Payload:**

```json
{
  "actionName": "seekEnd",
  "contentId": "demo-video-001",
  "playhead": 90.0,
  "seekFromPosition": 45.2,
  "seekToPosition": 90.0,
  "seekDelta": 44.8,
  "timestamp": "2025-10-29T14:31:00.200Z"
}
```

---

### 7. End Event

Triggered when playback completes naturally.

**Action Name:** `end`

**Example Payload:**

```json
{
  "actionName": "end",
  "contentId": "demo-video-001",
  "contentSrc": "https://example.com/video.mp4",
  "contentTitle": "Big Buck Bunny",
  "duration": 596.5,
  "playhead": 596.5,
  "sessionId": "avplay-1640995200000-abc123",
  "timestamp": "2025-10-29T14:40:36.500Z",
  "playerName": "tizen-avplay",
  "playerVersion": "1.0.0"
}
```

---

### 8. Error Event

Triggered when a playback error occurs.

**Action Name:** `error`

**Additional Attributes:**

| Attribute | Type | Description |
|-----------|------|-------------|
| `errorCode` | String | AVPlay error code |
| `errorMessage` | String | Human-readable error description |
| `severity` | String | Error severity: `critical`, `error`, `warning` |

**Example Payload:**

```json
{
  "actionName": "error",
  "contentId": "demo-video-001",
  "playhead": 120.5,
  "errorCode": "PLAYER_ERROR_CONNECTION_FAILED",
  "errorMessage": "Network connection failed",
  "severity": "critical",
  "timestamp": "2025-10-29T14:32:00.500Z"
}
```

**Common Error Codes:**

| Error Code | Severity | Description |
|------------|----------|-------------|
| `PLAYER_ERROR_NONE` | N/A | No error |
| `PLAYER_ERROR_INVALID_PARAMETER` | error | Invalid parameter passed |
| `PLAYER_ERROR_NO_SUCH_FILE` | critical | File not found |
| `PLAYER_ERROR_INVALID_OPERATION` | error | Invalid operation for current state |
| `PLAYER_ERROR_SEEK_FAILED` | warning | Seek operation failed |
| `PLAYER_ERROR_INVALID_STATE` | error | Invalid player state |
| `PLAYER_ERROR_NOT_SUPPORTED_FILE` | critical | File format not supported |
| `PLAYER_ERROR_CONNECTION_FAILED` | critical | Network connection failed |
| `PLAYER_ERROR_BUFFER_SPACE` | warning | Insufficient buffer space |
| `PLAYER_ERROR_NOT_SUPPORTED_VIDEO_CODEC` | critical | Video codec not supported |
| `PLAYER_ERROR_NOT_SUPPORTED_AUDIO_CODEC` | critical | Audio codec not supported |

---

### 9. Heartbeat Event

Triggered periodically during playback to track position.

**Action Name:** `heartbeat`

**Additional Attributes:**

| Attribute | Type | Description |
|-----------|------|-------------|
| `timeSinceLastEvent` | Number | Milliseconds since last heartbeat |

**Example Payload:**

```json
{
  "actionName": "heartbeat",
  "contentId": "demo-video-001",
  "playhead": 150.3,
  "timeSinceLastEvent": 10000,
  "timestamp": "2025-10-29T14:32:30.300Z"
}
```

---

## Event Mapping: HTML5 vs AVPlay

Comparison with the New Relic HTML5 tracker:

| HTML5 Tracker Event | AVPlay Event | Trigger |
|---------------------|--------------|---------|
| `play` | `play` | `tracker.play()` |
| `pause` | `pause` | `tracker.pause()` |
| `playing` | *(combined with play)* | playback starts rendering |
| `waiting` | `bufferStart` | `onbufferingstart` callback |
| `canplay` | `bufferEnd` | `onbufferingcomplete` callback |
| `seeking` | `seekStart` | `tracker.seekTo()` called |
| `seeked` | `seekEnd` | seek operation completes |
| `ended` | `end` | `onstreamcompleted` callback |
| `error` | `error` | `onerror` callback |
| `timeupdate` | `heartbeat` | periodic timer |

---

## NRQL Query Examples

### Basic Queries

```sql
-- All video events
SELECT * FROM VideoAction SINCE 1 hour ago

-- Count events by action type
SELECT count(*) FROM VideoAction 
FACET actionName 
SINCE 1 day ago

-- Events for specific content
SELECT * FROM VideoAction 
WHERE contentId = 'demo-video-001' 
SINCE 1 hour ago
```

### Performance Metrics

```sql
-- Average buffer duration
SELECT average(bufferDuration) as 'Avg Buffer Time (ms)' 
FROM VideoAction 
WHERE actionName = 'bufferEnd' 
SINCE 1 day ago

-- Buffering frequency
SELECT count(*) as 'Buffer Events' 
FROM VideoAction 
WHERE actionName = 'bufferStart' 
FACET contentTitle 
SINCE 1 day ago

-- Error rate
SELECT (filter(count(*), WHERE actionName = 'error') / count(*)) * 100 as 'Error Rate %'
FROM VideoAction 
SINCE 1 day ago
```

### Engagement Metrics

```sql
-- Completion rate by content
SELECT 
  (filter(count(*), WHERE actionName = 'end') / 
   filter(count(*), WHERE actionName = 'play')) * 100 as 'Completion Rate %'
FROM VideoAction 
FACET contentTitle 
SINCE 7 days ago

-- Average watch time
SELECT average(playhead) as 'Avg Watch Time (s)' 
FROM VideoAction 
WHERE actionName = 'pause' OR actionName = 'end'
FACET contentTitle 
SINCE 1 day ago

-- Seek frequency
SELECT count(*) as 'Seeks per Video' 
FROM VideoAction 
WHERE actionName = 'seekStart' 
FACET sessionId 
SINCE 1 day ago
```

### Quality of Experience (QoE)

```sql
-- Videos with high buffer rates
SELECT count(*) as 'Buffer Count', average(bufferDuration) as 'Avg Buffer Duration'
FROM VideoAction 
WHERE actionName = 'bufferStart' 
FACET contentId 
SINCE 1 day ago 
LIMIT 10

-- Sessions with errors
SELECT sessionId, contentTitle, errorCode, errorMessage 
FROM VideoAction 
WHERE actionName = 'error' 
SINCE 1 day ago

-- Playback quality distribution
SELECT count(*) 
FROM VideoAction 
WHERE actionName = 'play' 
FACET resolution 
SINCE 1 week ago
```

---

## Custom Attributes

You can add custom attributes to all events:

```javascript
const tracker = new AVPlayTracker({
  player: webapis.avplay,
  contentId: 'video123',
  title: 'My Video',
  newRelicKey: 'YOUR_KEY',
  customAttributes: {
    userId: 'user-456',
    subscriptionTier: 'premium',
    deviceModel: 'Samsung UN55RU7100',
    appVersion: '2.1.0',
    genre: 'action',
    releaseYear: 2024
  }
});
```

These attributes will be included in all events and can be used for segmentation:

```sql
SELECT count(*) FROM VideoAction 
WHERE subscriptionTier = 'premium' 
FACET actionName 
SINCE 1 day ago
```

---

## Data Retention

- **Standard**: 8 days (default New Relic retention)
- **Pro**: 90 days
- **Enterprise**: Custom retention available

Configure alerts and dashboards based on this data model for real-time monitoring.

---

## Schema Versioning

Current schema version: **1.0.0**

Future versions will maintain backward compatibility. Schema changes will be documented in release notes.

---

For more information, see:
- [New Relic Custom Events](https://docs.newrelic.com/docs/data-apis/custom-data/custom-events/)
- [NRQL Query Language](https://docs.newrelic.com/docs/query-your-data/nrql-new-relic-query-language/)
- [video-tizen-js README](./README.md)
