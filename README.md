# ClipBridge

> **Copy Anywhere. Paste Everywhere.**

ClipBridge is an extremely fast, secure, cross-platform clipboard synchronization system. It provides near-instant clipboard synchronization between your Android and desktop devices. It is simpler and faster than Microsoft Phone Link, KDE Connect, Pushbullet, and Apple's Universal Clipboard, while remaining completely cross-platform.

---

## Key Features

- ⚡ **Near-Instant Sync**: Sub-100ms sync on local area networks (LAN).
- 🔑 **Zero-Login Experience**: No accounts, cloud sign-ins, or registration required. Scan a QR code and you're paired.
- 🔒 **End-to-End Encryption**: Secure key exchange using **X25519** and payload encryption using **AES-256-GCM**. No plaintext passes over the network.
- 📡 **LAN-First with Internet Fallback**: Automatically discovers devices on the same Wi-Fi using mDNS (Bonjour/Zeroconf). Can fallback to a secure relay if not on the same network.
- 💎 **Apple-Quality UI/UX**: Frosted glass panels, dynamic blur, layered translucency, and physics-based spring animations for a liquid-glass aesthetic.
- 🔋 **Battery Optimized**: Android background service utilizes highly optimized network polling and websocket listeners with low footprint.

---

## Project Structure

ClipBridge is structured as a monorepo:

```
clipbridge/
├── apps/
│   ├── desktop/                 # Tauri v2 (Rust Backend) + React + Vite + TS (Frontend)
│   └── android/                 # Native Android App (Kotlin + Jetpack Compose + MVVM + Hilt + Ktor)
├── packages/
│   ├── protocol/                # JSON payload schema and flow documentation
│   └── crypto/                  # Cryptography guidelines (X25519, AES-256-GCM)
├── docs/                        # Project documentation (Architecture, API, Diagrams, Setup)
├── assets/                      # Application assets (logos, icons)
└── scripts/                     # Helper scripts (build, dev, test)
```

---

## Quick Start

### Prerequisites

- **Desktop Development**:
  - Rust (1.75+)
  - Node.js (18+) & npm/pnpm
  - C++ build tools (required by Tauri)
- **Android Development**:
  - Android Studio (Koala or newer)
  - JDK 17+
  - Android 12+ device (API 31+)

### Running Desktop Developer Environment

```bash
cd apps/desktop
npm install
npm run tauri dev
```

### Running Android Developer Environment

1. Open `apps/android` in Android Studio.
2. Build the project using Gradle.
3. Run on your Android 12+ device or emulator.

---

## Documentation Directory

Detailed guides are located in the `docs/` folder:

- 📊 [System Architecture](docs/architecture.md)
- 📡 [API Specification](docs/api.md)
- 🔄 [Sequence Diagrams](docs/sequence_diagrams.md)
- 🛠️ [Developer Setup Guide](docs/setup.md)
- 📜 [Protocol Specification](packages/protocol/protocol.md)
- 🔒 [Cryptographic Design](packages/crypto/crypto.md)

---

## License

ClipBridge is licensed under the MIT License. See [LICENSE](LICENSE) for details.
