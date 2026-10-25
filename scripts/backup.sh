#!/usr/bin/env bash
# NeoChat backup: PostgreSQL dump + notes for MinIO object storage.
#
# Usage:
#   ./scripts/backup.sh [output-dir]
#
# Requires: docker, a running NeoChat compose stack, pg_dump inside postgres container.
# MinIO objects are NOT included automatically — see MINIO section below.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${1:-${ROOT}/backups}"
COMPOSE=(docker compose -f "${ROOT}/deploy/docker-compose.yml" --env-file "${ROOT}/.env")
STAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
DEST="${OUT_DIR}/neochat-backup-${STAMP}"
ARCHIVE="${OUT_DIR}/neochat-backup-${STAMP}.tar.gz"

POSTGRES_USER="${POSTGRES_USER:-neochat}"
POSTGRES_DB="${POSTGRES_DB:-neochat}"
MINIO_BUCKET="${MINIO_BUCKET:-neochat-media}"

mkdir -p "${DEST}"

echo "[backup] writing PostgreSQL dump …"
"${COMPOSE[@]}" exec -T postgres \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --no-owner --no-acl \
  > "${DEST}/postgres.sql"

cat > "${DEST}/README.txt" <<EOF
NeoChat backup ${STAMP}
=======================

Included
  - postgres.sql   logical PostgreSQL dump (restore with psql or pg_restore)

NOT included (manual steps required)
  - MinIO / S3 object storage (${MINIO_BUCKET})
    Media blobs live in MinIO. Back up separately, for example:

      docker compose -f deploy/docker-compose.yml exec minio \\
        mc mirror /data/${MINIO_BUCKET} /tmp/minio-backup

    Or use \`mc mirror\` against your MinIO endpoint from an operator workstation.

  - Redis (ephemeral cache/sessions; usually not backed up)
  - LiveKit state (none persisted by default in this stack)

Restore PostgreSQL (example)
  cat postgres.sql | docker compose -f deploy/docker-compose.yml exec -T postgres \\
    psql -U ${POSTGRES_USER} -d ${POSTGRES_DB}

Keep JWT secrets and .env with the backup — tokens and encrypted payloads depend on them.

Restore:
  ./scripts/restore.sh ../backups/neochat-backup-YYYYMMDDTHHMMSSZ.tar.gz

Note: Message payloads in postgres.sql are ciphertext only — plaintext is never exported.
EOF

(
  cd "${OUT_DIR}"
  tar -czf "$(basename "${ARCHIVE}")" "$(basename "${DEST}")"
)

echo "[backup] archive: ${ARCHIVE}"
echo "[backup] remember to mirror MinIO bucket '${MINIO_BUCKET}' separately."
