# Changelog

All notable changes to video-tizen-js will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-10-29

### Added
- Initial release of video-tizen-js
- AVPlayTracker class for Tizen AVPlay integration
- EventMapper for New Relic VideoAction schema compatibility
- Transport layer with retry logic and batching support
- Support for all major AVPlay callbacks (buffering, errors, completion)
- Automatic heartbeat tracking
- Seek event tracking with delta calculation
- Error event tracking with severity levels
- Sample Tizen app demonstrating usage
- Comprehensive documentation (README, DATAMODEL, CONTRIBUTING)
- Unit tests with mocked AVPlay
- TypeScript-ready with JSDoc comments

### Features
- ✅ Play/Pause tracking
- ✅ Buffer start/end events
- ✅ Seek start/end with position delta
- ✅ Stream completion tracking
- ✅ Error tracking with detailed codes
- ✅ Periodic heartbeat events
- ✅ New Relic Browser Agent integration
- ✅ New Relic Insights API fallback
- ✅ Custom endpoint support
- ✅ Event batching
- ✅ Retry logic with exponential backoff
- ✅ Comprehensive logging
- ✅ State inspection API

### Supported Platforms
- Tizen 6.0+
- Tizen 5.5
- Tizen 5.0

[1.0.0]: https://github.com/petter-addo/video-telemetry-tracker/releases/tag/v1.0.0
