# NeoChat operations guide

Short reference for self-hosting NeoChat with Docker Compose. For architecture and development,
see [`ARCHITECTURE.md`](ARCHITECTURE.md) and [`DEVELOPMENT.md`](DEVELOPMENT.md).

## Prerequisites

- Docker Engine 24+ with Compose v2.24+ (for TLS overlay `!reset` merge)
- 4 GB+ RAM recommended (PostgreSQL, Redis, MinIO, API, frontends)
- Open ports: Stage-1 `NEOCHAT_HTTP_PORT` (default **8085**); Stage-2 **80/443**

## Stage-1 — HTTP on one port

1. Copy and edit bootstrap env:

   ```bash
   cp .env.example .env
   # Set JWT_ACCESS_SECRET, JWT_REFRESH_PEPPER, POSTGRES_PASSWORD, MINIO_SECRET_KEY
   # STORAGE_PROVIDER=minio (default)
   ```

2. Build and start the stack:

   ```bash
   docker compose -f deploy/docker-compose.yml --env-file .env up -d --build
   ```

3. Run database migrations (from repo checkout):

   ```bash
   npm run db:migrate
   npm run db:seed   # optional demo admin + feature flags
   ```

   Phase 3 requires migration **`0001_messaging`** (chats, messages, keys, media tables).
   This runs automatically via `npm run db:migrate` after `0000_foundation`.

   Or against the running Postgres container:

   ```bash
   DATABASE_URL=postgres://neochat:neochat@localhost:5432/neochat npm run db:migrate
   ```

4. Open:

   | Surface | URL                                         |
   | ------- | ------------------------------------------- |
   | Web     | http://localhost:8085/                      |
   | Admin   | http://localhost:8085/admin/                |
   | API     | http://localhost:8085/api/v1/…              |
   | Health  | http://localhost:8085/api/v1/health/live    |
   | Swagger | http://localhost:8085/api/docs (if exposed) |

5. First-run setup: visit the web app or `GET /api/v1/auth/setup`, then `POST /api/v1/auth/setup`.

### Stage-1 routing

The `gateway` service (nginx) publishes `NEOCHAT_HTTP_PORT` and routes:

- `/` → web static SPA
- `/admin/` → admin SPA (built with Vite base `/admin/`)
- `/api/` → API (prefix stripped; API serves `/api/v1/…`)
- `/socket.io/` → API WebSocket (messaging realtime)

### Compose services (Phase 3 default)

| Service            | Purpose                                             |
| ------------------ | --------------------------------------------------- |
| postgres           | Primary database                                    |
| redis              | Sessions, rate limits, pub/sub, presence            |
| minio + minio-init | Object storage for media (`STORAGE_PROVIDER=minio`) |
| api                | NestJS backend + Socket.IO                          |
| web                | User PWA (nginx)                                    |
| admin              | Admin SPA (nginx)                                   |
| gateway            | Single HTTP entrypoint                              |

LiveKit is **optional** (not Phase 3): `--profile livekit`. Set `CALL_PROVIDER=livekit` when enabled.

## MinIO operations

Default credentials are in `.env.example`. For production, rotate `MINIO_SECRET_KEY`.

| Task         | Command                                                         |
| ------------ | --------------------------------------------------------------- |
| Check health | `curl http://localhost:9000/minio/health/live`                  |
| Console      | http://localhost:9001                                           |
| Bucket       | `${MINIO_BUCKET:-neochat-media}` (auto-created by `minio-init`) |

Backup MinIO data separately from Postgres — see Backups below.

## Messaging feature flags

Toggle via Admin → Feature flags or API:

| Flag                  | Default | Effect         |
| --------------------- | ------- | -------------- |
| `messaging.enabled`   | true    | Master switch  |
| `messaging.groups`    | true    | Group chats    |
| `messaging.channels`  | true    | Channels       |
| `messaging.reactions` | true    | Reactions      |
| `messaging.search`    | true    | Message search |

Reseed defaults: `npm run db:seed` (upserts flags).

## Stage-2 — HTTPS with Caddy

1. Edit placeholders in `deploy/caddy/Caddyfile` (`NEOCHAT_DOMAIN`, cert paths).
2. Set in `.env`:

   ```env
   NEOCHAT_DOMAIN=chat.example.com
   ACME_EMAIL=admin@example.com
   PUBLIC_API_URL=https://chat.example.com/api
   PUBLIC_WEB_URL=https://chat.example.com
   PUBLIC_ADMIN_URL=https://chat.example.com/admin
   ```

3. Start with TLS overlay:

   ```bash
   docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.tls.yml \
     --profile caddy --env-file .env up -d --build
   ```

## Local development (infra in Docker, apps via npm)

```bash
cp .env.example .env
docker compose -f deploy/docker-compose.yml --env-file .env up -d postgres redis minio minio-init
npm install
npm run db:migrate
npm run dev
```

- API: http://localhost:3000
- Web: http://localhost:5173
- Admin: http://localhost:5174

## Backups

```bash
./scripts/backup.sh
```

Creates `backups/neochat-backup-<timestamp>.tar.gz` with a PostgreSQL logical dump.

**MinIO media is not included** — mirror the `MINIO_BUCKET` separately (e.g. `mc mirror`).
Keep `.env` and JWT secrets with backups.

## Offline / air-gapped bundle

```bash
./scripts/build-offline-bundle.sh
# Windows: .\scripts\build-offline-bundle.ps1
```

After loading images, run `npm run db:migrate` to apply `0001_messaging`.

## Health checks

| Service  | Check                                                 |
| -------- | ----------------------------------------------------- |
| postgres | `pg_isready`                                          |
| redis    | `redis-cli ping`                                      |
| minio    | `/minio/health/live`                                  |
| api      | `GET /api/v1/health/live`, `GET /api/v1/health/ready` |
| storage  | `GET /api/v1/health/diagnostics` → `checks.storage`   |
| gateway  | `GET /healthz`                                        |

Admin dashboard shows full diagnostics: database, redis, storage, disk, memory, CPU, plugins, TLS.

## Monorepo scripts

| Command                                               | Purpose                                |
| ----------------------------------------------------- | -------------------------------------- |
| `npm run dev`                                         | All workspaces in dev mode             |
| `npm run build`                                       | Production build                       |
| `npm run db:migrate`                                  | Apply Drizzle migrations (0000 + 0001) |
| `npm run lint` / `npm run typecheck` / `npm run test` | Quality gates                          |

## Troubleshooting

- **API unhealthy**: confirm `DATABASE_URL` / `REDIS_URL` use Compose service names (`postgres`, `redis`) inside containers, not `localhost`.
- **502 on /api**: wait for API healthcheck; check `docker compose logs api`.
- **Admin assets 404**: admin must be served under `/admin/`; rebuild with `VITE_BASE=/admin/`.
- **Storage degraded**: verify MinIO is healthy; check `STORAGE_PROVIDER=minio` and bucket exists.
- **Messages not realtime**: ensure gateway proxies `/socket.io/` to API; check firewall/WebSocket support.
- **Migration 0001 fails**: ensure Postgres 16+; check `docker compose logs postgres`.
- **Env validation errors**: compare `.env` against `packages/config/src/bootstrap.ts`.

## Related docs

- [`API_REFERENCE.md`](API_REFERENCE.md)
- [`USER_GUIDE.md`](USER_GUIDE.md)
- [`PLUGIN_API.md`](PLUGIN_API.md)
- [`INSTALLATION.md`](INSTALLATION.md)
- [`CONTRIBUTING.md`](CONTRIBUTING.md)
