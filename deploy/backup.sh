#!/bin/sh
# Dumps the database to backups/ and keeps the last 7 days. Meant for cron.
set -eu
cd "$(dirname "$0")/.."
mkdir -p backups
docker compose --env-file .env.prod -f compose.prod.yaml exec -T db \
    sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
    > "backups/erp-$(date +%F-%H%M).dump"
find backups -name 'erp-*.dump' -mtime +7 -delete
