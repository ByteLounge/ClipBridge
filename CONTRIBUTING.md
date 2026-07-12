# Contributing to ClipBridge

First off, thank you for taking the time to contribute! :heart:

ClipBridge is an open-source, community-driven project. We welcome contributions of all forms—bug reports, documentation updates, feature designs, and code modifications.

This document outlines the workflows, coding standards, and expectations for contributors.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](file:///D:/Projects/ClipBridge/CODE_OF_CONDUCT.md). Please report any unacceptable behavior to [support@clipbridge.org](mailto:support@clipbridge.org).

## How Can I Contribute?

### 1. Reporting Bugs
- Search existing [issues](https://github.com/ByteLounge/ClipBridge/issues) to ensure the bug hasn't already been reported.
- Open a new issue using our bug report template.
- Include OS version, device brand (for mobile), app version, and reproduction steps.
- Provide raw log traces if available.

### 2. Suggesting Features
- Open a new thread in [GitHub Discussions (Ideas)](https://github.com/ByteLounge/ClipBridge/discussions).
- Explain the problem, why current workflows fail, and your proposed interface or behaviour change.

### 3. Submitting Code Changes
- Fork the repository and create your branch from the `main` branch.
- Keep changes focused. Avoid mixing refactoring, feature additions, and typo fixes in a single pull request.

---

## Git Workflows & Conventions

### Branch Naming
Use descriptive, lowercase branch names prefixing the type of change:
- `feat/add-file-sharing`
- `fix/mdns-packet-drop`
- `docs/clarify-key-agreement`
- `refactor/clean-ws-state`

### Commit Message Guidelines
We follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification:
```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

#### Types
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation changes
- `style`: Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc.)
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process or auxiliary tools and libraries

#### Example
```
feat(desktop): add persistent device UUID storage

Generates a random UUID on first start and stores it in device_id.txt 
in Roaming/ClipBridge. Prevents ID mutation on relaunch.

Closes #142
```

---

## Coding Standards

### Rust (Desktop Backend)
- Format code using `cargo fmt` before staging.
- Resolve all compiler warnings and run `cargo clippy` to ensure optimal and safe practices.
- Add unit tests inside the module or integration tests in `tests/`.

### TypeScript / React / React Native (Frontend)
- Use functional components with hooks.
- Format codebase using Prettier (`npx prettier --write .`).
- Use explicit TypeScript types. Avoid using `any` whenever possible.

---

## Pull Request Checklist

Before submitting your pull request, verify:
- [ ] Code builds cleanly without compile-time errors or warnings.
- [ ] Linter is happy (`npm run lint` / `cargo clippy`).
- [ ] Tests pass locally (`npm run test` / `cargo test`).
- [ ] Commits are structured logically and follow Conventional Commits.
- [ ] Target branch is set to `main`.
- [ ] Documentation is updated (if proposing API, security, or setup alterations).
