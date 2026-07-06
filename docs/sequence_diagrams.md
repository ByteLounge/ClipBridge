# ClipBridge Sequence Diagrams

This document illustrates the message sequences for core flows: pairing, connection establishment, and clipboard synchronization.

---

## 1. Device Discovery & Pairing Flow

This sequence shows how a Desktop client displays a QR code, which an Android device scans to negotiate keys and pair.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Desktop as Tauri Desktop
    participant Android as Android Phone

    Note over Desktop: Start App
    Desktop->>Desktop: Generate persistent X25519 identity key
    Desktop->>Desktop: Bind Axum server to port (e.g. 54670)
    Desktop->>Desktop: Publish mDNS advertisement (_clipbridge._tcp)
    User->>Desktop: Clicks "Pair Device"
    Desktop->>Desktop: Generate QR (DeviceID + PublicKey + Name)
    Desktop->>User: Display QR Code on UI

    User->>Android: Opens QR Scanner in Android App
    Android->>Desktop: Scans QR code
    Note over Android: Decodes DeviceID, PublicKey, Host & Port

    Android->>Android: Generate X25519 pairing keypair
    Android->>Desktop: Connect WS to ws://[IP]:[Port]/pair
    Android->>Desktop: Send PAIR_REQUEST (DeviceID, PublicKey, Name)
    Desktop->>Desktop: Compute X25519 Shared Secret
    Desktop->>Desktop: Derive Sync Key (K_sync) via HKDF
    Desktop->>Desktop: Store pairing in Secure Storage
    Desktop->>Android: Send PAIR_RESPONSE (DeviceID, PublicKey, Name)
    Android->>Android: Compute X25519 Shared Secret
    Android->>Android: Derive Sync Key (K_sync) via HKDF
    Android->>Android: Store pairing in Keystore/Encrypted DB
    Android->>Desktop: Close pairing connection
    Note over Desktop, Android: Devices are successfully paired!
```

---

## 2. Automatic Connection & Handshake

This sequence shows how the Android Foreground Service detects a paired desktop on local Wi-Fi and connects.

```mermaid
sequenceDiagram
    autonumber
    participant AndroidService as Android Service
    participant NSD as Android NSD
    participant Desktop as Tauri Desktop

    AndroidService->>NSD: Listen for _clipbridge._tcp services
    Desktop->>NSD: Broadcasts mDNS advertisement
    NSD-->>AndroidService: Device Discovered (IP, Port, TXT: ID, Name)
    
    Note over AndroidService: Check if Discovered ID is in Paired List
    alt Is Paired Device
        AndroidService->>AndroidService: Load K_sync from secure storage
        AndroidService->>AndroidService: Prepare encrypted Handshake JSON
        AndroidService->>Desktop: Connect WS to ws://[IP]:[Port]/ws
        AndroidService->>Desktop: Send auth handshake (DeviceID, Nonce, Ciphertext)
        Desktop->>Desktop: Lookup K_sync using DeviceID
        Desktop->>Desktop: Decrypt and validate Handshake (timestamp, challenge)
        alt Handshake Valid
            Desktop-->>AndroidService: Accept Connection (Handshake Success)
            Note over AndroidService, Desktop: Secure Connection Established!
        else Handshake Invalid
            Desktop-->>AndroidService: Close Connection (Unauthorized)
        end
    end
```

---

## 3. Clipboard Synchronization Flow

This sequence shows how a copy event on Android is securely synchronized to the Desktop.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant AndroidClip as Android Clipboard
    participant AndroidService as Android Service
    participant Desktop as Tauri Desktop
    participant DesktopClip as Desktop Clipboard

    User->>AndroidClip: Copy text (e.g. "Secure Text")
    AndroidClip-->>AndroidService: Clipboard change event detected
    AndroidService->>AndroidService: Debounce event (e.g. wait 300ms)
    AndroidService->>AndroidService: Create Clip JSON (UUID, Timestamp, Text, OriginID)
    AndroidService->>AndroidService: Generate 12-byte Monotonic Nonce
    AndroidService->>AndroidService: Encrypt JSON with K_sync (AES-256-GCM)
    AndroidService->>Desktop: Send encrypted payload over WS
    Desktop->>Desktop: Verify nonce timestamp & monotonicity
    Desktop->>Desktop: Decrypt payload using K_sync
    Desktop->>Desktop: Verify Origin ID != local ID
    Desktop->>Desktop: Check if clip UUID is in history cache
    Desktop->>DesktopClip: Write text to OS clipboard (using arboard)
    Desktop->>User: Display desktop notification
    Note over DesktopClip: User can paste the text immediately!
```
