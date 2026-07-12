# ClipBridge Development Guide

This document describes the environment setup, project structure, build pipelines, and verification scripts required to contribute to the ClipBridge project.

---

## 💻 1. Prerequisites

Verify that the following runtimes and compilers are installed on your workstation:

- **Node.js**: LTS Release (v18.x or v20.x recommended)
- **Rust Toolchain**: `stable` channel (including `cargo` and `rustc`)
- **C++ Compiler Suite**:
  - **Windows**: Visual Studio 2022 C++ Build Tools
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux**: `build-essential`, `libdbus-1-dev`, `libwebkit2gtk-4.1-dev` (or webkit2gtk-4.0 for older systems), `libssl-dev`
- **Mobile Environment**:
  - **Expo Go**: Installed on a physical test device, or an Android/iOS emulator configured via Android Studio or Xcode.
  - **Expo CLI**: Executable via `npx expo`.

---

## 🏗️ 2. Step-by-Step Environment Bootstrapping

ClipBridge is managed as a monorepo containing a Tauri desktop project and an Expo mobile project.

### Desktop App Setup
1. Navigate to the desktop project directory:
   ```bash
   cd apps/desktop
   ```
2. Install Node dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run tauri dev
   ```
   *Note: This command runs the Vite React development server on port `1420` and compiles the Rust backend binary. The app will hot-reload on both React and Rust file changes.*

### Mobile App Setup
1. Navigate to the android/mobile directory:
   ```bash
   cd apps/android
   ```
2. Install mobile dependencies:
   ```bash
   npm install
   ```
3. Start the Expo builder:
   ```bash
   npx expo start --offline
   ```
4. Scan the barcode printed on the terminal console using **Expo Go** on your physical phone, or run `a` to launch it inside an Android Emulator.

---

## 📂 3. Repository Directory Tree

```
ClipBridge/
├── apps/
│   ├── android/            # React Native Mobile client (Expo)
│   │   ├── src/            # Native hooks, components, and cryptography
│   │   ├── App.tsx         # Mobile entrypoint
│   │   └── package.json    # Expo configuration and scripts
│   └── desktop/            # Tauri Desktop Client
│       ├── src/            # Vite + React Frontend source
│       ├── src-tauri/      # Rust backend core (main.rs, network.rs, crypto.rs)
│       └── package.json    # Tauri workspace configuration
├── packages/
│   ├── crypto/             # Shared cryptographic specifications
│   └── protocol/           # Core networking schemas
└── docs/                   # Full documentation guides
```

---

## 🔧 4. Building Production Packages

### Compiling Desktop Installers
To build optimized, release-ready installers:
```bash
cd apps/desktop
npm run tauri build
```
The build artifacts will be saved to:
- **Windows**: `apps/desktop/src-tauri/target/release/bundle/msi/`
- **macOS**: `apps/desktop/src-tauri/target/release/bundle/dmg/`
- **Linux**: `apps/desktop/src-tauri/target/release/bundle/appimage/`

### Compiling Mobile Binaries
To build a standalone APK or AAB bundle (requires Expo Application Services `eas-cli`):
```bash
cd apps/android
npx eas build --platform android --local
```

---

## 🧪 5. Verification & Testing

### Running Tests
To verify codebase health, run the test suites:

- **Desktop Rust Tests**:
  ```bash
  cd apps/desktop/src-tauri
  cargo test
  ```
- **Linter Audits**:
  ```bash
  # Run cargo clippy for Rust code analysis
  cargo clippy --all-targets -- -D warnings
  ```
- **Desktop JS Integration Tests**:
  ```bash
  cd apps/desktop
  node verify_tests.js
  ```
