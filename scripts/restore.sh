#!/usr/bin/env bash
# NeoChat restore helper — extracts a backup archive and restores PostgreSQL.
#
# Usage:
#   ./scripts/restore.sh <backup-archive.tar.gz>
#
# WARNING: This overwrites database content. Stop the API before restoring.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCHIVE="${1:?Usage: ./scripts/restore.sh <backup-archive.tar.gz>}"
COMPOSE=(docker compose -f "${ROOT}/deploy/docker-compose.yml" --env-file "${ROOT}/.env")
POSTGRES_USER="${POSTGRES_USER:-neochat}"
POSTGRES_DB="${POSTGRES_DB:-neochat}"
TMP="${ROOT}/.restore-tmp-$$"

cleanup() { rm -rf "${TMP}"; }
trap cleanup EXIT

mkdir -p "${TMP}"
tar -xzf "${ARCHIVE}" -C "${TMP}"
INNER="$(find "${TMP}" -mindepth 1 -maxdepth 1 -type d | head -1)"
SQL_FILE=""

for candidate in postgres.sql critical-tables.sql; do
  if [[ -f "${INNER}/${candidate}" ]]; then
    SQL_FILE="${INNER}/${candidate}"
    break
  fi
done

if [[ -z "${SQL_FILE}" ]]; then
  echo "[restore] error: no postgres.sql or critical-tables.sql found in archive" >&2
  exit 1
fi

echo "[restore] restoring from ${SQL_FILE} …"
cat "${SQL_FILE}" | "${COMPOSE[@]}" exec -T postgres \
  psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"

if [[ -f "${INNER}/config.json" ]]; then
  echo "[restore] config.json present — apply settings manually via admin panel if needed."
fi

echo "[restore] done. Restart api/web/admin and verify health endpoints."
