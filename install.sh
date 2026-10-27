#!/usr/bin/env bash
# NeoChat installer and manager for Linux servers (amd64 / arm64).
#
#   curl -fsSL https://raw.githubusercontent.com/neoauroraproject/neochat/main/install.sh | sudo bash
#
# The first run installs NeoChat (asks for ports and creates the admin account) and
# leaves the `neochatctl` command behind. Run `neochatctl` for the menu, or pass a
# command: install | update | config | uninstall | start | stop | restart | status |
# logs | reset-password. Through the one-liner: ... | sudo bash -s -- update
set -euo pipefail

REPO="neoauroraproject/neochat"
RAW="https://raw.githubusercontent.com/$REPO/main/install.sh"
BIN=/usr/local/bin/neochat
CTL=/usr/local/bin/neochatctl
CONF_DIR=/etc/neochat
ENV_FILE=$CONF_DIR/neochat.env
UNIT=/etc/systemd/system/neochat.service
SERVICE=neochat
DEFAULT_DATA=/var/lib/neochat

# Options (flags override the questions).
OPT_PORT="" OPT_HTTP="" OPT_TURN="" OPT_DOMAIN="" OPT_DATA=""
OPT_ADMIN="" OPT_PASSWORD="" OPT_APPNAME="" OPT_VERSION="${NEOCHAT_VERSION:-}"
ASSUME_YES=0 PURGE=0 FORCE=0

if [ -t 1 ]; then
  C_B=$'\033[1m' C_BLUE=$'\033[1;34m' C_GREEN=$'\033[1;32m' C_YEL=$'\033[1;33m' C_RED=$'\033[1;31m' C_DIM=$'\033[2m' C_0=$'\033[0m'
else
  C_B="" C_BLUE="" C_GREEN="" C_YEL="" C_RED="" C_DIM="" C_0=""
fi
say() { printf '%s==>%s %s\n' "$C_BLUE" "$C_0" "$*"; }
ok() { printf '%s ok%s %s\n' "$C_GREEN" "$C_0" "$*"; }
warn() { printf '%swarn:%s %s\n' "$C_YEL" "$C_0" "$*" >&2; }
die() {
  printf '%serror:%s %s\n' "$C_RED" "$C_0" "$*" >&2
  exit 1
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ---------------------------------------------------------------- prompts

can_prompt() { [ "$ASSUME_YES" != 1 ] && (: </dev/tty) 2>/dev/null; }

# ask "Question" "default" -> answer on stdout (the question goes to the terminal).
ask() {
  local ans=""
  if can_prompt; then
    printf '%s%s%s [%s]: ' "$C_B" "$1" "$C_0" "$2" >/dev/tty
    IFS= read -r ans </dev/tty || ans=""
  fi
  printf '%s' "${ans:-$2}"
}

ask_secret() {
  local ans=""
  if can_prompt; then
    printf '%s%s%s: ' "$C_B" "$1" "$C_0" >/dev/tty
    IFS= read -rs ans </dev/tty || ans=""
    printf '\n' >/dev/tty
  fi
  printf '%s' "$ans"
}

# confirm "Question" y|n -> exit status
confirm() {
  local def=${2:-n} hint="y/N" ans
  [ "$def" = y ] && hint="Y/n"
  if ! can_prompt; then
    [ "$def" = y ]
    return
  fi
  printf '%s%s%s [%s]: ' "$C_B" "$1" "$C_0" "$hint" >/dev/tty
  IFS= read -r ans </dev/tty || ans=""
  case "${ans:-$def}" in [yY]*) return 0 ;; *) return 1 ;; esac
}

# ---------------------------------------------------------------- helpers

need_root() { [ "$(id -u)" -eq 0 ] || die "run as root, e.g.: curl -fsSL $RAW | sudo bash"; }
has() { command -v "$1" >/dev/null 2>&1; }
has_systemd() { has systemctl && [ -d /run/systemd/system ]; }
installed() { [ -x "$BIN" ] && [ -f "$ENV_FILE" ]; }

fetch() {
  if has curl; then
    curl -fL --retry 3 --progress-bar -o "$2" "$1"
  elif has wget; then
    wget -q --show-progress -O "$2" "$1"
  else
    die "curl or wget is required"
  fi
}

http_get() { # url -> body on stdout (self-signed certificates are fine on localhost)
  if has curl; then
    curl -fsk --max-time 3 "$1"
  else
    wget -qO- --no-check-certificate --timeout=3 "$1"
  fi
}

json_str() {
  local s=$1
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  printf '"%s"' "$s"
}

valid_port() { [[ $1 =~ ^[0-9]+$ ]] && [ "$1" -ge 1 ] && [ "$1" -le 65535 ]; }

# port_owner PORT tcp|udp -> prints the process listening there; fails when the port is free.
port_owner() {
  local flag=t out name
  [ "${2:-tcp}" = udp ] && flag=u
  has ss || return 1
  out=$(ss -H -l${flag}np "sport = :$1" 2>/dev/null | head -n1) || true
  [ -n "$out" ] || return 1
  name=$(printf '%s' "$out" | sed -n 's/.*users:(("\([^"]*\)".*/\1/p')
  printf '%s' "${name:-another process}"
}

first_free() {
  local p
  for p in "$@"; do
    port_owner "$p" tcp >/dev/null || {
      printf '%s' "$p"
      return
    }
  done
}

# pick_port "label" default proto [allow_off] -> a free port (or "off").
pick_port() {
  local label=$1 def=$2 proto=$3 allow_off=${4:-0} p owner
  while :; do
    p=$(ask "$label" "$def")
    if [ "$allow_off" = 1 ] && [ "$p" = off ]; then
      printf 'off'
      return
    fi
    if ! valid_port "$p"; then
      warn "\"$p\" is not a port number (1-65535)"
    elif owner=$(port_owner "$p" "$proto"); then
      warn "port $p/$proto is already used by $owner"
    else
      printf '%s' "$p"
      return
    fi
    can_prompt || die "pick another $label with a flag (see: neochatctl help)"
  done
}

public_ip() { hostname -I 2>/dev/null | awk '{print $1}'; }

load_config() {
  NEOCHAT_ADDR=":8443" NEOCHAT_DATA=$DEFAULT_DATA NEOCHAT_HTTP_REDIRECT="" NEOCHAT_HOSTS=""
  # shellcheck disable=SC1090
  [ -f "$ENV_FILE" ] && . "$ENV_FILE"
  HTTPS_PORT=${NEOCHAT_ADDR##*:}
  HTTP_PORT=${NEOCHAT_HTTP_REDIRECT##*:}
  [ -n "$HTTP_PORT" ] || HTTP_PORT=off
  DATA=$NEOCHAT_DATA
  DOMAIN=$NEOCHAT_HOSTS
}

app_url() {
  local host=${DOMAIN:-$(public_ip)}
  host=${host:-SERVER-IP}
  if [ "$HTTPS_PORT" = 443 ]; then printf 'https://%s/' "$host"; else printf 'https://%s:%s/' "$host" "$HTTPS_PORT"; fi
}

installed_version() { "$BIN" version 2>/dev/null | head -n1 | awk '{print $2}'; }

latest_tag() {
  has curl || return 0
  curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest" 2>/dev/null | sed -n 's#.*/tag/##p' || true
}

arch() {
  case "$(uname -m)" in
    x86_64 | amd64) echo amd64 ;;
    aarch64 | arm64) echo arm64 ;;
    *) die "unsupported CPU architecture $(uname -m) (amd64 and arm64 only)" ;;
  esac
}

# download_binary -> verified binary at $TMP/neochat
download_binary() {
  local a url want got
  a=$(arch)
  if [ -n "$OPT_VERSION" ]; then
    url="https://github.com/$REPO/releases/download/$OPT_VERSION"
  else
    url="https://github.com/$REPO/releases/latest/download"
  fi
  say "Downloading neochat-linux-$a ${OPT_VERSION:-(latest)}"
  fetch "$url/neochat-linux-$a" "$TMP/neochat"
  if fetch "$url/SHA256SUMS.txt" "$TMP/SHA256SUMS.txt" 2>/dev/null && has sha256sum; then
    want=$(tr -d '\r' <"$TMP/SHA256SUMS.txt" | grep " \*\?neochat-linux-$a\$" | cut -d' ' -f1 || true)
    got=$(sha256sum "$TMP/neochat" | cut -d' ' -f1)
    [ -z "$want" ] || [ "$want" = "$got" ] || die "checksum mismatch for the downloaded binary"
    [ -z "$want" ] || ok "checksum verified"
  fi
  chmod 755 "$TMP/neochat"
  "$TMP/neochat" version >/dev/null 2>&1 || die "the downloaded binary does not run on this system"
}

place_binary() {
  # Rename into place so a running binary is never overwritten.
  install -m 755 "$TMP/neochat" "$BIN.new"
  mv -f "$BIN.new" "$BIN"
}

# Keep a copy of this script as `neochatctl` for later updates and changes.
install_ctl() {
  local self=${BASH_SOURCE[0]:-}
  if [ -n "$self" ] && [ -f "$self" ] && [ "$(readlink -f "$self")" != "$CTL" ]; then
    install -m 755 "$self" "$CTL"
  elif [ "$(readlink -f "$self" 2>/dev/null)" != "$CTL" ]; then
    fetch "$RAW" "$TMP/neochatctl" 2>/dev/null && install -m 755 "$TMP/neochatctl" "$CTL" ||
      warn "could not save neochatctl; run the one-line installer again to manage NeoChat"
  fi
}

write_env() {
  mkdir -p "$CONF_DIR"
  local redirect=""
  [ "$HTTP_PORT" = off ] || redirect=":$HTTP_PORT"
  cat >"$ENV_FILE" <<EOF
# NeoChat settings, read by the neochat service. Change them with: neochatctl config
NEOCHAT_ADDR=:$HTTPS_PORT
NEOCHAT_HTTP_REDIRECT=$redirect
NEOCHAT_DATA=$DATA
NEOCHAT_HOSTS=$DOMAIN
EOF
  chmod 644 "$ENV_FILE"
}

write_unit() {
  cat >"$UNIT" <<EOF
# Written by neochatctl. Settings live in $ENV_FILE.
[Unit]
Description=NeoChat self-hosted messenger
After=network-online.target
Wants=network-online.target

[Service]
User=neochat
Group=neochat
EnvironmentFile=$ENV_FILE
ExecStart=$BIN
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
}

open_firewall() { # port/proto ...
  local r
  if has ufw && ufw status 2>/dev/null | grep -q "Status: active"; then
    for r in "$@"; do ufw allow "$r" >/dev/null; done
    ok "firewall (ufw): opened $*"
  elif has firewall-cmd && firewall-cmd --state >/dev/null 2>&1; then
    for r in "$@"; do firewall-cmd -q --permanent --add-port="$r"; done
    firewall-cmd -q --reload
    ok "firewall (firewalld): opened $*"
  fi
}

firewall_rules() {
  local rules=("$HTTPS_PORT/tcp" "${TURN_PORT:-3478}/tcp" "${TURN_PORT:-3478}/udp")
  [ "$HTTP_PORT" = off ] || rules+=("$HTTP_PORT/tcp")
  printf '%s\n' "${rules[@]}"
}

service_stop() { has_systemd && systemctl stop "$SERVICE" 2>/dev/null || true; }

# Start the service and wait until the web app answers.
service_start() {
  systemctl enable "$SERVICE" >/dev/null 2>&1
  systemctl restart "$SERVICE"
  local i
  for i in $(seq 1 30); do
    if http_get "https://127.0.0.1:$HTTPS_PORT/api/config" >"$TMP/config.json" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  printf '\n%sLast log lines:%s\n' "$C_B" "$C_0" >&2
  journalctl -u "$SERVICE" -n 15 --no-pager >&2 || true
  die "NeoChat did not start on port $HTTPS_PORT (see the log above, or: neochatctl logs)"
}

# ---------------------------------------------------------------- setup

ask_ports() {
  local def_https def_http
  def_https=${OPT_PORT:-$(first_free 443 8443 2053 2083 2087 2096 9443)}
  def_https=${def_https:-8443}
  printf '\n%sPorts%s %s(enter a number, or press Enter for the suggestion)%s\n' "$C_B" "$C_0" "$C_DIM" "$C_0"
  HTTPS_PORT=$(pick_port "HTTPS port for the web app" "$def_https" tcp)

  if [ -n "$OPT_HTTP" ]; then
    def_http=$OPT_HTTP
  elif ! port_owner 80 tcp >/dev/null && [ "$HTTPS_PORT" != 80 ]; then
    def_http=80
  else
    def_http=off
  fi
  HTTP_PORT=$(pick_port "HTTP port that redirects to HTTPS (needed for Let's Encrypt, or 'off')" "$def_http" tcp 1)
  [ "$HTTP_PORT" != "$HTTPS_PORT" ] || die "the HTTP and HTTPS ports must differ"

  local def_turn=${OPT_TURN:-3478}
  if [ -z "$OPT_TURN" ] && port_owner 3478 udp >/dev/null; then def_turn=3479; fi
  TURN_PORT=$(pick_port "Call relay (TURN) port, tcp+udp" "$def_turn" udp)
}

ask_domain() {
  DOMAIN=$(ask "Domain name (optional, e.g. chat.example.com)" "${OPT_DOMAIN:-$DOMAIN}")
  DOMAIN=${DOMAIN// /}
}

# Create the admin account through the server's own setup API.
first_setup() {
  if ! grep -q '"setupRequired":true' "$TMP/config.json" 2>/dev/null; then
    [ "${TURN_PORT:-3478}" = 3478 ] || warn "this server was already set up; change the call relay port in Admin > Calls"
    return
  fi
  if ! has curl; then
    warn "curl is missing, so finish the setup in the browser: $(app_url)"
    return
  fi
  printf '\n%sAdmin account%s\n' "$C_B" "$C_0"
  local app user pass pass2 gen=0 body resp token
  app=$(ask "App name" "${OPT_APPNAME:-NeoChat}")
  while :; do
    user=$(ask "Admin username (letters, digits, _; 4-32 chars)" "${OPT_ADMIN:-admin}")
    [[ $user =~ ^[a-zA-Z][a-zA-Z0-9_]{3,31}$ ]] && break
    warn "the username must start with a letter and be 4-32 letters, digits or _"
    can_prompt || die "invalid --admin username"
  done
  pass=$OPT_PASSWORD
  while [ -z "$pass" ]; do
    pass=$(ask_secret "Admin password (min 8 chars, empty = generate one)")
    if [ -z "$pass" ]; then
      pass=$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | cut -c1-16)
      gen=1
      break
    fi
    if [ "${#pass}" -lt 8 ]; then
      warn "the password needs at least 8 characters"
      pass=""
      continue
    fi
    pass2=$(ask_secret "Repeat the password")
    [ "$pass" = "$pass2" ] || {
      warn "the passwords do not match"
      pass=""
    }
  done
  [ "${#pass}" -ge 8 ] || die "the admin password needs at least 8 characters"

  body="{\"username\":$(json_str "$user"),\"displayName\":$(json_str "$user"),\"password\":$(json_str "$pass"),\"appName\":$(json_str "$app")}"
  if ! resp=$(curl -sk --max-time 10 -H 'Content-Type: application/json' -d "$body" "https://127.0.0.1:$HTTPS_PORT/api/setup"); then
    warn "could not reach the setup API; finish the setup in the browser: $(app_url)"
    return
  fi
  token=$(printf '%s' "$resp" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
  if [ -z "$token" ]; then
    warn "setup failed: $(printf '%s' "$resp" | sed -n 's/.*"message":"\([^"]*\)".*/\1/p')"
    warn "finish the setup in the browser: $(app_url)"
    return
  fi
  ok "admin account \"$user\" created"
  ADMIN_USER=$user
  [ "$gen" = 1 ] && ADMIN_PASS=$pass

  if [ "${TURN_PORT:-3478}" != 3478 ]; then
    curl -fsk --max-time 10 -X PUT -H 'Content-Type: application/json' -H "Authorization: Bearer $token" \
      -d "{\"turnPort\":$TURN_PORT}" "https://127.0.0.1:$HTTPS_PORT/api/admin/settings" >/dev/null &&
      ok "call relay set to port $TURN_PORT" ||
      warn "could not set the call relay port; change it in Admin > Calls"
  fi
  # Sign the installer's session out again.
  curl -sk --max-time 5 -X POST -H "Authorization: Bearer $token" "https://127.0.0.1:$HTTPS_PORT/api/auth/logout" >/dev/null || true
}

summary() {
  printf '\n%s NeoChat is running%s\n' "$C_GREEN" "$C_0"
  printf '  Web app      %s\n' "$(app_url)"
  printf '  Admin panel  %sadmin\n' "$(app_url)"
  [ -n "${ADMIN_USER:-}" ] && printf '  Admin user   %s\n' "$ADMIN_USER"
  [ -n "${ADMIN_PASS:-}" ] && printf '  Password     %s%s%s  %s(generated, save it now)%s\n' "$C_B" "$ADMIN_PASS" "$C_0" "$C_DIM" "$C_0"
  printf '  Data         %s\n' "$DATA"
  printf '  Ports        https %s, http redirect %s, call relay %s tcp+udp\n' "$HTTPS_PORT" "$HTTP_PORT" "${TURN_PORT:-3478}"
  printf '\n  The certificate is self-signed; get a real one in Admin > SSL.\n'
  printf '  Manage it later with: %sneochatctl%s\n\n' "$C_B" "$C_0"
}

# ---------------------------------------------------------------- commands

cmd_install() {
  need_root
  [ "$(uname -s)" = Linux ] || die "this installer is for Linux; download the Windows/macOS build from GitHub Releases"
  if installed && [ "$FORCE" != 1 ]; then
    warn "NeoChat is already installed ($(installed_version))."
    printf '  Update: neochatctl update   Change ports: neochatctl config   Reinstall: neochatctl install --force\n'
    return
  fi
  has_systemd || die "systemd is required (run the binary by hand otherwise: neochat -addr :8443 -data $DEFAULT_DATA)"

  printf '%sNeoChat installer%s\n' "$C_B" "$C_0"
  download_binary
  load_config
  DATA=${OPT_DATA:-$DATA}
  # A previous install may still hold its ports; free them before checking.
  service_stop
  ask_ports
  ask_domain

  place_binary
  ok "installed $("$BIN" version | head -n1)"
  id neochat >/dev/null 2>&1 || useradd --system --home-dir "$DATA" --shell /usr/sbin/nologin neochat
  mkdir -p "$DATA"
  chown -R neochat:neochat "$DATA"
  write_env
  write_unit
  install_ctl
  mapfile -t rules < <(firewall_rules)
  open_firewall "${rules[@]}"
  say "Starting NeoChat"
  service_start
  first_setup
  summary
}

cmd_update() {
  need_root
  installed || die "NeoChat is not installed; run: curl -fsSL $RAW | sudo bash"
  load_config
  local cur latest
  cur=$(installed_version)
  latest=${OPT_VERSION:-$(latest_tag)}
  if [ -n "$latest" ] && [ "v$cur" = "$latest" ] && [ "$FORCE" != 1 ]; then
    ok "NeoChat $cur is already the latest version"
  else
    download_binary
    place_binary
    write_unit
    say "Restarting NeoChat"
    service_start
    ok "updated $cur -> $(installed_version)"
  fi
  # Refresh this manager too.
  if fetch "$RAW" "$TMP/neochatctl" 2>/dev/null; then install -m 755 "$TMP/neochatctl" "$CTL"; fi
}

cmd_config() {
  need_root
  installed || die "NeoChat is not installed"
  load_config
  printf 'Current: https %s, http redirect %s, domain %s\n' "$HTTPS_PORT" "$HTTP_PORT" "${DOMAIN:-none}"
  service_stop
  OPT_PORT=${OPT_PORT:-$HTTPS_PORT} OPT_HTTP=${OPT_HTTP:-$HTTP_PORT}
  printf '\n%sPorts%s\n' "$C_B" "$C_0"
  HTTPS_PORT=$(pick_port "HTTPS port for the web app" "$OPT_PORT" tcp)
  HTTP_PORT=$(pick_port "HTTP port that redirects to HTTPS (or 'off')" "$OPT_HTTP" tcp 1)
  [ "$HTTP_PORT" != "$HTTPS_PORT" ] || die "the HTTP and HTTPS ports must differ"
  ask_domain
  write_env
  write_unit
  TURN_PORT=""
  mapfile -t rules < <(firewall_rules)
  open_firewall "${rules[@]}"
  service_start
  ok "saved; the call relay port is changed in Admin > Calls"
  printf '  Web app  %s\n' "$(app_url)"
}

cmd_uninstall() {
  need_root
  load_config
  confirm "Remove NeoChat from this server?" n || {
    say "Nothing removed"
    return
  }
  if has_systemd; then
    systemctl disable --now "$SERVICE" >/dev/null 2>&1 || true
    rm -f "$UNIT"
    systemctl daemon-reload
  fi
  rm -f "$BIN" "$BIN.new" "$ENV_FILE"
  rmdir "$CONF_DIR" 2>/dev/null || true
  ok "removed the service and the binary"
  if [ "$PURGE" = 1 ] || confirm "Also delete ALL chats, media and accounts in $DATA? This cannot be undone" n; then
    rm -rf "$DATA"
    userdel neochat 2>/dev/null || true
    ok "deleted $DATA"
  else
    say "Kept your data in $DATA (installing again picks it up)"
  fi
  rm -f "$CTL"
}

cmd_status() {
  installed || {
    say "NeoChat is not installed"
    return
  }
  load_config
  local state
  state=$(systemctl is-active "$SERVICE" 2>/dev/null || true)
  printf 'NeoChat %s  -  %s\n' "$(installed_version)" "${state:-unknown}"
  printf '  Web app      %s\n' "$(app_url)"
  printf '  Admin panel  %sadmin\n' "$(app_url)"
  printf '  Ports        https %s, http redirect %s\n' "$HTTPS_PORT" "$HTTP_PORT"
  printf '  Data         %s\n' "$DATA"
  printf '  Settings     %s\n' "$ENV_FILE"
}

cmd_reset_password() {
  need_root
  installed || die "NeoChat is not installed"
  load_config
  local user=${1:-} pass=${2:-}
  [ -n "$user" ] || user=$(ask "Username" "")
  [ -n "$user" ] || die "a username is required"
  [ -n "$pass" ] || pass=$(ask_secret "New password (min 8 chars, empty = generate one)")
  if [ -z "$pass" ]; then
    pass=$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | cut -c1-16)
    printf 'New password: %s%s%s\n' "$C_B" "$pass" "$C_0"
  fi
  runuser -u neochat -- "$BIN" reset-password -data "$DATA" "$user" "$pass"
}

usage() {
  cat <<EOF
NeoChat manager

Usage: neochatctl [command] [options]

Commands:
  (none)            interactive menu
  install           install NeoChat (asks for ports and the admin account)
  update            update to the latest release (--version vX.Y.Z to pick one)
  config            change ports and domain
  uninstall         remove NeoChat (--purge also deletes all data)
  start|stop|restart|status|logs
  reset-password    set a user's password: reset-password <user> [password]

Install options:
  --port N          HTTPS port (default: 443, or the first free of 8443, 2053, ...)
  --http-port N     HTTP redirect port, or 'off' (default: 80 when free)
  --turn-port N     call relay port, tcp+udp (default: 3478)
  --domain NAME     domain name for the certificate and links
  --data DIR        data directory (default: $DEFAULT_DATA)
  --admin USER      admin username       --password PASS   admin password
  --app-name NAME   app name             -y, --yes         use defaults, no questions
  --force           reinstall / redownload even when up to date

Through the one-liner: curl -fsSL $RAW | sudo bash -s -- install --port 8443 -y
EOF
}

menu() {
  need_root
  can_prompt || {
    usage
    return
  }
  while :; do
    printf '\n%s NeoChat manager%s  ' "$C_B" "$C_0"
    if installed; then
      load_config
      printf '%s%s, %s%s\n' "$C_DIM" "$(installed_version)" "$(systemctl is-active "$SERVICE" 2>/dev/null || true)" "$C_0"
      printf '  %s\n\n' "$(app_url)"
    else
      printf '%snot installed%s\n\n' "$C_DIM" "$C_0"
    fi
    printf '  1) Install          2) Update           3) Change ports / domain\n'
    printf '  4) Start            5) Stop             6) Restart\n'
    printf '  7) Status           8) Logs             9) Reset a password\n'
    printf ' 10) Uninstall        0) Exit\n\n'
    case "$(ask "Choose" "0")" in
      1) cmd_install ;;
      2) cmd_update ;;
      3) cmd_config ;;
      4) systemctl start "$SERVICE" && ok "started" ;;
      5) systemctl stop "$SERVICE" && ok "stopped" ;;
      6) systemctl restart "$SERVICE" && ok "restarted" ;;
      7) cmd_status ;;
      8) journalctl -u "$SERVICE" -n 60 --no-pager ;;
      9) cmd_reset_password ;;
      10) cmd_uninstall && installed || return 0 ;;
      0 | q | exit) return 0 ;;
      *) warn "unknown choice" ;;
    esac
  done
}

# ---------------------------------------------------------------- main

CMD=""
POS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --port) OPT_PORT=${2:?}; shift ;;
    --http-port) OPT_HTTP=${2:?}; shift ;;
    --turn-port) OPT_TURN=${2:?}; shift ;;
    --domain) OPT_DOMAIN=${2:?}; shift ;;
    --data) OPT_DATA=${2:?}; shift ;;
    --admin) OPT_ADMIN=${2:?}; shift ;;
    --password) OPT_PASSWORD=${2:?}; shift ;;
    --app-name) OPT_APPNAME=${2:?}; shift ;;
    --version) OPT_VERSION=${2:?}; shift ;;
    -y | --yes) ASSUME_YES=1 ;;
    --purge) PURGE=1 ;;
    --force) FORCE=1 ;;
    -h | --help | help) CMD=help ;;
    -*) die "unknown option $1 (see: neochatctl help)" ;;
    *) if [ -z "$CMD" ]; then CMD=$1; else POS+=("$1"); fi ;;
  esac
  shift
done

case "$CMD" in
  "") if installed; then menu; else cmd_install; fi ;;
  install) cmd_install ;;
  update | upgrade) cmd_update ;;
  config | ports) cmd_config ;;
  uninstall | remove) cmd_uninstall ;;
  status | info) cmd_status ;;
  start | stop | restart) need_root && systemctl "$CMD" "$SERVICE" && ok "$CMD done" ;;
  logs) journalctl -u "$SERVICE" -n 100 -f ;;
  reset-password) cmd_reset_password "${POS[@]+"${POS[@]}"}" ;;
  menu) menu ;;
  help) usage ;;
  *) die "unknown command $CMD (see: neochatctl help)" ;;
esac
