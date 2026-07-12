# Frequently Asked Questions (FAQ)

Here you will find answers to the most common questions regarding ClipBridge setup, features, security protocols, and engineering internals.

---

## 🔒 Security & Privacy

### Q1: Is my clipboard data uploaded to the cloud or external servers?
No. ClipBridge is designed as a local-first application. All clipboard sync events occur directly between your devices over your local area network (LAN) or private Wi-Fi. No data is stored, sent, or routed through any cloud service.

### Q2: What encryption standard is used to secure the transmission?
ClipBridge uses an authenticated end-to-end encryption pipeline:
- **Key Exchange**: X25519 Elliptic Curve Diffie-Hellman (ECDH) via out-of-band QR scanning.
- **Key Derivation**: HKDF-SHA256 (RFC 5869).
- **Symmetric Encryption**: AES-256-GCM with a unique, cryptographically secure 12-byte initialization vector (IV) per packet.

### Q3: How does the system defend against replay attacks?
Each encrypted packet envelope includes:
1. A timestamp (accurate to the millisecond) representing when the envelope was compiled.
2. A strict monotonic nonce counter. 

The receiving client decrypts the envelope and validates that the timestamp is within $\pm 10$ seconds of the current local time, and that the nonce is strictly greater than the last received nonce from that sender ID. Packets failing these checks are immediately discarded.

### Q4: Where are the derived keys and secrets saved?
Keys are stored in platform-specific secure hardware vaults:
- **Windows**: Windows Credentials Manager using DPAPI.
- **macOS**: Keychain Services.
- **Linux**: Freedesktop Secret Service API via `libsecret`.
- **Android**: Android Keystore wrapping a database encrypted using SQLCipher.

### Q5: Can anyone connect to my desktop if they are on the same Wi-Fi?
No. While the desktop discovery service is public on the network via mDNS, the desktop WebSocket server rejects all incoming connections on `/ws` unless they complete a cryptographic handshake. This handshake requires decrypting a challenge signed with the unique derived $K_{sync}$ key, which is only established during the QR code pairing process.

---

## 🌐 Networking & Discovery

### Q6: What is mDNS, and how does ClipBridge use it?
Multicast DNS (mDNS) allows devices to resolve hostnames to IP addresses without a central DNS server. ClipBridge advertises a `_clipbridge._tcp` service. When the mobile app starts, it scans for this service type to automatically detect the IP address and port of your desktop client without requiring manual IP entries.

### Q7: What TCP port does ClipBridge use? Can I modify it?
By default, the server binds to port `54670`. If this port is occupied, Tauri will search for the next available port and update its mDNS advertisement. Manual port overrides can be specified in the settings screen or by editing `device_id.txt` config variables.

### Q8: Does ClipBridge work on public or hotel Wi-Fi networks?
Usually no, because most public Wi-Fi networks enforce **AP Isolation (Client Isolation)**. This router configuration prevents connected clients from talking directly to one another. To sync devices on public networks, we recommend setting up a mobile hotspot on your phone and connecting your desktop to it.

### Q9: Can I use ClipBridge across different subnets or VLANs?
mDNS multicasts are typically bounded to a single subnet (broadcast domain). If your phone is on a 5GHz VLAN and your desktop is on an Ethernet VLAN, auto-discovery will fail unless you configure an mDNS reflector (like Avahi or reflection on your router). You can still pair and sync by manually inputting the desktop's IP.

---

## 🔋 Battery & Resource Usage

### Q10: Will having a background sync service drain my mobile battery?
No. The mobile app implements energy-conserving states. Whenever the mobile application enters the background or the screen locks, it immediately suspends all active WebSocket reconnect loops and stops sending heartbeat PINGs. Reconnection and sync loops resume immediately when the application is brought back to the foreground.

### Q11: How much RAM and CPU does the desktop application consume?
Thanks to Tauri v2 and Rust, the desktop application consumes under 45 MB of RAM in the background and has a CPU usage of near 0% when idle. This is significantly lower than Electron-based alternatives which regularly occupy 150-350 MB of RAM.

---

## 🛠️ Troubleshooting

### Q12: Why does the mobile app show "Connection Timed Out" during pairing?
This is almost always caused by a firewall block on the desktop host:
- **Windows**: Add an inbound/outbound rule in Windows Defender Firewall allowing port `54670` for the Tauri executable.
- **macOS**: Go to System Settings > Network > Firewall, and allow incoming connections for ClipBridge.
- **Linux**: Configure `ufw` or `iptables` to open TCP port `54670`.

### Q13: What does the React Native error `URIError: Malformed decodeURI input` mean?
This error is related to a bug in the Hermes JavaScript engine's default `TextDecoder` polyfill, which throws exceptions when trying to decode raw, random binary buffers (like cryptographic keys). We resolved this in v2.0.0 by bundling a non-throwing UTF-8 polyfill fallback.

### Q14: How does the system handle clipboard sync loops?
Without prevention, copying a text on Desktop would send it to Mobile, which would set its clipboard, triggering a copy event, which would send it back to Desktop, causing an infinite loop. We prevent this by checking four constraints:
1. **Origin Verification**: Checking that `origin_device_id` is not our own.
2. **Duplicate Cache**: Storing the last 50 processed clip UUIDs and discarding matches.
3. **OS Deduplication**: Checking if the OS clipboard value already matches the content.
4. **Time-to-Live (TTL)**: Restricting payload packet hops.

### Q15: Why is my clipboard history not syncing after restarting the app?
Ensure you have enabled history preservation in the settings screen. On Desktop, history is saved to `history.json` in the AppData directory. If the file is corrupted or lacks write permissions, history saving will fail.

---

## 🚀 General & Roadmap

### Q16: Does ClipBridge support image or file clipboard syncing?
Currently, ClipBridge supports UTF-8 plain text. Image and file syncing is on our [Roadmap](file:///D:/Projects/ClipBridge/README.md#roadmap) for v2.1.0.

### Q17: Can I pair multiple phones to a single desktop?
Yes. The desktop server manages multiple connections concurrently. Each client is identified by its unique device UUID and has an independent encryption key `K_sync`.

### Q18: Is there support for macOS, Linux, and iOS?
Yes! The desktop app is fully compatible and builds on Windows, macOS (Intel & Apple Silicon), and Linux (AppImage/Debian). An iOS client is planned and will be built once React Native Expo upgrades are completed.

### Q19: How do I backup my pairing settings?
Copy the `pairing.json` file from your desktop AppData directory:
- **Windows**: `%APPDATA%/ClipBridge/pairing.json`
- **macOS**: `~/Library/Application Support/ClipBridge/pairing.json`
- **Linux**: `~/.config/ClipBridge/pairing.json`

### Q20: How can I contribute to the project?
Please read our [Contributing Guide](file:///D:/Projects/ClipBridge/CONTRIBUTING.md) for details on code style, commit conventions, and testing setups.
