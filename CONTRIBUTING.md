# Contributing to ClipBridge

First off, thank you for considering contributing to ClipBridge! It's people like you that make ClipBridge such a great tool for sharing clipboards securely.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. Please be respectful and supportive of other contributors.

## How Can I Contribute?

### Reporting Bugs

- Search the issue tracker to ensure the bug hasn't already been reported.
- If you can't find an open issue, open a new one. Include a clear title, a description of the issue, steps to reproduce, and the expected behavior.

### Suggesting Enhancements

- Open a feature request issue.
- Describe the feature you'd like to see, why it would be useful, and how it fits into the "Apple-quality UX" goals of ClipBridge.

### Pull Requests

1. Fork the repository and create your branch from `main`.
2. Write clear, documented, and well-tested code.
3. Keep changes as focused and small as possible.
4. Ensure all CI checks (linter, unit tests) pass.
5. Submit a pull request with a detailed description of the changes.

## Development Guidelines

### Code Style

- **Desktop (Rust)**: Run `cargo fmt` and `cargo clippy` before committing. Follow standard Rust naming conventions.
- **Desktop (React/TypeScript)**: Follow ESLint rules. Use Prettier to format. Prefer functional components with hooks.
- **Android (Kotlin)**: Follow Kotlin style guidelines and Android Kotlin style guide. Use Jetpack Compose formatting.

### Security Principles

Since ClipBridge handles clipboard sync, security is a tier-1 priority:
1. **Never** transmit clipboard content in plaintext.
2. **Never** log sensitive clipboard content or private keys.
3. Validate all inputs, size limits, and nonces to prevent replay/overflow attacks.
4. Use standard cryptographic libraries (**ring** in Rust, **Android Keystore** in Kotlin). Do not roll your own crypto implementations.
