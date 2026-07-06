# ClipBridge Protocol Specification

This document details the network framing, message structures, and communication states used to synchronize clipboard content between ClipBridge clients.

---

## 1. Network Layer & Discovery

- **Discovery Protocol**: mDNS / DNS-SD (Bonjour).
- **Service Type**: `_clipbridge._tcp`.
- **Port**: Desktop dynamically binds or defaults to `54670`.
- **TXT Records**:
  - `id`: Unique Device UUID.
  - `name`: Display name (e.g., "John's MacBook").
  - `ver`: Protocol version (e.g., `1`).
- **Transport**: WebSockets (`ws://<ip>:<port>/ws` and pairing at `ws://<ip>:<port>/pair`).

---

## 2. States & Flows

```
      +-------------+                 +-------------+
      |   Desktop   |                 |   Android   |
      +-------------+                 +-------------+
             |                               |
             | ---- Advertises mDNS -------->| (Discovers via NSD)
             |                               |
             | <--- Connects to /pair -------| (Scans QR with Key info)
             |                               |
             | <=== X25519 Key Exchange ====>| (Derive Symmetric Key)
             |                               |
             | <--- Connects to /ws ---------| (With Client ID & Auth)
             |                               |
             | <=== AES-256-GCM Payload ====>| (Real-time Sync)
```

---

## 3. Message Schemas

### A. Pairing Initiation (Client to Server on `/pair`)
Sent as a WebSocket text message immediately after connection:
```json
{
  "type": "PAIR_REQUEST",
  "device_id": "UUID-client-uuid",
  "display_name": "Pixel 8 Pro",
  "client_public_key": "HEX_ENCODED_X25519_PUBLIC_KEY"
}
```

### B. Pairing Response (Server to Client on `/pair`)
Server validates the client and returns its details:
```json
{
  "type": "PAIR_RESPONSE",
  "device_id": "UUID-server-uuid",
  "display_name": "MacBook Air",
  "server_public_key": "HEX_ENCODED_X25519_PUBLIC_KEY"
}
```
*Note: Both parties now perform X25519 ECDH and HKDF-SHA256 to derive a shared symmetric key `K_sync`.*

### C. Standard Connection Handshake (on `/ws`)
When connecting to the live sync endpoint `/ws`, the client must send an authentication packet using its device ID and a timestamp, signed/encrypted with the derived `K_sync` key to prove pairing ownership.

Handshake Header:
```json
{
  "device_id": "UUID-client-uuid",
  "nonce": "12-byte hex IV",
  "encrypted_handshake": "AES-GCM ciphertext hex containing: {timestamp: 1712345678, challenge_response: 'xyz'}"
}
```

### D. Clipboard Data Sync Payload (on `/ws`)
Data payloads exchanged between clients. Every payload is encrypted with `AES-256-GCM` using the derived `K_sync` key.

Encrypted Payload Envelope:
```json
{
  "sender_id": "UUID-sender-uuid",
  "nonce": "12-byte hex IV",
  "ciphertext": "Hex-encoded AES-GCM ciphertext",
  "tag": "16-byte hex authentication tag"
}
```

Decrypted Ciphertext Content:
```json
{
  "clip_id": "UUID-clip-uuid",
  "timestamp": 1712345678900,
  "data_type": "text",
  "content": "Copied text content here...",
  "origin_device_id": "UUID-origin-uuid",
  "ttl": 3
}
```

---

## 4. Loop Prevention

To prevent infinite loops (where Desktop copies Phone sync -> fires local clipboard event -> sends back to Phone -> repeats):
1. **Source Filtering**: If `origin_device_id` in the received packet matches the current device's ID, the packet is discarded immediately.
2. **Duplicate Cache**: Each device maintains a Ring Buffer of the last 50 processed `clip_id`s. Any received clip whose `clip_id` is in the cache is discarded.
3. **Value Deduplication**: Before acting on a received clip, the client queries the native clipboard. If the OS clipboard content is identical to `content`, it is ignored to prevent triggering unnecessary system clipboard events.
4. **Time to Live (TTL)**: Placed inside every packet. Starts at `3`. If a device routes a packet, it decrements `ttl`. If `ttl <= 0`, it is discarded.
