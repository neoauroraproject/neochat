# Security Policy

## Supported versions

| Version     | Supported          |
| ----------- | ------------------ |
| 1.0.0-rc.1  | :white_check_mark: |
| 0.3.0-alpha | :x:                |

## Reporting a vulnerability

Please report security issues privately:

1. Open a **Security advisory** on GitHub (preferred), or email your NeoChat operator/maintainer
2. Include reproduction steps, impact assessment, and affected version
3. Allow up to 90 days for coordinated disclosure before public discussion

Do **not** open public issues for undisclosed vulnerabilities.

## Security features in 1.0.0-rc.1

- Argon2id password hashing
- JWT access + rotating refresh tokens
- End-to-end encrypted message payloads (server stores ciphertext only)
- Helmet security headers and CSP
- Redis-backed login lockout
- Rate limiting on auth endpoints
- Admin audit log
- TLS wizard with certificate validation

See [SECURITY_GUIDE.md](docs/SECURITY_GUIDE.md) for hardening recommendations.
