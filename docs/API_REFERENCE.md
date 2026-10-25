# API Reference (Phase 3)

Base URL: `/api/v1` (via gateway: `http://localhost:8085/api/v1`).

Interactive Swagger UI: `http://localhost:3000/api/docs` (dev) or `/api/docs` when exposed.

Authentication: Bearer JWT access token unless marked **Public**. Admin routes require `server_admin` role.

## Auth

| Method | Path                 | Description                                     |
| ------ | -------------------- | ----------------------------------------------- |
| GET    | `/auth/setup`        | **Public** — first-run setup status             |
| POST   | `/auth/setup`        | **Public** — complete first-run setup           |
| POST   | `/auth/register`     | **Public** — register with invite (if required) |
| POST   | `/auth/login`        | **Public** — login, returns token pair          |
| POST   | `/auth/refresh`      | **Public** — rotate refresh token               |
| POST   | `/auth/logout`       | **Public** — revoke session via refresh token   |
| GET    | `/auth/sessions`     | List active sessions                            |
| DELETE | `/auth/sessions/:id` | Revoke a session                                |
| POST   | `/auth/password`     | Change password                                 |

## Users

| Method | Path                    | Description                  |
| ------ | ----------------------- | ---------------------------- |
| GET    | `/users/me`             | Current user profile         |
| PATCH  | `/users/me`             | Update profile               |
| GET    | `/users/me/devices`     | List devices                 |
| DELETE | `/users/me/devices/:id` | Revoke device                |
| GET    | `/users/search?q=`      | Search users                 |
| POST   | `/users/me/avatar`      | Presigned avatar upload slot |

## Chats

| Method | Path                                 | Description                  |
| ------ | ------------------------------------ | ---------------------------- |
| GET    | `/chats`                             | List chats for current user  |
| POST   | `/chats`                             | Create DM, group, or channel |
| GET    | `/chats/:id`                         | Get chat details             |
| PATCH  | `/chats/:id`                         | Update chat metadata         |
| GET    | `/chats/:id/members`                 | List members                 |
| POST   | `/chats/:id/members`                 | Add members                  |
| PATCH  | `/chats/:id/members/:userId`         | Update member role           |
| POST   | `/chats/:id/join`                    | Join channel                 |
| POST   | `/chats/:id/leave`                   | Leave chat                   |
| POST   | `/chats/:id/read`                    | Mark read cursor             |
| POST   | `/chats/:id/messages/:messageId/pin` | Pin message                  |
| DELETE | `/chats/:id/messages/:messageId/pin` | Unpin message                |
| GET    | `/chats/:id/draft`                   | Get draft                    |
| PUT    | `/chats/:id/draft`                   | Upsert draft                 |
| DELETE | `/chats/:id/draft`                   | Delete draft                 |

## Messages

| Method | Path                             | Description                                   |
| ------ | -------------------------------- | --------------------------------------------- |
| GET    | `/chats/:chatId/messages`        | Paginated message history (`cursor`, `limit`) |
| POST   | `/messages`                      | Send encrypted message                        |
| PATCH  | `/messages/:id`                  | Edit message                                  |
| DELETE | `/messages/:id`                  | Soft-delete message                           |
| POST   | `/messages/:id/forward`          | Forward message                               |
| POST   | `/messages/:id/reactions`        | Add reaction                                  |
| DELETE | `/messages/:id/reactions/:emoji` | Remove reaction                               |
| POST   | `/messages/receipts`             | Batch read receipts                           |

Real-time delivery uses Socket.IO on `/socket.io/` (message events, presence).

## Keys (E2EE)

| Method | Path                                    | Description                  |
| ------ | --------------------------------------- | ---------------------------- |
| POST   | `/keys/publish`                         | Publish device key bundle    |
| GET    | `/keys/users/:userId/devices/:deviceId` | Fetch device bundle          |
| GET    | `/keys/users/:userId`                   | List device bundles for user |

## Media (MinIO)

| Method | Path                  | Description                  |
| ------ | --------------------- | ---------------------------- |
| POST   | `/media/uploads`      | Create presigned upload slot |
| POST   | `/media/:id/confirm`  | Confirm upload completion    |
| GET    | `/media/:id/download` | Presigned download URL       |

Requires `STORAGE_PROVIDER=minio` (default in Docker Compose).

## Presence

| Method | Path                  | Description          |
| ------ | --------------------- | -------------------- |
| POST   | `/presence/heartbeat` | Update online status |
| POST   | `/presence/offline`   | Mark offline         |
| GET    | `/presence/:userId`   | Query user presence  |

## Search

| Method | Path                  | Description                          |
| ------ | --------------------- | ------------------------------------ |
| GET    | `/search?q=`          | Search users/chats                   |
| GET    | `/search/messages?q=` | Search messages (Postgres full-text) |

## Health & System

| Method | Path                  | Description                                 |
| ------ | --------------------- | ------------------------------------------- |
| GET    | `/health/live`        | **Public** — process liveness               |
| GET    | `/health/ready`       | **Public** — DB + Redis readiness           |
| GET    | `/health/diagnostics` | **Public** — extended checks                |
| GET    | `/system`             | **Public** — version, uptime, instance name |

## Admin (`server_admin` role)

| Method | Path                               | Description                   |
| ------ | ---------------------------------- | ----------------------------- |
| GET    | `/admin/users`                     | List users                    |
| PATCH  | `/admin/users/:id`                 | Suspend/activate, change role |
| POST   | `/admin/users/:id/revoke-sessions` | Force logout all sessions     |
| GET    | `/admin/diagnostics`               | Full health diagnostics       |
| GET    | `/admin/config?category=`          | List config by category       |
| PATCH  | `/admin/config/:category/:key`     | Update config value           |
| GET    | `/admin/feature-flags`             | List feature flags            |
| PATCH  | `/admin/feature-flags/:key`        | Toggle flag / rollout         |
| GET    | `/admin/audit`                     | Audit log                     |
| POST   | `/admin/invites`                   | Create invite                 |
| GET    | `/admin/invites`                   | List invites                  |
| DELETE | `/admin/invites/:id`               | Revoke invite                 |
| GET    | `/admin/retention`                 | List retention policies       |
| PATCH  | `/admin/retention`                 | Upsert retention policy       |
| GET    | `/admin/tls`                       | TLS wizard state              |
| POST   | `/admin/tls`                       | Update TLS config             |

## Feature flags (Phase 3 messaging)

| Key                   | Default | Purpose                 |
| --------------------- | ------- | ----------------------- |
| `messaging.enabled`   | true    | Master messaging switch |
| `messaging.groups`    | true    | Group chats             |
| `messaging.channels`  | true    | Public channels         |
| `messaging.reactions` | true    | Message reactions       |
| `messaging.search`    | true    | Message search          |

Toggle via Admin → Feature flags or `PATCH /admin/feature-flags/:key`.

## Database migration

Phase 3 adds messaging tables via migration `0001_messaging.sql`:

```bash
npm run db:migrate
```

Apply after upgrading from Phase 2 foundation.
