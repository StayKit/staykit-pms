#!/bin/sh
# StayKit container entrypoint.
# Ensures the SQLite schema on the /data volume matches the Prisma schema, then
# hands off to the standalone server (CMD). The project uses `db push` rather than
# migrations, so we mirror that here — idempotent on every start and on upgrades.
set -e

echo "[staykit] DATABASE_URL=${DATABASE_URL}"
echo "[staykit] applying schema (prisma db push)…"
node ./node_modules/prisma/build/index.js db push --skip-generate

echo "[staykit] starting server: $*"
exec "$@"
