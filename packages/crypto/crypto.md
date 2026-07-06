# ClipBridge Cryptographic Specification

ClipBridge relies on robust, standard cryptographic primitives to ensure clipboard data privacy, authenticity, and integrity across the local network. 

No plaintext data is sent over the network at any time.

---

## 1. Cryptographic Primitives

ClipBridge uses the following standard algorithms:
- **Key Agreement (Diffie-Hellman)**: X25519 (RFC 7748)
- **Key Derivation**: HKDF-SHA256 (RFC 5869)
- **Authenticated Symmetric Encryption**: AES-256-GCM (12-byte IV, 16-byte Auth Tag)
- **Secure Hash**: SHA-256 (for device identification and validation hashes)
- **Random Number Generation**: Cryptographically secure pseudo-random generators (`ring::rand` in Rust, `SecureRandom` in Android)

---

## 2. Key Exchange & Pairing Flow

Pairing is performed via an out-of-band channel (QR Code scanning) to establish a trust relationship.

### A. QR Code Data Format
When a Desktop client initializes, it generates a persistent X25519 identity keypair. The QR Code displays:
```
cbpair:<device_id>:<x25519_public_key_hex>:<device_name>
```
*Example*: `cbpair:6c2a8684-2a62-421b-8531-10c538ab82cf:1a84f3e...c238:OfficeMacBook`

### B. Pair Handshake
1. Android scans the QR code, acquiring the Desktop's `device_id`, Public Key ($PK_{desktop}$), and name.
2. Android generates an ephemeral or persistent X25519 keypair ($SK_{android}$, $PK_{android}$).
3. Android establishes a direct WebSocket connection to Desktop `/pair` and sends:
   - Android Device ID
   - Android Display Name
   - Android Public Key ($PK_{android}$)
4. Desktop receives the request. Since it is in "Pairing Mode", it accepts the connection and records Android's metadata.
5. Both clients compute the ECDH Shared Secret:
   - $Secret = X25519(SK_{android}, PK_{desktop}) = X25519(SK_{desktop}, PK_{android})$
6. The shared secret is passed through HKDF-SHA256 to derive the 256-bit symmetric encryption key `K_sync`:
   - $K\_sync = HKDF\_Extract(Salt=empty, IKM=Secret)$
   - $K\_sync = HKDF\_Expand(PRK, Info="clipbridge-sync-key", Length=32)$
7. Both clients store `K_sync` in secure hardware-backed storage associated with the counterpart's `device_id`:
   - **Windows**: Windows Credentials Manager or encrypted user directory using DPAPI.
   - **macOS**: Keychain Services.
   - **Linux**: Secret Service API (via libsecret) or keyring.
   - **Android**: Android Keystore (backed by StrongBox / TEE if available), wrapping a master key that encrypts a local SQLite database (SQLCipher) or EncryptedSharedPreferences.

---

## 3. Payload Encryption & Decryption

Every message package transmitted over the network uses authenticated encryption.

### A. Nonce (IV) Generation
- Every encrypted message MUST use a unique 12-byte initialization vector (IV).
- The IV consists of:
  - First 8 bytes: Unix timestamp in milliseconds (big-endian).
  - Last 4 bytes: Cryptographically secure random bytes.
- Under no circumstances should the same IV be reused with the same symmetric key.

### B. Encryption
- Plaintext payload is serialised as JSON.
- Encrypted using AES-256-GCM with $K\_sync$.
- The output consists of:
  - `ciphertext`: Encrypted payload
  - `tag`: 16-byte (128-bit) GCM authentication tag
- The message envelope compiles `sender_id`, `nonce` (IV), `ciphertext`, and `tag` into a WebSocket packet.

### C. Decryption & Validation
Upon receiving a message envelope:
1. Lookup $K\_sync$ using the `sender_id`. If not paired, drop the packet.
2. Verify the `nonce` timestamp. It must be within 10 seconds of the receiver's current time to prevent replay attacks.
3. Validate that the nonce is larger than the previously received nonce from this specific sender (Strict Monotonic Nonces).
4. Decrypt the payload using AES-256-GCM, validating the authentication tag. If authentication fails, close the connection immediately.
5. Parse the JSON payload and execute OS clipboard sync.
