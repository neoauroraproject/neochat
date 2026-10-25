# Migration Notes — 1.0.0-rc.1

## Database

Migration `0003_phase4_ops.sql`:

```sql
ALTER TABLE devices ADD COLUMN IF NOT EXISTS trusted_at TIMESTAMPTZ;
```

Run via `npm run db:migrate`.

## Configuration categories

New keys (defaults applied automatically):

| Category | Keys                                                               |
| -------- | ------------------------------------------------------------------ |
| general  | `maintenanceMode`, `maintenanceMessage`, `disabledPlugins`         |
| security | `loginMaxAttempts`, `loginLockoutMinutes`                          |
| backup   | `scheduleEnabled`, `cronExpression`, `retentionCount`, `backupDir` |

## Environment

- `CALL_PROVIDER` default changed from `none` to `livekit` in compose/bootstrap
- No breaking changes to JWT or crypto formats

## Admin API additions

- `/admin/backup/*`
- `/admin/plugins` (PATCH enable/disable)
- `/admin/maintenance`
- `/admin/permissions/templates`
- Enhanced `/admin/tls` response payload
- `/metrics` (Prometheus text)
