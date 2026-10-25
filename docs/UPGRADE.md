# Upgrade Guide

## Upgrading to 1.0.0-rc.1 from 0.3.0-alpha

1. **Backup** — run `./scripts/backup.sh` or admin backup before upgrading
2. **Pull** latest code / load new Docker images
3. **Install** — `npm install` (monorepo root)
4. **Migrate** — `npm run db:migrate` (adds `devices.trusted_at`)
5. **Build** — `npm run build`
6. **Configure** — review `.env` for `CALL_PROVIDER=livekit`
7. **Restart** services

## Docker Compose

```bash
docker compose -f deploy/docker-compose.yml --env-file .env up -d --build
```

For TLS overlay, add `-f deploy/docker-compose.tls.yml --profile caddy`.

## Post-upgrade checks

- `GET /api/v1/health/ready` → ok
- Admin panel loads
- Login and messaging smoke test
- LiveKit health if calls enabled

See [MIGRATION.md](./MIGRATION.md) for schema changes.
