#!/bin/sh
# Dumps the database and archives the uploads to backups/, and keeps the last
# 7 days of both. Meant for cron.
set -eu
cd "$(dirname "$0")/.."
mkdir -p backups
compose() {
    docker compose --env-file .env.prod -f compose.prod.yaml "$@"
}
stamp="$(date +%F-%H%M)"

# Drops the files whose owner is gone first, so they are not archived. A failed
# sweep only means a few extra files in the archive: never skip the backup for it.
compose exec -T api npm run --silent files:sweep:prod \
    || echo "files:sweep falhou; o backup continua" >&2

compose exec -T db \
    sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
    > "backups/erp-$stamp.dump"
compose exec -T api tar czf - -C /app/uploads . \
    > "backups/uploads-$stamp.tar.gz"

find backups \( -name 'erp-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime +7 -delete
