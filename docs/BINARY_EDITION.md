# NeoChat — Single-Binary Edition

پیام‌رسان خصوصی شبیه تلگرام که فقط با **یک فایل اجرایی** روی سرور شخصی نصب می‌شود.
بدون Docker، بدون پایگاه‌داده جداگانه، بدون وابستگی به اینترنت بین‌الملل.

A Telegram-style private messenger that installs as **one executable** on your own server.
No Docker, no external database, no dependency on the international internet.

## What is inside the binary

| Part                          | Implementation                                            |
| ----------------------------- | --------------------------------------------------------- |
| HTTP API + WebSocket realtime | Go `net/http` + gorilla/websocket (`server/`)             |
| Database                      | SQLite (pure Go, WAL mode) in the data directory          |
| Media storage                 | Files in `<data>/media`, thumbnails generated on upload   |
| Voice / video calls           | WebRTC peer-to-peer + **built-in TURN relay** (pion/turn) |
| Web + mobile app (PWA)        | React client embedded with `go:embed` (`client/`)         |
| Admin panel                   | Same app, at `/admin`                                     |
| TLS                           | Your certificate, or an auto-generated self-signed one    |

Fonts (Vazirmatn), icons and sounds are all bundled, so nothing is fetched from a CDN.

## Install (Linux)

```bash
sudo install -m 755 neochat-linux-amd64 /usr/local/bin/neochat
sudo neochat -addr :443 -http-redirect :80 -data /var/lib/neochat
```

Then open `https://<server-ip>/`. The first visit shows the **setup wizard**, which creates the admin account.
For a permanent service use [`deploy/binary/neochat.service`](../deploy/binary/neochat.service).

Open these ports in the firewall:

- `443/tcp` (or whatever `-addr` uses): web app, API, WebSocket
- `3478/udp` and `3478/tcp`: call relay (configurable in the admin panel)

On Windows just run `neochat-windows-amd64.exe` (default `https://<ip>:8443`).

## Flags (or environment variables)

| Flag                    | Env                     | Default          | Purpose                                             |
| ----------------------- | ----------------------- | ---------------- | --------------------------------------------------- |
| `-addr`                 | `NEOCHAT_ADDR`          | `:8443`          | Listen address                                      |
| `-data`                 | `NEOCHAT_DATA`          | `./neochat-data` | Database, media, certificates                       |
| `-tls-cert`, `-tls-key` | `NEOCHAT_TLS_CERT/KEY`  | —                | Your own certificate                                |
| `-self-signed`          | `NEOCHAT_SELF_SIGNED`   | `true`           | Generate a certificate if none is given             |
| `-hosts`                | `NEOCHAT_HOSTS`         | —                | Extra hostnames/IPs for the self-signed certificate |
| `-public-ip`            | `NEOCHAT_PUBLIC_IP`     | auto             | IP the TURN relay advertises                        |
| `-http-redirect`        | `NEOCHAT_HTTP_REDIRECT` | —                | Also listen on plain HTTP and redirect (e.g. `:80`) |

Commands:

```bash
neochat reset-password <username> <new-password>
neochat make-admin <username>
neochat version
```

> **HTTPS is required for calls.** Browsers only allow microphone/camera on HTTPS (or `localhost`).
> With the self-signed certificate users accept the browser warning once. For a smoother experience
> use a certificate from your organization's CA, or install `<data>/tls/cert.pem` as trusted on the devices.

## Features

**Users** — accounts with username + password only (no phone, no email). Profile photo, bio, editable
username, "hide last seen", active sessions list with remote sign-out, password change.

**Chats** — 1:1 chats found by `@username`, Saved Messages, groups and channels (public `@link` or private
invite link), admins and roles, replies, edit/delete, read receipts, typing / recording indicators, last seen
and the "recently online" strip, pin / mute / archive, drafts, photos, videos, files and voice messages,
drag & drop and paste uploads.

**Calls** — 1:1 voice and video calls (WebRTC) with ringing, mute, camera toggle, camera flip, speaker
toggle, minimize, call history and call entries in the chat. The built-in TURN relay lets calls connect
behind NAT and on an isolated national network.

**Offline & cache** — the app shell, fonts and media are cached by a service worker; chats and the latest
N messages per chat are stored in IndexedDB, so the app opens and stays readable without a connection.
Media is served with `immutable` caching; thumbnails keep mobile data usage low.

**Admin panel (`/admin`)**

- Dashboard: users, online now, messages, rooms, calls, storage, 14-day charts
- Users: search, filter, ban, make admin, reset password, delete (anonymize)
- Groups & channels: list and remove rooms (message contents are never shown to admins)
- Advertising: banner above the chat list and sponsored posts in channels, schedule, priority,
  impressions / clicks / CTR
- Invite codes for invite-only registration
- Branding: name, tagline, logo / app icon, background image, accent color, default language and theme
- Registration & security: open / invite-only / closed, password length, anti-spam rate, session expiry
- Limits & storage: max photo / video / file size, message length, room size, message and media retention,
  client cache size
- Calls & network: enable voice / video, TURN relay IP and port (applied live), extra STUN/TURN servers
- System & backup: server info, TURN status, one-click database backup

## NeoAurora ad network

Besides the admin's own ads, every server shows ads from the NeoAurora license worker
(`https://license.hossein-m466.workers.dev`, product slug `neochat`):

| Worker placement | Shown in the app                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `home`           | banner above the chat list                                                                |
| `footer`         | sponsored post inside channels                                                            |
| `sidebar`        | card at the bottom of the desktop sidebar                                                 |
| `chat`           | slim closable bar above conversations — at most every 30 min, closing it hides it for 3 h |
| `admin`          | card on the admin dashboard                                                               |

- The server fetches them every 30 minutes and stores the last successful copy in its database.
  If the worker is unreachable (worker down, international internet cut), the saved copy keeps showing,
  even after a restart. Browsers also keep their last copy locally.
- Clicks go through `/go/net/<id>`, are queued in the database, and are reported to `/v1/ads/click`
  when the worker is reachable again.
- Network ads are independent of the admin's "show ads" switch, which only controls local ads.
- Status and a manual "Sync now" are in `/admin → Advertising`. Override the endpoint with `-ad-feed`.
- Create the ads in the license manager for product `neochat` with the placements above.

## Copyright

NeoChat is © 2026 NeoAurora. The notice appears on the sign-in screen, in settings, the sidebar,
the admin panel, the `X-Powered-By` header and `neochat version`, and cannot be changed from branding.

## SSL / HTTPS from the admin panel

`/admin → SSL / HTTPS` switches between a self-signed certificate (offline), an uploaded PEM
certificate + key, or automatic Let's Encrypt for a domain (validated over port 443 or 80).
Changes apply immediately — certificates are hot-swapped without a restart.

## Backup & restore

`/admin → System & backup → Download database backup` gives a consistent SQLite snapshot.
Media files are in `<data>/media`; copy that folder too. To restore, stop the service, put the backup in
place as `<data>/neochat.db`, copy back `media/`, and start it again.

## Building from source

Requires Node 20+ and Go 1.24+ on the build machine only.

```bash
sh scripts/build-binary.sh          # Linux/macOS
pwsh scripts/build-binary.ps1       # Windows
```

Binaries for linux/amd64, linux/arm64, windows/amd64 and darwin/amd64/arm64 land in `release/`.

Development: run the server (`cd server && go run . -self-signed=true`) and the client dev server
(`cd client && npm run dev`, proxies `/api` to `https://127.0.0.1:8443`).

## Security notes

- Passwords are hashed with bcrypt; session tokens are random 256-bit values stored hashed.
- Login and registration are rate-limited; the WebSocket authenticates in its first frame (no tokens in URLs).
- Strict CSP, `nosniff`, frame denial and HSTS (on HTTPS). Uploaded files are served sandboxed;
  non-media files are always downloads.
- Media URLs are unguessable 128-bit IDs.
- Messages are encrypted in transit (TLS) and stored on your server; this edition does not implement
  end-to-end encryption.
