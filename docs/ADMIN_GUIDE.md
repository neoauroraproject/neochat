# Admin Guide

NeoChat **1.0.0-rc.1** admin panel runs at `/admin/` (via gateway or Caddy).

## Dashboard & diagnostics

- **Dashboard** — system overview and quick diagnostics
- **Performance** — full health check aggregation (DB, Redis, MinIO, LiveKit, jobs, certs)

## TLS wizard

1. Open **TLS** in the admin nav
2. Choose mode: off, Caddy ACME, or custom certificate
3. Upload PEM cert/key or configure ACME email + domain
4. Review DNS/port hints and deployment checklist
5. Apply generated Caddyfile snippet on your reverse proxy

## Backup & restore

- **Create backup** — exports config JSON + PostgreSQL dump (ciphertext messages only)
- **Schedule** — enable nightly backups (03:00 UTC cron)
- **Restore** — requires explicit confirmation; stop API during restore in production

CLI alternatives: `./scripts/backup.sh`, `./scripts/restore.sh`

## Maintenance mode

Enable from **Maintenance** page. Non-admin API consumers receive HTTP 503. Admin and health endpoints remain available.

## Plugins

Discover plugins in the server `plugins/` directory. Enable/disable per plugin from **Plugins** page.

## Users & roles

| Role  | Access                  |
| ----- | ----------------------- |
| user  | Messaging, media, calls |
| admin | Full admin panel        |

Use **Users** to promote/demote roles or suspend accounts.
