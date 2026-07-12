# Security Policy

We take the security and privacy of ClipBridge and its users extremely seriously. ClipBridge is designed as an account-free, local-only, end-to-end encrypted service to prevent unauthorized interception of sensitive clipboard contents.

This document outlines how to report security vulnerabilities, how we address them, and our security model.

## Supported Versions

Only the latest major version receives security updates. We encourage all users to update their clients regularly.

| Version | Supported          |
| ------- | ------------------ |
| v2.x    | :white_check_mark: |
| v1.x    | :x:                |

## Security Model

ClipBridge relies on three core tenets to keep your data secure:
1. **Local-Only Boundary**: Data is transmitted directly between devices via local TCP connections and is never routed through third-party cloud servers (unless you intentionally configure a custom Relay Server).
2. **Cryptographic Secrecy (E2EE)**: Payloads are encrypted using **AES-256-GCM** with a key derived via **X25519** ECDH and HKDF-SHA256. Secret keys are generated out-of-band during the physical QR pairing phase.
3. **Replay Protection**: Messages include cryptographically checked timestamps and monotonically incrementing nonces to prevent attackers from replaying captured encrypted payloads.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security bugs.**

If you discover a security vulnerability, please report it privately:
- Email us directly at: [security@clipbridge.org](mailto:security@clipbridge.org)
- Encrypt your message using our PGP key (available on public key servers: Key ID `0xCB1B5EC32BB0446A`).

We will acknowledge receipt of your report within 48 hours and provide a detailed timeline for investigation and resolution. We aim to patch all critical vulnerabilities within 14 days of discovery.

## Preferred Disclosure Policy

We support coordinated vulnerability disclosure. Please allow us reasonable time to deploy updates to users across platforms (App Stores and binary distributions) before publishing details of the vulnerability.

## Security Acknowledgements

If you responsibly report a verified vulnerability that leads to a security advisory, we will gladly credit you in our [CHANGELOG.md](file:///D:/Projects/ClipBridge/CHANGELOG.md) and security advisories. Thank you for helping keep the community secure!
