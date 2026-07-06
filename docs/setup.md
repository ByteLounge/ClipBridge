# ClipBridge Developer Setup & Deployment Guide

This guide walks you through setting up a local development environment and building production releases for both the Desktop (Tauri) and Android apps.

---

## 1. Prerequisites

Ensure your development machine has the following tools installed:

- **General**: Git, Node.js (v18.0 or newer), npm/pnpm.
- **Desktop Backend**: 
  - Rustup (Rust 1.75+)
  - *Windows*: Visual Studio Build Tools (C++ development workload)
  - *macOS*: Xcode Command Line Tools
  - *Linux*: System dependencies for Tauri (e.g. `libwebkit2gtk-4.1-dev`, `build-essential`, `curl`, `wget`, `file`, `libssl-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`)
- **Android**:
  - Android Studio (Koala 2024.1.1 or newer)
  - JDK 17
  - Android SDK Platform 34 (Android 14) and SDK Build-Tools

---

## 2. Desktop App Development

The desktop app is split into a Rust backend and a React/Vite/TypeScript frontend.

### A. First-Time Setup
Navigate to the desktop directory and install dependencies:
```bash
cd apps/desktop
npm install
```

### B. Running in Development Mode
Start the Tauri dev server. This will open the desktop application shell, configure hot-reloading for the frontend, and compile the Rust backend:
```bash
npm run tauri dev
```

### C. Building for Production
To bundle the app into a native installer (.msi/.exe for Windows, .app/.dmg for macOS, .deb/.appimage for Linux):
```bash
npm run tauri build
```
Output files will be located in `apps/desktop/src-tauri/target/release/bundle/`.

---

## 3. Android App Development

The Android app is located in `apps/android` and built with Gradle.

### A. Opening the Project
1. Open Android Studio.
2. Select **Open an existing project**.
3. Point to `clipbridge/apps/android`.

### B. Building and Running
1. Connect a physical Android 12+ device (via USB debugging or wireless debugging) or launch an Android emulator.
2. Click the **Run** button (green play icon) in Android Studio.
3. Gradle will download dependencies, compile the project, and install the APK on the target device.

### C. Building Release APK
To compile the release binary:
```bash
cd apps/android
./gradlew assembleRelease
```
The output APK will be located in `apps/android/app/build/outputs/apk/release/app-release-unsigned.apk`. Sign this APK using `apksigner` for distribution.

---

## 4. Troubleshooting Local Discovery

Since ClipBridge relies on **mDNS** (Bonjour / DNS-SD):
1. **Network Configuration**: Ensure both your development PC and Android test device are connected to the **same Wi-Fi network**.
2. **AP Isolation**: Verify that "AP Isolation" or "Client Isolation" is **disabled** in your Wi-Fi router settings. If enabled, the router blocks local network traffic between devices.
3. **Firewall Settings**:
   - **Windows**: The first time you run `npm run tauri dev`, Windows Firewall will prompt to allow the app to access Private and Public networks. Check **both** and click Allow.
   - **macOS/Linux**: Ensure ports `54670` (WebSocket) and `5353` (mDNS) are open.
