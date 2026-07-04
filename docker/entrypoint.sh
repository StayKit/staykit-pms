#!/bin/sh
# StayKit container entrypoint.
# Ensures the SQLite schema on the /data volume matches the Prisma schema, then
# hands off to the standalone server (CMD). The project uses `db push` rather than
# migrations, so we mirror that here — idempotent on every start and on upgrades.
set -e

echo "[staykit] DATABASE_URL=${DATABASE_URL}"
echo "[staykit] applying schema (prisma db push)…"
# The CLI lives in its own directory with a complete dependency closure (see the
# Dockerfile `prismacli` stage); the schema is still discovered from ./prisma via CWD.
node ./prisma-cli/node_modules/prisma/build/index.js db push --skip-generate

echo "[staykit] starting server: $*"
exec "$@"
