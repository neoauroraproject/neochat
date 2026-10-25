#!/usr/bin/env bash
# Build an offline NeoChat deployment bundle (saved Docker images + compose + env template).
#
# Usage:
#   ./scripts/build-offline-bundle.sh [output-dir]
#
# Produces:
#   deploy/offline/neochat-offline-YYYYMMDD.tar.gz
#     images/neochat-images.tar.gz   docker save of all stack images
#     deploy/                        compose, nginx/caddy/livekit configs
#     .env.example                   bootstrap env template
#     scripts/backup.sh              backup helper
#     SHA256SUMS                     checksums for bundle contents
#     README-OFFLINE.txt             restore instructions
#
# On the target host (with Docker):
#   tar xzf neochat-offline-YYYYMMDD.tar.gz
#   gunzip -c images/neochat-images.tar.gz | docker load
#   cp .env.example .env && $EDITOR .env
#   docker compose -f deploy/docker-compose.yml --env-file .env up -d

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_ROOT="${1:-${ROOT}/deploy/offline}"
STAMP="$(date -u +"%Y%m%d")"
BUNDLE_NAME="neochat-offline-${STAMP}"
WORK="${OUT_ROOT}/${BUNDLE_NAME}"
ARCHIVE="${OUT_ROOT}/${BUNDLE_NAME}.tar.gz"

COMPOSE=(docker compose -f "${ROOT}/deploy/docker-compose.yml" --env-file "${ROOT}/.env.example")

echo "[offline] building application images …"
"${COMPOSE[@]}" build api web admin

echo "[offline] pulling infrastructure images …"
docker pull postgres:16-alpine
docker pull redis:7-alpine
docker pull minio/minio:latest
docker pull minio/mc:latest
docker pull livekit/livekit-server:latest
docker pull nginx:1.27-alpine
docker pull caddy:2.8-alpine

IMAGES=(
  "postgres:16-alpine"
  "redis:7-alpine"
  "minio/minio:latest"
  "minio/mc:latest"
  "livekit/livekit-server:latest"
  "nginx:1.27-alpine"
  "caddy:2.8-alpine"
)

# Resolve locally built neochat images from compose
while IFS= read -r line; do
  [[ -n "${line}" ]] && IMAGES+=("${line}")
done < <("${COMPOSE[@]}" config --images | grep -E 'neochat|api|web|admin' || true)

# De-duplicate
mapfile -t IMAGES < <(printf '%s\n' "${IMAGES[@]}" | sort -u)

rm -rf "${WORK}"
mkdir -p "${WORK}/images" "${WORK}/deploy" "${WORK}/scripts"

echo "[offline] saving ${#IMAGES[@]} images …"
docker save "${IMAGES[@]}" | gzip > "${WORK}/images/neochat-images.tar.gz"

cp -R "${ROOT}/deploy/docker-compose.yml" \
      "${ROOT}/deploy/docker-compose.tls.yml" \
      "${ROOT}/deploy/nginx" \
      "${ROOT}/deploy/caddy" \
      "${ROOT}/deploy/livekit" \
      "${WORK}/deploy/"

cp "${ROOT}/.env.example" "${WORK}/.env.example"
cp "${ROOT}/scripts/backup.sh" "${WORK}/scripts/backup.sh"
cp "${ROOT}/scripts/restore.sh" "${WORK}/scripts/restore.sh"
cp "${ROOT}/package-lock.json" "${WORK}/SBOM-package-lock.json" 2>/dev/null || true

cat > "${WORK}/README-OFFLINE.txt" <<'EOF'
NeoChat offline bundle
======================

1. Load images:
     gunzip -c images/neochat-images.tar.gz | docker load

2. Configure:
     cp .env.example .env
     Edit secrets (JWT_*, POSTGRES_PASSWORD, MINIO_*, LIVEKIT_*, PUBLIC_* URLs)

3. Start Stage-1 (HTTP on NEOCHAT_HTTP_PORT, default 8085):
     docker compose -f deploy/docker-compose.yml --env-file .env up -d

4. Migrate database (first run):
     docker compose -f deploy/docker-compose.yml --env-file .env run --rm api \
       node -e "console.log('Run migrations from a machine with repo sources, or exec into api after copying migrate tooling.')"

   If you have the full repo, prefer:
     docker compose -f deploy/docker-compose.yml --env-file .env exec api sh -lc \
       'cd /app/apps/api && node dist/database/migrate.js'  # when migrate is bundled

5. Stage-2 HTTPS:
     Edit deploy/caddy/Caddyfile placeholders, then:
     docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.tls.yml --profile caddy --env-file .env up -d

Verify checksums:
  sha256sum -c SHA256SUMS

SBOM note:
  SBOM-package-lock.json contains the npm lockfile at bundle build time.
  For CycloneDX SBOM generation, run cyclonedx-npm on a machine with the full repo.
EOF

(
  cd "${WORK}"
  find . -type f ! -name 'SHA256SUMS' -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
)

mkdir -p "${OUT_ROOT}"
tar -czf "${ARCHIVE}" -C "${OUT_ROOT}" "${BUNDLE_NAME}"

echo "[offline] bundle ready: ${ARCHIVE}"
echo "[offline] checksums: ${WORK}/SHA256SUMS"
