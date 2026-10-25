# Folder structure

```
NeoChat/
├── apps/
│   ├── api/                 # NestJS REST API
│   │   ├── src/
│   │   │   ├── admin/       # Admin endpoints
│   │   │   ├── auth/        # Auth + setup wizard
│   │   │   ├── config/      # Configuration service
│   │   │   ├── database/    # Drizzle schema + migrations
│   │   │   ├── health/      # Health checks
│   │   │   ├── providers/   # Provider wiring (Nest module)
│   │   │   ├── plugin-loader/
│   │   │   ├── system/
│   │   │   └── users/
│   │   ├── drizzle/         # Generated SQL migrations
│   │   └── Dockerfile
│   ├── web/                 # User-facing PWA (Vite + React)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── lib/
│   │   │   └── stores/
│   │   └── Dockerfile
│   └── admin/               # Admin SPA (Vite + React)
│       ├── src/pages/
│       └── Dockerfile
├── packages/
│   ├── shared/              # @neochat/shared — Zod DTOs + types
│   ├── config/              # @neochat/config — bootstrap env schema
│   ├── crypto/              # @neochat/crypto — E2EE primitives
│   ├── i18n/                # @neochat/i18n — locales + RTL
│   ├── ui/                  # @neochat/ui — shared React components
│   ├── providers/           # @neochat/providers — adapter interfaces
│   ├── plugins/             # @neochat/plugins — plugin host types
│   └── sdk/                 # @neochat/sdk — client SDK scaffold
├── deploy/
│   ├── docker-compose.yml   # Foundation stack (Phase 2)
│   ├── docker-compose.tls.yml
│   ├── nginx/gateway.conf
│   ├── caddy/
│   └── livekit/             # Optional (--profile livekit)
├── docs/                    # Project documentation
├── scripts/                 # Backup, offline bundle builders
├── .husky/                  # Git hooks (pre-commit, commit-msg)
├── eslint.config.js         # Root ESLint flat config
├── tsconfig.base.json       # Shared TS config + path aliases
├── .env.example             # Bootstrap env template
└── package.json             # Workspace root
```

## Naming conventions

- npm packages: `@neochat/<short-name>` (no `-schema` or `-types` suffixes)
- API routes: global prefix `/api/v1`
- Docker Compose project name: `neochat`
- Internal network: `neochat`

## What is not in Phase 2

- `apps/api/src/messages/`, `chats/`, etc. — deferred messaging modules
- LiveKit in default Compose profile
- External plugin packages under `plugins/` (workspace entry reserved in `pnpm-workspace.yaml`)

## Key config files

| File                               | Purpose                        |
| ---------------------------------- | ------------------------------ |
| `tsconfig.base.json`               | Strict TS + `@neochat/*` paths |
| `packages/config/src/bootstrap.ts` | Env validation schema          |
| `deploy/docker-compose.yml`        | Full foundation stack          |
| `commitlint.config.js`             | Conventional Commits scopes    |
