# FAQ

## What license is NeoChat?

AGPL-3.0-or-later. See [LICENSE](../LICENSE).

## Does the server see message plaintext?

No. Messages are stored as ciphertext. Backups export ciphertext only.

## Is LiveKit required?

Enabled by default in v1 Docker Compose. Set `CALL_PROVIDER=none` to disable calls.

## Can I run without Docker?

Yes — use `npm run dev:api` with Postgres, Redis, and MinIO installed locally.

## How do I enable HTTPS?

Use the admin TLS wizard or deploy with `docker-compose.tls.yml` and Caddy profile.

## Are plugins sandboxed?

No. Plugins run in-process. Only install trusted plugins.

## Where are backups stored?

Default: `./data/backups` (configurable via `backup.backupDir`).

## How do I report security issues?

See [SECURITY.md](../SECURITY.md).
