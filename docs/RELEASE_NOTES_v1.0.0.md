# Release Notes - v1.0.0 (First Public Release)

Welcome to the first official public release of **ClipBridge**! ClipBridge is a secure, cross-platform clipboard synchronization application designed to instantly sync clipboard content between Android and desktop devices over a local network.

This release represents our first stable version (v1.0.0) ready for production deployment across Windows, macOS, Linux, and Android.

---

## 🌟 Highlights
- **Zero Cloud & Account-Free**: ClipBridge requires no user accounts, no logins, and zero cloud services. All sync processes occur strictly over local Wi-Fi or Ethernet subnets.
- **End-to-End Encrypted (E2EE)**: Clipboard payloads are encrypted locally on the sender device using **AES-256-GCM** and decrypted on the destination device. Keys are negotiated dynamically via X25519 ECDH pairing.
- **Low Latency**: Performance tests show sub-15ms clipboard synchronization latencies on standard 5GHz networks.
- **Minimal Footprint**: The Rust-powered Tauri backend consumes under 45 MB of memory in idle state.

---

## 🚀 Features
*   **mDNS Auto-Discovery**: Automatic host resolution using Multicast DNS, making manually entering IP addresses obsolete.
*   **Out-of-Band pairing**: Secure key exchange using an out-of-band QR code scan to exchange public identity keys.
*   **Persistent Device Identity**: Prevents pairing invalidation by saving generated device UUIDs inside config directories.
*   **Intelligent Loop Prevention**: Combines origin verification, ring buffer caches, and content deduplication to prevent infinite clipboard echo loops.
*   **Battery-Saving Reconnect States**: Automatically suspends background WebSocket retries on mobile when the app enters background or the device screen locks.

---

## 📦 Supported Platforms & Release Binaries

### Desktop (v1.0.0)
- **Windows (x64)**:
  - `ClipBridge_1.0.0_x64_en-US.msi` (MSI Installer)
  - `ClipBridge_1.0.0_x64-setup.exe` (NSIS Installer)
  - `clipbridge.exe` (Portable Single-file executable)
- **Linux (x64)**:
  - `ClipBridge-1.0.0.AppImage` (Universal AppImage bundle)
  - `clipbridge_1.0.0_amd64.deb` (Debian/Ubuntu package)
- **macOS (Intel & Apple Silicon)**:
  - `ClipBridge_1.0.0_x64.dmg` / `ClipBridge_1.0.0_aarch64.dmg`

### Mobile (v1.0.0)
- **Android**:
  - `clipbridge-release.apk` (Optimized APK)
  - `clipbridge-release.aab` (Google Play Store Bundle)
- **iOS**:
  - Swift compilation instructions (TestFlight build coming soon)

---

## 🛡️ SHA-256 Checksums
Verify the integrity of downloaded binaries using the following hashes:

```
0e3ba604462b468b6902392d65058b6b69439db2bd99d41bc216d1d1b478cac7  ClipBridge_1.0.0_x64_en-US.msi
ecee1ff4e1b4278392277da57ea5017ed93cc3e4ef8aa5266e014625560da4c8  ClipBridge_1.0.0_x64-setup.exe
9c64fb9d32935c612263d66a272ba1c189b9517561239f2f7ddf6b5788380cfa  clipbridge.exe (portable)
```

---

## ⚠️ Known Limitations
- **Subnet Boundaries**: Multicast DNS packets typically do not cross VLAN or subnet boundaries. Manual IP entry is required if devices are on different subnets.
- **AP Isolation**: Local networks that enforce client isolation (public Wi-Fi, hotel networks, guest networks) block WebSocket connections between devices.
- **Format Restrictions**: Text format synchronization only. File and image sharing are not supported in this version.

---

## 🗺️ Roadmap
- **v2.1.0**: Image clipboard sync.
- **v2.2.0**: LAN File and Folder sharing.
- **v2.3.0**: macOS native DMG release & iOS App Store build.
- **v2.4.0**: Fuzzy matching clipboard history search.
