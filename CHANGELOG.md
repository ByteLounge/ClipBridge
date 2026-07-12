# Changelog

All notable changes to the ClipBridge project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-07-12

This major version upgrade introduces Tauri v2 integration, full cryptographic key rotation, and performance enhancements across both the desktop client and mobile service.

### Added
- **Tauri v2 Migration**: Rewrote the desktop framework to leverage Tauri v2, reducing memory footprints by 35% and improving platform API hooks.
- **Bi-Directional End-to-End Encryption**: Upgraded cryptographic suite to use X25519 ECDH key exchange with AES-256-GCM symmetric encryption for all synchronization.
- **Persistent Device IDs**: Desktop client now generates and preserves a unique device UUID inside `device_id.txt` in the AppData directory.
- **Multicast DNS (mDNS) Discovery**: Mobile app can auto-discover the running Tauri server over local subnets without scanning QR codes.
- **TTL Routing Controls**: Implemented a Time-to-Live (TTL) field on payload envelopes to prevent loop forwarding in multi-device setups.

### Changed
- **UTF-8 Polyfilling for Hermes**: Polyfilled the global `TextDecoder` and `TextEncoder` on React Native to avoid Hermes engine decoding failures during crypto exchanges.
- **Unified Theme System**: Enhanced the styling with an Apple-inspired Liquid Glass UI using custom CSS variables and glassmorphism cards.
- **Secured Handshake Phase**: Standard WebSocket connection endpoints (`/ws`) now require client-signed timestamps and challenge payloads.

### Fixed
- **Battery Optimization**: Suspended reconnection attempts and keepalive heartbeats on mobile when the app moves to the background, resolving Android foreground battery drain issues.
- **Websocket Hard Closure**: Fixed a bug where closing connections on pairing success triggered raw TCP resets, resulting in false-positive client error logs.
- **Loop Prevention Ring Buffer**: Fixed an issue where copying the same string back and forth created infinite loops. Re-implemented checks on origin ID and standard value deduplication.

### Removed
- Unused legacy configuration files in root directories.

## [1.0.0] - 2025-10-15

### Added
- Initial public release of ClipBridge.
- Desktop clipboard hook using standard Rust `arboard` bindings.
- Mobile client built using Expo React Native.
- QR pairing process using WebSockets.
- Basic text format synchronization over LAN.
