# NeoChat User Guide (Phase 3)

NeoChat is a self-hosted, end-to-end encrypted messaging platform. Phase 3 adds real messaging:
chats, encrypted messages, media uploads, presence, and search.

## Getting started

1. Open your instance URL (e.g. `http://localhost:8085` or your production domain).
2. If this is a fresh install, complete the **setup wizard** to create the first admin account and name your instance.
3. **Register** with an invite code (if open registration is disabled) or sign in with your credentials.

## Messaging

### Chats

- **Direct messages (DM)** — start a 1:1 conversation from user search.
- **Groups** — create a group and invite members; admins can manage roles.
- **Channels** — public channels users can join; read-only mode supported for broadcast use.

Your chat list shows recent conversations with unread indicators.

### Sending messages

Messages are encrypted on your device before upload. The server stores ciphertext only — admins cannot read message content.

Supported actions:

- Send text and media attachments
- Reply to messages
- Edit and delete your own messages
- Forward messages to other chats
- React with emoji
- Pin important messages (group/channel admins)

### Drafts

Unsent text is saved as an encrypted draft per chat and synced across your devices.

### Read receipts

When enabled, recipients can see when messages were delivered and read (E2EE metadata only).

## Media & attachments

1. Request an upload slot from the API.
2. Upload the file directly to MinIO via the presigned URL.
3. Confirm the upload; the message references the media object.

Avatar uploads work the same way via **Settings → Profile**.

## Devices & security

- Each login creates a **device** with its own encryption keys.
- View active devices under **Settings → Devices** and revoke any you don't recognize.
- Change your password under account settings; consider revoking other sessions afterward.

## Presence

NeoChat shows online/offline status based on heartbeat signals. You appear offline when the app is closed or after a timeout.

## Search

- **User search** — find people to start DMs.
- **Message search** — full-text search over message metadata (server-side; content remains encrypted).

## Languages & themes

NeoChat supports **English, Persian, Arabic, Turkish, and Russian** with RTL layout for FA and AR.

Switch language and light/dark theme from **Settings**.

## Admin vs user

| User                  | Admin panel                   |
| --------------------- | ----------------------------- |
| Send/receive messages | Manage users, invites, flags  |
| Manage own devices    | View diagnostics & audit log  |
| Profile & privacy     | Configure retention & storage |

Admin URL: `/admin/` (requires admin role). Admins never see message plaintext.

## Troubleshooting

| Issue                | What to try                                            |
| -------------------- | ------------------------------------------------------ |
| Can't register       | Ask an admin for an invite code                        |
| Messages not syncing | Check network; refresh; verify WebSocket isn't blocked |
| Media upload fails   | Confirm MinIO is running (`STORAGE_PROVIDER=minio`)    |
| Search empty         | Ensure `messaging.search` flag is enabled              |

For server operators, see [`INSTALLATION.md`](INSTALLATION.md) and [`OPS.md`](OPS.md).
