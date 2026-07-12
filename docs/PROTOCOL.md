# ClipBridge Protocol Specification

This document details the network transport layer, service discovery parameters, connection handshakes, and cryptographic framing utilized by ClipBridge.

---

## 1. Network Discovery & Service Advertising

ClipBridge uses Multicast DNS (mDNS) / DNS-SD (Bonjour) to announce and discover hosts on a local area network subnet.

### Service Advertisement Properties
- **Service Name**: `_clipbridge._tcp`
- **Default Port**: `54670` (Fallback to dynamic port binding if unavailable)
- **Multicast Group**: IPv4 `224.0.0.251` / IPv6 `ff02::fb` on UDP port `5353`

### TXT Records
The mDNS responder publishes metadata within the DNS TXT record fields:

| Key | Format | Example | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID (string) | `6c2a8684-2a62-421b-8531-10c538ab82cf` | Unique persistent host identifier |
| `name` | String | `LivingRoom-PC` | Human-readable hostname |
| `ver` | Integer | `2` | Supported protocol version |

---

## 2. API Endpoints

The desktop application runs an HTTP server upgraded to WebSocket connections:

- `/pair` (WebSocket): Endpoint for out-of-band initial key exchange and trust establishment.
- `/ws` (WebSocket): Secure channel for real-time bi-directional clipboard synchronization.

---

## 3. Communication Flows & Message Schemas

All frames exchanged over WebSocket connections use JSON encoding.

### A. Pairing Flow (Out-of-Band via `/pair`)

During pairing, the mobile client scans a QR code displayed on the desktop containing:
```
cbpair:<device_id>:<x25519_public_key_hex>:<device_name>
```

#### 1. Pairing Initiation (`PAIR_REQUEST`)
Sent by the mobile client immediately upon connecting to `/pair`:

```json
{
  "type": "PAIR_REQUEST",
  "device_id": "8a3d4f10-18cd-4bba-9076-78e7f12bcda4",
  "display_name": "Pixel 8 Pro",
  "client_public_key": "9cf518a4cdb340cf200e57209b552faee56a1bde7a0d4c92c81fb3964d4b1a40"
}
```

#### 2. Pairing Response (`PAIR_RESPONSE`)
Returned by the desktop server after saving the pairing configuration:

```json
{
  "type": "PAIR_RESPONSE",
  "device_id": "6c2a8684-2a62-421b-8531-10c538ab82cf",
  "display_name": "LivingRoom-PC",
  "server_public_key": "12cb49de489b0a1d48c90fe0a5b28e6783cf9e9de0da43ff7820ab0d9ebc88a1"
}
```

*Note: Once the pairing handshake finishes, both peers derive `K_sync` locally via X25519 ECDH and close the `/pair` connection.*

---

### B. Sync Connection Handshake (via `/ws`)

When connecting to the live synchronization endpoint (`/ws`), the client must authenticate within 5 seconds of opening the socket by sending a signed authentication challenge payload.

#### Handshake Initiation
Sent by the client:

```json
{
  "device_id": "8a3d4f10-18cd-4bba-9076-78e7f12bcda4",
  "nonce": "e4f8d29bca0871d34eab8b12",
  "encrypted_handshake": "8f2bc0da86f4...1b827e8d"
}
```

- `nonce`: A 12-byte hex-encoded initialization vector containing a timestamp (8 bytes) + random padding (4 bytes).
- `encrypted_handshake`: Hex-encoded AES-256-GCM ciphertext containing the following JSON payload:

```json
{
  "timestamp": 1782828482562,
  "challenge_response": "8a3d4f10-18cd-4bba-9076-78e7f12bcda4-handshake"
}
```

The server decrypts the challenge, verifies the timestamp (within 10 seconds of server time), and confirms pairing.

---

### C. Clipboard Sync Payload

Sync payloads are transmitted as JSON envelopes containing AES-256-GCM ciphertext.

#### Encrypted Sync Envelope
```json
{
  "sender_id": "8a3d4f10-18cd-4bba-9076-78e7f12bcda4",
  "nonce": "1a8dcf3bde48c92b8d01fb2c",
  "ciphertext": "da283fbdc8752a10e8d7a18b2c6d482aef1038cbbde...",
  "tag": "e7c849db82a170fb92de0d4e9c7081bc"
}
```

#### Decrypted Payload Structure
```json
{
  "clip_id": "c19b84a9-de08-412f-98cb-d183fae3bb2a",
  "timestamp": 1782828490000,
  "data_type": "text",
  "content": "Secret text copy operation!",
  "origin_device_id": "8a3d4f10-18cd-4bba-9076-78e7f12bcda4",
  "ttl": 3
}
```

---

## 4. Connection Maintenance & Loop Mitigation

### Heartbeats (Ping/Pong)
To prevent network gateways from terminating idle TCP sockets:
- The mobile client sends a text message `"PING"` every 15 seconds.
- The server responds with `"PONG"`.
- If no ping/pong occurs within 45 seconds, the socket is severed and reconnection begins.

### Loop Prevention Rules
1. **Origin Verification**: If `origin_device_id` equals the local device's UUID, drop the packet.
2. **Ring Buffer Cache**: Keep a ring buffer of the last 50 processed `clip_id` entries. Drop any packet matching a cache entry.
3. **OS Deduplication**: Query the OS clipboard before writing. If the local OS clipboard already holds the same value, do not perform a write (to avoid triggering clipboard events).
4. **Time-to-Live (TTL)**: Decrypted payloads initialize with `ttl` (default: `3`). Every forwarding node decrements `ttl`. Discard if `ttl <= 0`.
