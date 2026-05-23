# Self-hosting StayKit

StayKit is a single Node process plus a SQLite file. It runs comfortably on a ~512 MB / 1 vCPU /
10 GB VPS (₹400–800/month class: Hetzner, DigitalOcean, Contabo).

## Quick start (Docker-less)

```bash
npm install
cp .env.example .env        # set OTP_PEPPER, APP_BASE_URL, provider keys
npm run build
npm run setup               # generate + db push + seed (skip seed in prod)
npm start                   # serves on :3000 behind your reverse proxy
```

Put it behind a TLS-terminating reverse proxy (Caddy/Nginx/Traefik). Cookies are `Secure` in
production, so HTTPS is required for login.

## SQLite production hardening

Apply these PRAGMAs on the database (also documented in the schema). `better-sqlite3` via Prisma's
driver adapter is the recommended driver at scale; the default connector is fine for v1.

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous   = NORMAL;
PRAGMA busy_timeout  = 5000;
PRAGMA foreign_keys  = ON;
PRAGMA cache_size    = -64000;   -- 64 MB
PRAGMA temp_store    = MEMORY;
PRAGMA mmap_size     = 268435456; -- 256 MB
```

Keep a single `PrismaClient` (we do — `src/lib/db.ts`) and `connection_limit=1` in the URL: SQLite is
a single writer.

## Backups: Litestream → S3

Run Litestream as a sidecar that streams the DB to S3-compatible storage every second.

```yaml
# litestream.yml
dbs:
  - path: /data/staykit.db
    replicas:
      - type: s3
        endpoint: ${LITESTREAM_ENDPOINT}
        bucket: ${LITESTREAM_BUCKET}
        path: staykit/db
        access-key-id: ${LITESTREAM_ACCESS_KEY}
        secret-access-key: ${LITESTREAM_SECRET}
        retention: 720h
        snapshot-interval: 24h
```

```sh
# entrypoint.sh
if [ ! -f /data/staykit.db ]; then
  litestream restore -if-replica-exists /data/staykit.db
fi
exec litestream replicate -exec "node server.js"
```

Use the **India region** (`ap-south-1`, or Cloudflare R2 with an India-restricted bucket) to align
with DPDP expectations. Run a monthly restore drill.

## Health & observability

- `GET /api/health` — DB ping + job-queue depth (returns 503 if the DB is down).
- Structured logs go to stdout; important events also land in `AuditLog`.

## Platforms

- **Coolify / Dokku / Docker** — recommended; one container + Litestream sidecar.
- **Fly.io** — volume for SQLite, region `bom` (Mumbai).
- **Railway** — mount a persistent volume.
- **Vercel** — not recommended as the primary host (no persistent disk for SQLite). Use Turso/libSQL
  or a separate worker container if you must.
