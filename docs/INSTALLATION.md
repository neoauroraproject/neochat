# Installation

## Requirements

| Component | Minimum                     |
| --------- | --------------------------- |
| Node.js   | 20.11+                      |
| npm       | 10+                         |
| Docker    | 24+ with Compose v2         |
| RAM       | 4 GB (full Docker stack)    |
| Disk      | 2 GB free (+ media storage) |

## From source (development)

```bash
cp .env.example .env
npm install
docker compose -f deploy/docker-compose.yml --env-file .env up -d postgres redis minio minio-init
npm run db:migrate
npm run db:seed
npm run dev
```

## Production (Docker Compose)

1. Copy and edit environment:

   ```bash
   cp .env.example .env
   ```

   **Required changes for production:**

   - `JWT_ACCESS_SECRET` — `openssl rand -hex 32`
   - `JWT_REFRESH_PEPPER` — `openssl rand -hex 32`
   - `POSTGRES_PASSWORD`
   - `MINIO_SECRET_KEY`
   - `PUBLIC_*_URL` — your public URLs
   - `STORAGE_PROVIDER=minio` (default)

2. Build and start:

   ```bash
   docker compose -f deploy/docker-compose.yml --env-file .env up -d --build
   npm run db:migrate
   ```

   This applies both foundation (`0000_foundation`) and messaging (`0001_messaging`) migrations.

3. Open http://localhost:8085 and complete first-run setup.

## Services

### MinIO (object storage) — required for Phase 3 media

Included by default in Compose. The API uses MinIO for presigned media uploads when
`STORAGE_PROVIDER=minio`.

- API bucket: `MINIO_BUCKET` (default `neochat-media`)
- Console: http://localhost:9001 (default credentials in `.env.example`)
- `minio-init` service creates the bucket on first start

### LiveKit (voice/video calls)

**Enabled by default in v1.** LiveKit starts with the main Compose stack. Disable with `CALL_PROVIDER=none` in `.env` if calls are not needed.

```bash
docker compose -f deploy/docker-compose.yml --env-file .env up -d livekit
```

### HTTPS (Caddy)

See [`OPS.md`](OPS.md) and `deploy/docker-compose.tls.yml`.

## Offline / air-gapped

On a connected machine:

```bash
./scripts/build-offline-bundle.sh
# Windows: .\scripts\build-offline-bundle.ps1
```

Transfer the tarball, load images, copy `.env`, run migrations, and start Compose. Verify with `SHA256SUMS`. The bundle includes `SBOM-package-lock.json`, `scripts/backup.sh`, and `scripts/restore.sh`.

## Post-install checks

| Check        | URL / command                                                                   |
| ------------ | ------------------------------------------------------------------------------- |
| API live     | `curl http://localhost:8085/api/v1/health/live`                                 |
| Storage      | `curl http://localhost:8085/api/v1/health/diagnostics` (check `storage` status) |
| Gateway      | `curl http://localhost:8085/healthz`                                            |
| Setup status | `curl http://localhost:8085/api/v1/auth/setup`                                  |
| Admin        | http://localhost:8085/admin/                                                    |

## Upgrading from Phase 2

1. Pull latest source or load new offline bundle
2. `docker compose ... up -d --build`
3. **`npm run db:migrate`** — applies `0001_messaging` if not yet run
4. Reseed feature flags if needed: `npm run db:seed` (idempotent for flags)
5. Review [`OPS.md`](OPS.md) for backup/rollback procedures

## Upgrading (general)

1. Pull latest source or load new offline bundle
2. `docker compose ... up -d --build`
3. `npm run db:migrate`
4. Review `docs/OPS.md` for backup/rollback procedures
