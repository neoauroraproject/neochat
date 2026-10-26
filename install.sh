#!/usr/bin/env bash
# One-line installer for the NeoChat single binary (Linux, amd64/arm64):
#   curl -fsSL https://raw.githubusercontent.com/neoauroraproject/neochat/main/install.sh | sudo bash
# Running it again upgrades the binary and keeps all data in /var/lib/neochat.
# Optional: NEOCHAT_VERSION=v1.3.0 picks a release instead of the latest one.
set -euo pipefail

REPO="neoauroraproject/neochat"
BIN=/usr/local/bin/neochat
DATA=/var/lib/neochat
UNIT=/etc/systemd/system/neochat.service

say() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mخطا:\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "با sudo اجرا کنید:  curl -fsSL https://raw.githubusercontent.com/$REPO/main/install.sh | sudo bash"
[ "$(uname -s)" = "Linux" ] || die "این نصب‌کننده فقط برای لینوکس است؛ برای ویندوز و macOS فایل را از Releases بگیرید."

case "$(uname -m)" in
  x86_64 | amd64) ARCH=amd64 ;;
  aarch64 | arm64) ARCH=arm64 ;;
  *) die "معماری $(uname -m) پشتیبانی نمی‌شود (فقط amd64 و arm64)." ;;
esac

if [ -n "${NEOCHAT_VERSION:-}" ]; then
  URL="https://github.com/$REPO/releases/download/$NEOCHAT_VERSION"
else
  URL="https://github.com/$REPO/releases/latest/download"
fi

fetch() {
  if command -v curl >/dev/null 2>&1; then
    curl -fL --retry 3 --progress-bar -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -q --show-progress -O "$2" "$1"
  else
    die "curl یا wget لازم است."
  fi
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

say "دریافت neochat-linux-$ARCH"
fetch "$URL/neochat-linux-$ARCH" "$TMP/neochat"
if fetch "$URL/SHA256SUMS.txt" "$TMP/SHA256SUMS.txt" 2>/dev/null && command -v sha256sum >/dev/null 2>&1; then
  want="$(tr -d '\r' <"$TMP/SHA256SUMS.txt" | grep " \*\?neochat-linux-$ARCH\$" | cut -d' ' -f1)"
  got="$(sha256sum "$TMP/neochat" | cut -d' ' -f1)"
  [ -z "$want" ] || [ "$want" = "$got" ] || die "checksum فایل دانلودشده درست نیست."
  say "checksum تأیید شد"
fi
chmod 755 "$TMP/neochat"
"$TMP/neochat" version >/dev/null 2>&1 || die "فایل دانلودشده اجرا نمی‌شود."

# Replace by rename so a running binary is never overwritten in place.
install -m 755 "$TMP/neochat" "$BIN.new"
mv -f "$BIN.new" "$BIN"
say "نصب شد: $("$BIN" version)"

if ! command -v systemctl >/dev/null 2>&1 || [ ! -d /run/systemd/system ]; then
  mkdir -p "$DATA"
  say "systemd پیدا نشد؛ دستی اجرا کنید:  sudo neochat -addr :443 -http-redirect :80 -data $DATA"
  exit 0
fi

id neochat >/dev/null 2>&1 || useradd --system --home "$DATA" --shell /usr/sbin/nologin neochat
mkdir -p "$DATA"
chown -R neochat:neochat "$DATA"

cat >"$UNIT" <<EOF
# Written by install.sh — same as deploy/binary/neochat.service.
[Unit]
Description=NeoChat self-hosted messenger
After=network-online.target
Wants=network-online.target

[Service]
User=neochat
Group=neochat
ExecStart=$BIN -addr :443 -http-redirect :80 -data $DATA
AmbientCapabilities=CAP_NET_BIND_SERVICE
Restart=always
RestartSec=3
LimitNOFILE=65536
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DATA
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable neochat >/dev/null 2>&1
systemctl restart neochat

# Open the ports only when ufw is already guarding this server.
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw allow 3478 >/dev/null
  say "پورت‌های 80، 443 و 3478 در ufw باز شدند"
fi

sleep 2
systemctl is-active --quiet neochat || die "سرویس بالا نیامد؛ لاگ:  journalctl -u neochat -n 50"

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
say "NeoChat آماده است:  https://${IP:-IP-سرور}/"
say "اولین بازدید حساب مدیر را می‌سازد؛ پنل مدیریت در /admin است."
