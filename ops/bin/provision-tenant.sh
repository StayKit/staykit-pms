#!/usr/bin/env bash
# StayKit — provision a new tenant on this VPS.
#
# Usage:
#   sudo /srv/staykit/bin/provision-tenant.sh <slug> "<owner-name>" "<+E164-phone>" [<email>]
#
# What it does, in order:
#   1. Validate slug (DNS-safe, not reserved, not already provisioned).
#   2. Generate per-tenant OTP_PEPPER and FILE_ENCRYPTION_KEY (never reuse across tenants).
#   3. Render tenants/<slug>/{docker-compose.yml, .env, litestream.yml} from templates.
#   4. Pull the StayKit image at IMAGE_TAG.
#   5. `docker compose up -d` — entrypoint runs `prisma db push` on the empty volume.
#   6. Wait for the container's healthcheck to flip to "healthy".
#   7. Run bin/bootstrap-tenant.mjs inside the container (creates Owner + OWNER User).
#   8. Print login URL and post-provision checklist.
#
# Idempotency: if `tenants/<slug>/` already exists, the script exits non-zero with
# a clear error. Re-run after fixing the underlying issue and `rm -rf` of the
# half-created directory.

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
STAYKIT_ROOT="${STAYKIT_ROOT:-/srv/staykit}"
TEMPLATES_DIR="${STAYKIT_ROOT}/templates"
TENANTS_DIR="${STAYKIT_ROOT}/tenants"
SHARED_ENV="${STAYKIT_ROOT}/shared/.env"

# These are read from the shared .env (or environment) — see ops/Caddyfile + ops/docker-compose.caddy.yml.
IMAGE="${IMAGE:-ghcr.io/saif/staykit}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

# Subdomains we will never hand out — extend this list as needed.
RESERVED_SLUGS=(
  www mail email api admin app dashboard portal
  mcp status health monitor metrics grafana prometheus
  static assets cdn img images media files docs help support
  login signup signin register auth oauth oauth2 sso
  staykit staging test demo internal billing pay
)

# ── Helpers ─────────────────────────────────────────────────────────────────
log()  { printf '[provision-tenant] %s\n' "$*" >&2; }
fail() { printf '[provision-tenant] ERROR: %s\n' "$*" >&2; exit 1; }

require() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command missing: $1"
}

usage() {
  cat >&2 <<'EOF'
Usage:
  provision-tenant.sh <slug> "<owner-name>" "<+E164-phone>" [<email>]

Environment:
  STAYKIT_ROOT       (default: /srv/staykit)
  IMAGE              (default: ghcr.io/saif/staykit)
  IMAGE_TAG          (default: latest)
  LITESTREAM_ENDPOINT, LITESTREAM_BUCKET,
  LITESTREAM_ACCESS_KEY, LITESTREAM_SECRET
                     (must be set, either inline or in shared/.env)
EOF
  exit 64
}

# ── Sanity ──────────────────────────────────────────────────────────────────
require docker
require openssl
require envsubst   # part of gettext-base

[[ $# -ge 3 ]] || usage

SLUG="$1"
OWNER_NAME="$2"
OWNER_PHONE="$3"
OWNER_EMAIL="${4-}"

# Source shared .env if present (sets LITESTREAM_*, IMAGE, etc).
if [[ -f "$SHARED_ENV" ]]; then
  # shellcheck disable=SC1090
  set -a; . "$SHARED_ENV"; set +a
fi

# ── 1. Validate ─────────────────────────────────────────────────────────────
[[ "$SLUG" =~ ^[a-z][a-z0-9-]{1,30}$ ]] || \
  fail "Slug must match ^[a-z][a-z0-9-]{1,30}$ — got: $SLUG"

for r in "${RESERVED_SLUGS[@]}"; do
  [[ "$SLUG" == "$r" ]] && fail "Slug '$SLUG' is reserved."
done

TENANT_DIR="${TENANTS_DIR}/${SLUG}"
[[ -e "$TENANT_DIR" ]] && \
  fail "Tenant already exists at $TENANT_DIR. Remove it manually if you really want to re-provision."

[[ "$OWNER_PHONE" =~ ^\+[0-9]{8,15}$ ]] || \
  fail "Phone must be E.164 (e.g. +919876543210) — got: $OWNER_PHONE"

if [[ -n "$OWNER_EMAIL" ]]; then
  [[ "$OWNER_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || \
    fail "Email looks malformed: $OWNER_EMAIL"
fi

: "${LITESTREAM_ENDPOINT:?Set LITESTREAM_ENDPOINT (e.g. https://s3.ap-south-1.amazonaws.com)}"
: "${LITESTREAM_BUCKET:?Set LITESTREAM_BUCKET}"
: "${LITESTREAM_ACCESS_KEY:?Set LITESTREAM_ACCESS_KEY}"
: "${LITESTREAM_SECRET:?Set LITESTREAM_SECRET}"

# Sanity-check that the shared Caddy network exists.
docker network inspect caddy >/dev/null 2>&1 || \
  fail "Docker network 'caddy' is missing. Create it with: docker network create caddy"

# ── 2. Generate per-tenant secrets ──────────────────────────────────────────
log "Generating per-tenant secrets…"
OTP_PEPPER="$(openssl rand -hex 32)"
FILE_ENCRYPTION_KEY="$(openssl rand -hex 32)"
export SLUG IMAGE IMAGE_TAG OTP_PEPPER FILE_ENCRYPTION_KEY \
       LITESTREAM_ENDPOINT LITESTREAM_BUCKET LITESTREAM_ACCESS_KEY LITESTREAM_SECRET

# ── 3. Render files ─────────────────────────────────────────────────────────
log "Rendering tenant directory at $TENANT_DIR"
mkdir -p "$TENANT_DIR/data"

# `envsubst` substitutes only the named vars — anything not on the allowlist
# (e.g. compose's own ${VAR-default} or Caddy's {labels 0}) is passed through.
ALLOW='${SLUG} ${IMAGE} ${IMAGE_TAG} ${OTP_PEPPER} ${FILE_ENCRYPTION_KEY} ${LITESTREAM_ENDPOINT} ${LITESTREAM_BUCKET} ${LITESTREAM_ACCESS_KEY} ${LITESTREAM_SECRET}'

envsubst "$ALLOW" < "$TEMPLATES_DIR/docker-compose.tenant.yml.tmpl" > "$TENANT_DIR/docker-compose.yml"
envsubst "$ALLOW" < "$TEMPLATES_DIR/env.tenant.tmpl"                > "$TENANT_DIR/.env"
envsubst "$ALLOW" < "$TEMPLATES_DIR/litestream.yml.tmpl"            > "$TENANT_DIR/litestream.yml"

chmod 600 "$TENANT_DIR/.env"

# ── 4. Pull image ───────────────────────────────────────────────────────────
log "Pulling image ${IMAGE}:${IMAGE_TAG}…"
docker pull "${IMAGE}:${IMAGE_TAG}" >/dev/null

# ── 5. Boot the stack ───────────────────────────────────────────────────────
log "Starting stack for tenant '${SLUG}'…"
( cd "$TENANT_DIR" && docker compose up -d )

# ── 6. Wait for health ──────────────────────────────────────────────────────
log "Waiting for staykit-${SLUG} to become healthy (up to 90s)…"
deadline=$(( $(date +%s) + 90 ))
while :; do
  status="$(docker inspect --format '{{.State.Health.Status}}' "staykit-${SLUG}" 2>/dev/null || echo missing)"
  if [[ "$status" == "healthy" ]]; then
    break
  fi
  if [[ $(date +%s) -ge $deadline ]]; then
    log "Container did not become healthy in time. Recent logs:"
    docker logs --tail 80 "staykit-${SLUG}" >&2 || true
    fail "Tenant '${SLUG}' container is unhealthy. Inspect with: docker logs staykit-${SLUG}"
  fi
  sleep 2
done

# ── 7. Bootstrap Owner + first User ─────────────────────────────────────────
log "Creating initial Owner and OWNER-role User inside the container…"
bootstrap_args=(--name "$OWNER_NAME" --phone "$OWNER_PHONE")
[[ -n "$OWNER_EMAIL" ]] && bootstrap_args+=(--email "$OWNER_EMAIL")

docker compose -f "$TENANT_DIR/docker-compose.yml" exec -T app \
  node /app/bin/bootstrap-tenant.mjs "${bootstrap_args[@]}"

# ── 8. Summary ──────────────────────────────────────────────────────────────
cat <<EOF

────────────────────────────────────────────────────────────────────────────
 ✅ Tenant '${SLUG}' provisioned.

  URL          : https://${SLUG}.staykit.app
  Login        : https://${SLUG}.staykit.app/login   (phone: ${OWNER_PHONE})
  Data dir     : ${TENANT_DIR}/data
  Env file     : ${TENANT_DIR}/.env  (chmod 600)
  Compose      : ${TENANT_DIR}/docker-compose.yml
  Backups      : s3://${LITESTREAM_BUCKET}/${SLUG}/db   (replicating now)

 Next steps (per-tenant, as needed):
  • Edit ${TENANT_DIR}/.env to add Razorpay / MSG91 / Resend keys, then:
      cd ${TENANT_DIR} && docker compose restart app
  • Register Razorpay webhook URL:
      https://${SLUG}.staykit.app/api/razorpay/webhook
  • Schedule the host-level uploads backup (cron + rclone sync of
      ${TENANT_DIR}/data/uploads/) — Litestream covers the SQLite DB only.
────────────────────────────────────────────────────────────────────────────
EOF
