# NeoChat 1.0.0-rc.1 Release Notes

NeoChat **1.0.0-rc.1** is the first release candidate for self-hosted secure messaging.

## Highlights

- **Operations**: Backup/restore API, scheduled backups, enhanced health diagnostics, Prometheus metrics
- **Security**: Helmet headers, login brute-force protection, trusted devices, maintenance mode
- **TLS**: Admin wizard with cert upload, expiry validation, deployment checklist
- **Plugins**: SDK finalize with `createPlugin`, admin enable/disable
- **Docker**: LiveKit included by default; TLS overlay unchanged

## Upgrade from 0.3.0-alpha

1. Pull latest sources and run `npm install && npm run build`
2. Apply migration: `npm run db:migrate`
3. Review new `.env` defaults (`CALL_PROVIDER=livekit`)
4. Configure backup directory via admin or `backup.backupDir` config

## Known limitations (rc.1)

- Plugin hooks are discovery/config only; full runtime hook surfaces ship post-rc
- Full pg_restore may require manual steps for production databases
- SSO, federation, and AI features are out of scope for v1

See [UPGRADE.md](docs/UPGRADE.md) and [MIGRATION.md](docs/MIGRATION.md) for details.
