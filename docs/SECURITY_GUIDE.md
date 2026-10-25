# Security Guide

## Authentication

- Passwords hashed with **Argon2id**
- JWT access tokens (short TTL) + rotating refresh tokens
- Login brute-force lockout via Redis (configurable in `security.loginMaxAttempts`)

## Transport

- Enable TLS via admin wizard or Caddy overlay (`deploy/docker-compose.tls.yml`)
- HSTS and HTTP→HTTPS redirect configurable in `https` config category

## Headers

The API sets Helmet security headers including CSP suitable for the SPA and LiveKit WebSockets.

## Trusted devices

Users can mark a device trusted after password confirmation (`POST /auth/devices/:id/trust`). Trusted status appears in session list.

## Audit

Admin actions are logged to `admin_audit_log`. Review from **Audit** page.

## Recommendations

1. Set strong `JWT_ACCESS_SECRET` and `JWT_REFRESH_PEPPER` in `.env`
2. Disable open registration unless required
3. Enable maintenance mode during upgrades
4. Schedule backups and mirror MinIO separately
5. Run `npm audit` regularly (root script provided)
