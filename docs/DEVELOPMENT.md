# Development guide

## Prerequisites

- Node.js >= 20.11
- npm >= 10 (workspaces)
- Docker Engine with Compose v2 (for PostgreSQL, Redis, MinIO)

## Initial setup

```bash
git clone <repo-url> neochat && cd neochat
cp .env.example .env
npm install
```

Husky hooks install automatically via the `prepare` script.

## Infrastructure

Start backing services only (recommended for daily dev):

```bash
docker compose -f deploy/docker-compose.yml --env-file .env up -d postgres redis minio minio-init
```

Ensure `.env` has `STORAGE_PROVIDER=minio` for media uploads.

Database (Phase 3 requires migration `0001_messaging`):

```bash
npm run db:migrate
npm run db:seed   # optional demo admin + feature flags
```

## Running apps

```bash
npm run dev           # all workspaces
npm run dev:api       # API only (port 3000)
npm run dev:web       # Web PWA (port 5173)
npm run dev:admin     # Admin SPA (port 5174)
```

Swagger UI (API): http://localhost:3000/api/docs

## Admin development

The admin app proxies API calls to `VITE_API_URL` (empty = same origin). In dev, configure
`apps/admin/.env` if needed:

```env
VITE_API_URL=http://localhost:3000
```

Build admin alone:

```bash
npm run build -w @neochat/admin
```

## Quality gates

```bash
npm run typecheck     # tsc --noEmit in each workspace
npm run lint          # ESLint flat config (root)
npm run format:check  # Prettier
npm run test          # workspace tests (crypto has unit tests)
npm run build         # production build all packages
```

Pre-commit runs `lint-staged` (ESLint --fix + Prettier). Commit messages are validated with
Conventional Commits via commitlint.

## Path aliases

`tsconfig.base.json` maps `@neochat/*` to package source:

| Alias                | Package              |
| -------------------- | -------------------- |
| `@neochat/shared`    | `packages/shared`    |
| `@neochat/config`    | `packages/config`    |
| `@neochat/crypto`    | `packages/crypto`    |
| `@neochat/i18n`      | `packages/i18n`      |
| `@neochat/ui`        | `packages/ui`        |
| `@neochat/providers` | `packages/providers` |
| `@neochat/plugins`   | `packages/plugins`   |
| `@neochat/sdk`       | `packages/sdk`       |

Apps extend the base config; prefer workspace dependencies in `package.json` over deep imports.

## Adding a workspace package

1. Create under `packages/<name>` with `name: "@neochat/<name>"`
2. Add path alias in `tsconfig.base.json`
3. Wire dependency in consuming `package.json` with `"@neochat/<name>": "*"`
4. Run `npm install` from root to refresh the lockfile

## Environment variables

Only bootstrap variables belong in `.env`. See `.env.example` and
`packages/config/src/bootstrap.ts`. Do not read `process.env` in feature modules.

Phase 3 additions:

| Variable           | Purpose                             |
| ------------------ | ----------------------------------- |
| `STORAGE_PROVIDER` | `minio`, `s3`, `local`, or `noop`   |
| `MINIO_*`          | MinIO endpoint, credentials, bucket |

## Docker full stack (local smoke test)

```bash
docker compose -f deploy/docker-compose.yml --env-file .env up -d --build
npm run db:migrate
```

Gateway: http://localhost:8085

## Troubleshooting

- **Port conflicts** — adjust `POSTGRES_HOST_PORT`, `REDIS_HOST_PORT`, or app dev ports in `.env`
- **API cannot connect to DB** — use `localhost` in `.env` for host dev; use service names (`postgres`, `redis`) inside Compose
- **Stale types** — run `npm run build -w @neochat/shared` after changing shared DTOs
- **Media upload 503** — verify MinIO is running and `STORAGE_PROVIDER=minio`
- **Migration errors** — ensure both `0000_foundation` and `0001_messaging` are applied
