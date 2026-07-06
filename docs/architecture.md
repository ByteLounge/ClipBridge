# ClipBridge System Architecture

This document describes the high-level architecture, component designs, and design decisions for ClipBridge.

---

## 1. High-Level Design

ClipBridge uses a **LAN-first** model to eliminate latency and cloud reliance, with an architecture designed to easily plug in a **Relay Server** for remote syncing.

```
+-----------------------------------------------------------+
|                      Local Network                        |
|                                                           |
|  +-----------------------+         +-------------------+  |
|  |     Android App       |         |    Desktop App    |  |
|  |  +-----------------+  |         |  +-------------+  |  |
|  |  |  Compose UI     |  |         |  | React/Vite   |  |  |
|  |  +--------+--------+  |         |  +------+------+  |  |
|  |           | (MVVM)    |         |         | (IPC)   |  |
|  |  +--------v--------+  |         |  +------v------+  |  |
|  |  | ViewModel       |  |         |  | Tauri Core  |  |  |
|  |  +--------+--------+  |         |  +------+------+  |  |
|  |           |           |         |         |         |  |
|  |  +--------v--------+  |         |  +------v------+  |  |
|  |  | Ktor Client     |<==WS/LAN==>|  | Axum Server |  |  |
|  |  +-----------------+  |         |  +-------------+  |  |
|  |  | NSD Discovery   |<==mDNS====>|  | mDNS Daemon |  |  |
|  |  +-----------------+  |         |  +-------------+  |  |
|  |  | Clipboard Serv. |  |         |  | Clipboard   |  |  |
|  |  +-----------------+  |         |  +-------------+  |  |
|  +-----------------------+         +-------------------+  |
+-----------------------------------------------------------+
```

---

## 2. Desktop Architecture

The desktop application is built with **Tauri v2** and divided into two layers:
1. **Frontend (UI)**: Built with React, TypeScript, and Vite. Designed with an Apple Liquid Glass aesthetic (frosted glass, dynamic blur, translucency, and spring animations). Communicates with the backend using Tauri commands (IPC).
2. **Backend (Rust)**:
   - **Tauri Core**: Manages window states, system tray icons, configuration storage, and user notifications.
   - **Axum Web Server**: Hosts a lightweight HTTP & WebSocket server. Contains `/pair` for key exchanges and `/ws` for live clipboard synchronization.
   - **mDNS Service**: Advertises the desktop's existence on the local network using `_clipbridge._tcp`.
   - **arboard Clipboard integration**: A native Rust clipboard reader and writer that polls/listens for changes.
   - **ring Cryptography**: Handles X25519 key agreements and AES-256-GCM cipher tasks.

---

## 3. Android Architecture

The Android app follows **Clean Architecture** combined with **MVVM** and **Hilt** Dependency Injection:
- **Presentation Layer**: Built with **Jetpack Compose** using Material 3 styling wrapped in Apple-inspired design elements (translucent containers, glowing highlights).
- **Foreground Service**: A persistent background clipboard monitor. It binds to the system's clipboard service, debounces copy events, and manages WebSocket connections to paired desktop clients. It holds a partial wake lock to prevent connection drops in deep sleep.
- **Network Discovery**: Uses Android's native **NSD** (Network Service Discovery) API to locate active Tauri servers on the local Wi-Fi.
- **Data & Crypto Layer**: Uses **Ktor** for WebSocket client channels. Uses **SQLCipher** (via Room) or EncryptedSharedPreferences for securing paired keys. Employs the **Android Keystore** system to generate and protect keys.

---

## 4. Relay Mode (Internet Fallback)

To sync clipboard content when devices are on different networks:
- The system is designed to allow pointing to a secure Relay Server.
- **Relay Server Role**: A simple message relay. It receives encrypted payloads from a client and forwards them to other active connections matched by Device ID grouping.
- **End-to-End Encryption**: The Relay Server NEVER holds the encryption keys ($K\_sync$). Payloads are encrypted client-side using the derived X25519 shared secret. The Relay only sees the sender ID, nonce, and ciphertext, preventing data snooping in transit.
