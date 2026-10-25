# Troubleshooting

## API won't start

- Verify `DATABASE_URL` and `REDIS_URL` in `.env`
- Run `npm run db:migrate`
- Check logs: `docker compose logs api`

## Health check degraded

| Check        | Common cause                                     |
| ------------ | ------------------------------------------------ |
| database     | Postgres not ready, wrong credentials            |
| redis        | Redis unreachable                                |
| storage      | MinIO down or noop provider in dev               |
| calls        | LiveKit not running when `CALL_PROVIDER=livekit` |
| certificates | TLS config incomplete or cert expired            |

## Login lockout

After repeated failures, wait `security.loginLockoutMinutes` (default 15) or flush Redis key `auth:login:lock:*`.

## Maintenance mode stuck

Admin → Maintenance → Disable, or set `general.maintenanceMode` false via config API.

## WebSocket failures

Ensure CSP `connect-src` allows your domain and LiveKit `wss://` endpoint.

## Backup restore fails

- Confirm backup archive contains `postgres.sql` or `critical-tables.sql`
- Stop API during restore to avoid concurrent writes
- Keep original JWT secrets when restoring to another host
