# Support Guide

Thank you for using ClipBridge! We want to ensure your clipboard synchronization runs smoothly and securely. This guide outlines resources and channels for troubleshooting, configuration, and getting help.

## 🔍 Self-Service Resources

Before opening an issue or asking for support, please review these key documents:

* **[FAQ](file:///D:/Projects/ClipBridge/docs/FAQ.md)**: Frequently Asked Questions regarding compatibility, battery life, privacy, and troubleshooting.
* **[Troubleshooting FAQ Section](file:///D:/Projects/ClipBridge/docs/FAQ.md#troubleshooting)**: Quick answers for typical network issues.
* **[Architecture Guide](file:///D:/Projects/ClipBridge/docs/ARCHITECTURE.md)**: Deep dive into how discovery, connection management, and cryptography engines cooperate.
* **[Protocol Specification](file:///D:/Projects/ClipBridge/docs/PROTOCOL.md)**: A detailed look at the WebSocket schemas, packet exchange formats, and handshake dynamics.
* **[Development Guide](file:///D:/Projects/ClipBridge/docs/DEVELOPMENT.md)**: Instructions for compiling the apps from source, running development environments, and debugging.

## 🛠️ Common Connectivity Checklist

90% of sync failures are caused by local network configurations. Please verify:
1. **Same Local Network (Subnet)**: Ensure both your desktop and mobile device are connected to the same router or access point.
2. **AP/Client Isolation**: Many public or guest Wi-Fi networks block peer-to-peer communication. Try using a mobile hotspot to test if this is the cause.
3. **Firewall Settings**: ClipBridge runs on port `54670` by default. Verify that your desktop firewall permits incoming and outgoing connections on TCP port `54670`.
4. **mDNS Daemon**: mDNS relies on Multicast UDP on port `5353`. Ensure your local network allows multicast packets.

## 💬 Community Support Channels

If you cannot find the answer in the documentation, please use the appropriate channel below:

### 1. GitHub Discussions
* **Link**: [ClipBridge Discussions](https://github.com/ByteLounge/ClipBridge/discussions)
* **Use for**: General questions, installation help, feature ideas, and showing off your setups.

### 2. GitHub Issues
* **Link**: [ClipBridge Bug Tracker](https://github.com/ByteLounge/ClipBridge/issues)
* **Use for**: Bug reports, crash logs, and reproducible errors.
* **Submission Guidelines**:
  * Provide details about your OS (e.g., Windows 11 23H2, Android 14).
  * Attach relevant application logs or debug logs.
  * Provide reproduction steps.

---

*Note: ClipBridge is maintained by a dedicated team of open-source developers. Please treat fellow community members with respect, in accordance with our [Code of Conduct](file:///D:/Projects/ClipBridge/CODE_OF_CONDUCT.md).*
