# Changelog

All notable changes to NeoChat are documented in this file.

## [1.6.2] - 2026-11-04

### Added

- A crop screen for profile, group and channel photos: move with a finger, pinch or use the slider to zoom, turn by 90°; the result is an upright square photo that looks the same in every place

### Fixed

- Video and voice calls could end the moment they started: a call left over on the server (its hang-up lost with a dropped connection, or taken over by the same person's other device) made every new call fail without a word. Starting a call now ends any earlier one, only the device that was in a call can rejoin it, and every refused call says why
- Calls no longer fail when the camera rejects the requested size or a voice-message microphone is still open: they retry with plain settings, then with sound only
- Phone photos turned 90° counter-clockwise in avatars and previews (the EXIF orientation was ignored on the server); existing previews are repaired once on startup, and photo sizes are reported upright

## [1.6.1] - 2026-11-04

### Changed

- Phone: the chat list title is the app's name; while the connection is down it reads "Connecting" (or "Waiting for network") with three small dots, in the list and in the chat header
- Phone: the unread count sits on the name's line, hairline dividers separate chats, the chat header has clear voice and video call buttons, and the tab bar is smaller at the same distance from the bottom
- Phone settings: a short list where each row opens its own page (notifications and sounds, privacy and security, devices, appearance, data and storage), with back by button or swipe
- The logo from Branding is used everywhere: browser tab, home-screen icon (real PNG sizes for iPhone and Android, including a maskable one), install guide and notifications

### Fixed

- Voice messages: hold to record, let go to send, slide to cancel, slide up (or tap) to keep recording hands-free; the microphone is not requested again for every message; recordings are AAC (M4A) where the browser can make it, so iPhones play them; length and seeking work for recordings from Chrome and Firefox
- The offline media cache limit evaluated to 0, so cached photos and videos were thrown away at once
- Unread counts doubled after reconnecting
- The build scripts stamp binaries with the version in the code instead of 1.0.0

## [1.6.0] - 2026-11-04

The whole NeoChat roadmap (five releases) plus a native-style phone design.

### Added

- Navigation: one history stack for every layer (chat, info, photo, sheets, call); back closes exactly one layer, no blank page from the iOS forward swipe, Android "press back again to exit", drag down to close photos and sheets
- Downloads: in-app download manager with progress and cancel; iOS share sheet (Save to Photos / Files); `?dl=1` attachments with correct Persian file names
- Calls: survive a 30 s network drop (server grace period, ICE restart from both sides), link-quality badge, screen kept awake, real audio-output picker; floating in-app call window, chat during a call, system and desktop picture-in-picture, switch voice to video mid-call, the other side's mic/camera state, swap pictures
- Storage: photos compressed on the phone (EXIF removed), disk guard, size-based file expiry fixed at upload, per-user quotas (block or remove oldest), "My storage" in Settings, admin storage dashboard with preview of rule changes
- Offline: persistent outbox with clock icon, saved drafts, recent chats prefetched, one-request sync after reconnecting (`GET /api/sync` with a change-event log), offline video seeking from the cache, size-based media cache, local message database with offline search, "Storage & data" page, update prompt instead of silent reloads
- Privacy and messaging: password-locked messages (AES-GCM on the device), self-destructing messages per chat, view-once photos and videos, app lock with code or Face ID / fingerprint, reactions, forwarding (no second copy of files), pinned messages, profile QR codes with themes
- Phone design: large titles with round actions, pill segments, contacts card grid, floating tab bar, photo profile, profile-style settings, chat appearance (bubble themes, color, pattern, text size, motion); soft off-black and off-white with shadows. Desktop unchanged.

## [1.0.0-rc.1] - 2026-07-21

### Added

- TLS wizard API with PEM validation, cert expiry checks, Caddyfile hints, and reverse-proxy documentation
- Backup & restore admin API (`/admin/backup/*`) with scheduled backup config
- Expanded health diagnostics: LiveKit/calls, MinIO/storage, jobs, cert expiry
- Prometheus-style `/api/v1/metrics` endpoint
- Security hardening: Helmet CSP, global rate limiting, Redis login lockout, trusted devices
- Plugin SDK `createPlugin` helper and admin plugin enable/disable API
- Maintenance mode with 503 for non-admin users
- Admin pages: Backup, Performance, Maintenance; enhanced TLS and Plugins
- Release documentation, GitHub templates, offline bundle checksums/SBOM note
- LiveKit enabled by default in Docker Compose for v1

### Changed

- Version bump from 0.3.0-alpha to 1.0.0-rc.1 across all workspaces
- `CALL_PROVIDER` defaults to `livekit` in compose and bootstrap env

## [0.3.0-alpha]

- Phase 3 messaging, E2E crypto, admin panel foundations
