# Multi-tenant hosting (subdomain-per-tenant)

Run StayKit as a SaaS where each customer lives at `<slug>.staykit.app`. Every
tenant gets its own container, SQLite file, and uploads directory; tenants
share only the host kernel, the Docker image, and one Caddy edge.

This shape is the cheapest viable shape until ~30 tenants. Past that, migrate
to shared Postgres ([migrate-to-postgres.md](./migrate-to-postgres.md)) and
keep this same provisioning UX.

## Topology

```
Internet
   │   *.staykit.app A → VPS_IP   (one wildcard DNS record)
   ▼
Caddy (host network, :80/:443) — wildcard TLS via Cloudflare DNS-01
   ├─→ acme.staykit.app  →  staykit-acme:3000   (Docker network: caddy)
   ├─→ bell.staykit.app  →  staykit-bell:3000
   └─→ staykit.app       →  apex landing
```

Tenants are **never** port-published on the host. Caddy reaches each app over
the shared `caddy` Docker network using labels on the tenant container
(`caddy-docker-proxy`).

## One-time VPS setup

A single small VPS (Hetzner CX22 / DO 2 GB / equivalent) comfortably holds
10–15 tenants.

1. **DNS.** Add two records at your DNS provider:
   - `staykit.app           A   <VPS_IP>`
   - `*.staykit.app         A   <VPS_IP>`

2. **Host packages.**

   ```bash
   apt-get install -y docker.io docker-compose-plugin gettext-base openssl
   docker network create caddy
   ```

3. **Repo layout on the VPS.**

   ```bash
   mkdir -p /srv/staykit/{shared,templates,bin,tenants}
   # Copy from this repo:
   cp ops/Caddyfile                              /srv/staykit/shared/
   cp ops/docker-compose.caddy.yml               /srv/staykit/shared/docker-compose.yml
   cp ops/templates/*.tmpl                       /srv/staykit/templates/
   cp ops/bin/provision-tenant.sh                /srv/staykit/bin/
   cp ops/bin/upgrade-all.sh                     /srv/staykit/bin/
   chmod +x /srv/staykit/bin/*.sh
   ```

4. **Shared `.env`.** Used by both Caddy and the provisioning script.

   ```bash
   cat > /srv/staykit/shared/.env <<EOF
   # Cloudflare API token, scoped to DNS:Edit on the staykit.app zone.
   CF_API_TOKEN=...
   # StayKit image (override with your registry if you self-host the image).
   IMAGE=ghcr.io/saif/staykit
   IMAGE_TAG=latest
   # Litestream S3 (ap-south-1 or Cloudflare R2 with India restriction).
   LITESTREAM_ENDPOINT=https://s3.ap-south-1.amazonaws.com
   LITESTREAM_BUCKET=staykit-backups
   LITESTREAM_ACCESS_KEY=...
   LITESTREAM_SECRET=...
   EOF
   chmod 600 /srv/staykit/shared/.env
   ```

5. **Start Caddy.**

   ```bash
   cd /srv/staykit/shared
   docker compose up -d
   ```

   Caddy fetches the wildcard cert on first request and caches it in the
   `caddy-data` volume.

6. **Registry login (if pulling from a private registry).**
   ```bash
   docker login ghcr.io
   ```

## Onboard a new tenant

One command:

```bash
sudo /srv/staykit/bin/provision-tenant.sh acme "Acme Homestays" "+919876543210" ops@acme.in
```

What happens, in order ([provision-tenant.sh](../ops/bin/provision-tenant.sh)):

1. **Validate** slug (`^[a-z][a-z0-9-]{1,30}$`, not in a reserved list, not in use).
2. **Generate** fresh `OTP_PEPPER` and `FILE_ENCRYPTION_KEY` (32 bytes each).
   These must be unique per tenant — sharing them across tenants would let one
   tenant forge OTPs or decrypt another's ID documents.
3. **Render** `tenants/acme/{docker-compose.yml, .env, litestream.yml}` from
   the templates. `chmod 600` on `.env`.
4. **Pull** `${IMAGE}:${IMAGE_TAG}`.
5. **Boot** the stack with `docker compose up -d`. The container's
   [entrypoint](../docker/entrypoint.sh) runs `prisma db push` against the empty
   `/data` volume, creating the schema.
6. **Wait** for the container's healthcheck (`/api/health`) to flip to `healthy`.
7. **Bootstrap** the initial Owner + OWNER-role User by running
   [bin/bootstrap-tenant.mjs](../bin/bootstrap-tenant.mjs) inside the container.
8. **Print** the login URL and a short checklist.

The customer signs in by visiting `https://<slug>.staykit.app/login`, entering
the phone you provisioned, and confirming the OTP delivered via the configured
channel (MSG91 / Resend / console).

### After provisioning

Most tenants will want their own:

- **Razorpay keys**. Edit `tenants/<slug>/.env`, then
  `cd tenants/<slug> && docker compose restart app`. Register the webhook URL
  `https://<slug>.staykit.app/api/razorpay/webhook` in the tenant's Razorpay
  dashboard.
- **MSG91 / Resend keys**. Same flow as Razorpay.

Without these, payments run in mock mode and notifications log to stdout.

## Cookie + URL isolation (automatic, no code changes)

The app already uses `__Host-` prefixed session cookies, which are host-only by
spec — a session set on `acme.staykit.app` cannot be sent to `bell.staykit.app`.
No additional cookie-domain configuration is required.

`APP_BASE_URL` is read per tenant and feeds Razorpay callback URLs, MCP OAuth
resource indicators, and the well-known discovery endpoints — so each tenant's
MCP discovery returns its own subdomain.

## Backups

- **SQLite.** Each tenant's Litestream sidecar replicates `/data/staykit.db` to
  `s3://${LITESTREAM_BUCKET}/<slug>/db` once per second. On boot, the sidecar
  restores from the replica if the local DB is missing.
- **Uploads.** Litestream **does not** cover `/data/uploads/`. Add a nightly
  cron on the host:
  ```cron
  0 3 * * * rclone sync /srv/staykit/tenants /<remote>:staykit-uploads --include "**/uploads/**"
  ```

Run a monthly restore drill against a throwaway tenant: `docker compose down`,
`rm -rf data/`, `docker compose up -d`, confirm the data comes back.

## Upgrades

```bash
# CI builds + pushes ghcr.io/saif/staykit:v1.2.3
sudo /srv/staykit/bin/upgrade-all.sh v1.2.3
```

For schema-destructive changes, canary first:

```bash
sudo /srv/staykit/bin/upgrade-all.sh v1.2.3 --canary acme
```

## Sizing

Per-tenant footprint at idle, on a CX22-class box:

- Next.js standalone container : ~150–250 MB resident
- Litestream sidecar : ~20 MB
- SQLite + uploads on disk : depends on bookings + ID docs

A 4 GB VPS comfortably holds 10–15 tenants. Past that, scale up the VPS first;
past ~30 tenants, plan the Postgres migration.

## Operator quick-reference

| Task                 | Command                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------- |
| Add a tenant         | `provision-tenant.sh <slug> "<name>" "<+E164>" [<email>]`                                |
| Restart a tenant     | `cd /srv/staykit/tenants/<slug> && docker compose restart app`                           |
| View a tenant's logs | `docker logs -f staykit-<slug>`                                                          |
| Update env / keys    | edit `tenants/<slug>/.env`, then `docker compose up -d`                                  |
| Roll out new image   | `upgrade-all.sh <tag>` (add `--canary <slug>` for risky tags)                            |
| Remove a tenant      | `cd tenants/<slug> && docker compose down -v && rm -rf .` (irreversible — back up first) |

## Pitfalls

- **Never reuse `OTP_PEPPER` or `FILE_ENCRYPTION_KEY` across tenants.** The
  provisioning script generates them; do not copy a tenant directory to make a
  new one.
- **Reserved subdomains.** `provision-tenant.sh` denylists `www`, `api`,
  `admin`, `mcp`, `status`, etc. Extend the list in the script if you reserve
  more.
- **DNS must be wildcard.** A missing `*.staykit.app` record means new tenants
  return certificate errors even though the container is healthy.
- **Razorpay webhook URL** is per tenant. Customers must register
  `https://<slug>.staykit.app/api/razorpay/webhook` themselves; document this
  in your onboarding email.
- **Uploads backup is separate from Litestream.** Don't rely on the SQLite
  replica alone.
