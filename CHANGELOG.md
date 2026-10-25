# Changelog

All notable changes to NeoChat are documented in this file.

## [1.0.0-rc.1] - 2026-07-21

### Added

- TLS wizard API with PEM validation, cert expiry checks, Caddyfile hints, and reverse-proxy documentation
- Backup & restore admin API (`/admin/backup/*`) with scheduled backup config
- Expanded health diagnostics: LiveKit/calls, MinIO/storage, jobs, cert expiry
- Prometheus-style `/api/v1/metrics` endpoint
- Security hardening: Helmet CSP, global rate limiting, Redis login lockout, trusted devices
- Plugin SDK `createPlugin` helper and admin plugin enable/disable API
- Maintenance mode with 503 for non-admin users
- Admin pages: Backup, Performance, Maintenance; enhanced TLS and Plugins
- Release documentation, GitHub templates, offline bundle checksums/SBOM note
- LiveKit enabled by default in Docker Compose for v1

### Changed

- Version bump from 0.3.0-alpha to 1.0.0-rc.1 across all workspaces
- `CALL_PROVIDER` defaults to `livekit` in compose and bootstrap env

## [0.3.0-alpha]

- Phase 3 messaging, E2E crypto, admin panel foundations
