# ClipBridge API Specification

This document details the local network APIs (Axum server endpoints) and Tauri IPC commands used by ClipBridge.

---

## 1. Network API Endpoints (Axum Web Server)

The Desktop application runs a lightweight HTTP/WebSocket server (defaulting to port `54670`).

### A. Pairing WebSocket Endpoint
- **URL**: `/pair`
- **Protocol**: WebSocket
- **Description**: Used exclusively to exchange X25519 public keys. The endpoint is only active when the Desktop UI is in "Pairing Mode" (user has clicked "Pair Device").
- **Message Type**: JSON Text Frames
- **Workflow**:
  1. Client connects to `/pair`.
  2. Client sends a `PAIR_REQUEST` text frame.
  3. Server validates, extracts client details, generates its pairing response, sends a `PAIR_RESPONSE` frame, and closes the socket.

### B. Synchronization WebSocket Endpoint
- **URL**: `/ws`
- **Protocol**: WebSocket
- **Description**: The main channel for live clipboard synchronization.
- **Message Type**: Binary or JSON Text Frames containing encrypted data.
- **Handshake Validation**:
  - Connection must begin with a valid handshake frame within 3 seconds, or the connection is dropped.
  - The handshake frame is JSON formatted:
    ```json
    {
      "device_id": "UUID-client-uuid",
      "nonce": "12-byte hex IV",
      "encrypted_handshake": "Hex-encoded AES-GCM ciphertext"
    }
    ```
  - Decrypted payload contains:
    ```json
    {
      "timestamp": 1712345678,
      "challenge": "random-challenge-string"
    }
    ```

---

## 2. Tauri IPC Commands (Desktop Frontend-Backend)

The Tauri frontend (React) communicates with the Rust backend using the `@tauri-apps/api/core` invoke system.

### A. `get_device_id`
- **Signature**: `fn get_device_id() -> String`
- **Description**: Returns this desktop's unique Device ID (UUIDv4) stored in configuration.

### B. `generate_pairing_qr`
- **Signature**: `fn generate_pairing_qr() -> Result<PairingQRInfo, String>`
- **Returns**:
  ```typescript
  interface PairingQRInfo {
    qr_data: string; // The raw cbpair:... string
    qr_svg: string;  // SVG representation of the QR code
  }
  ```

### C. `get_paired_devices`
- **Signature**: `fn get_paired_devices() -> Vec<PairedDevice>`
- **Returns**: List of currently paired Android devices.

### D. `delete_paired_device`
- **Signature**: `fn delete_paired_device(device_id: String) -> Result<(), String>`
- **Description**: Unpairs the device and removes its keys from secure storage.

### E. `get_clipboard_history`
- **Signature**: `fn get_clipboard_history() -> Vec<ClipboardItem>`
- **Returns**:
  ```typescript
  interface ClipboardItem {
    id: string;
    timestamp: number;
    data_type: string;
    content: string;
    origin_device_name: string;
    is_pinned: boolean;
  }
  ```

### F. `set_clipboard`
- **Signature**: `fn set_clipboard(content: String) -> Result<(), String>`
- **Description**: Manually updates the OS clipboard (used when clicking "Copy" on a history card).

### G. `get_network_status`
- **Signature**: `fn get_network_status() -> NetworkStatus`
- **Returns**:
  ```typescript
  interface NetworkStatus {
    ip_address: string;
    port: number;
    is_advertising: boolean;
    connected_clients: number;
  }
  ```
