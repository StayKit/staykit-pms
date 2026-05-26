#!/usr/bin/env bash
# StayKit — roll a new image tag across every provisioned tenant.
#
# Usage:
#   sudo /srv/staykit/bin/upgrade-all.sh <image-tag> [--only <slug>[,<slug>...]] [--canary <slug>]
#
# Each tenant's compose file pins ${IMAGE}:${IMAGE_TAG} via env interpolation,
# so the upgrade is `docker compose pull && up -d` per tenant. The container
# entrypoint runs `prisma db push` against /data, so schema-additive changes
# apply automatically. For destructive schema changes, run --canary first
# against a known-good tenant and verify.

set -euo pipefail

STAYKIT_ROOT="${STAYKIT_ROOT:-/srv/staykit}"
TENANTS_DIR="${STAYKIT_ROOT}/tenants"
IMAGE="${IMAGE:-ghcr.io/saif/staykit}"

usage() {
  cat >&2 <<'EOF'
Usage: upgrade-all.sh <image-tag> [--only <slug>[,<slug>...]] [--canary <slug>]
EOF
  exit 64
}

[[ $# -ge 1 ]] || usage
NEW_TAG="$1"; shift

ONLY=""
CANARY=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --only)   ONLY="$2"; shift 2 ;;
    --canary) CANARY="$2"; shift 2 ;;
    *) usage ;;
  esac
done

log()  { printf '[upgrade-all] %s\n' "$*" >&2; }
fail() { printf '[upgrade-all] ERROR: %s\n' "$*" >&2; exit 1; }

# Build the tenant list.
mapfile -t ALL_TENANTS < <(find "$TENANTS_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)
[[ ${#ALL_TENANTS[@]} -gt 0 ]] || fail "No tenants found under $TENANTS_DIR"

if [[ -n "$ONLY" ]]; then
  IFS=',' read -ra ALL_TENANTS <<< "$ONLY"
fi

upgrade_one() {
  local slug="$1"
  local dir="$TENANTS_DIR/$slug"
  [[ -f "$dir/docker-compose.yml" ]] || { log "skip $slug (no compose file)"; return 0; }

  log "→ $slug : pulling ${IMAGE}:${NEW_TAG}"
  ( cd "$dir" && IMAGE_TAG="$NEW_TAG" docker compose pull app >/dev/null )

  log "→ $slug : restarting with new tag"
  ( cd "$dir" && IMAGE_TAG="$NEW_TAG" docker compose up -d )

  # Wait for health.
  local deadline=$(( $(date +%s) + 90 ))
  while :; do
    local s
    s="$(docker inspect --format '{{.State.Health.Status}}' "staykit-${slug}" 2>/dev/null || echo missing)"
    if [[ "$s" == "healthy" ]]; then
      log "→ $slug : healthy"
      return 0
    fi
    if [[ $(date +%s) -ge $deadline ]]; then
      log "→ $slug : NOT healthy after 90s — recent logs:"
      docker logs --tail 60 "staykit-${slug}" >&2 || true
      return 1
    fi
    sleep 2
  done
}

if [[ -n "$CANARY" ]]; then
  log "Canary: upgrading '$CANARY' first."
  upgrade_one "$CANARY" || fail "Canary '$CANARY' failed. Aborting rollout."
  log "Canary OK. Proceeding with the rest."
fi

failures=()
for slug in "${ALL_TENANTS[@]}"; do
  [[ "$slug" == "$CANARY" ]] && continue
  if ! upgrade_one "$slug"; then
    failures+=("$slug")
  fi
done

if [[ ${#failures[@]} -gt 0 ]]; then
  log "Upgrade complete with FAILURES: ${failures[*]}"
  exit 1
fi

log "Upgrade complete: ${#ALL_TENANTS[@]} tenant(s) on ${IMAGE}:${NEW_TAG}."
