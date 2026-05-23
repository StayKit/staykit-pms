# syntax=docker/dockerfile:1
#
# StayKit — multi-stage build producing a small, non-root Next.js standalone image.
# Debian-slim (glibc) base so Prisma's native query engine works without extra
# binaryTargets. OpenSSL is required by the Prisma engines.
#
#   docker build -t staykit .
#   docker run -p 3000:3000 -v staykit-data:/data -e OTP_PEPPER=... staykit
#
ARG NODE_IMAGE=node:22-bookworm-slim

# ───── 1. deps: install full dependency tree (incl. devDeps for the build) ─────
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# HUSKY=0 disables the `prepare` hook install — there's no .git in the build context.
RUN HUSKY=0 npm ci

# ───── 2. builder: generate Prisma client + build the standalone server ─────
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `public/` may not exist in the repo; standalone needs it copied explicitly later.
RUN mkdir -p public
ENV NEXT_TELEMETRY_DISABLED=1
# Build only needs a *valid* sqlite URL — no real data dir is touched. We push the
# schema to a throwaway file so any DB access during static analysis finds tables.
ENV DATABASE_URL="file:/tmp/build.db?connection_limit=1"
RUN npm run db:push && npm run build

# ───── 3. runner: minimal runtime — standalone server + Prisma CLI for db push ─────
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL="file:/data/staykit.db?connection_limit=1"
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Non-root user; /data is the writable volume for the SQLite DB (+ future uploads).
RUN groupadd -g 1001 nodejs \
 && useradd -u 1001 -g nodejs -m -d /home/nextjs nextjs \
 && mkdir -p /data \
 && chown -R nextjs:nodejs /data

# Next.js standalone bundle: server.js + traced node_modules + minimal package.json.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma schema + CLI/engines so the entrypoint can run `db push` against /data.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

COPY --chown=nextjs:nodejs docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER nextjs
EXPOSE 3000
VOLUME ["/data"]

# Uses the app's own DB-backed health endpoint (Node 22 ships global fetch).
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["entrypoint.sh"]
CMD ["node", "server.js"]

# ───── 4. seed (optional): one-shot DB seeding with full deps + source ─────
# Built only on demand (e.g. `docker compose --profile seed run --rm seed`).
FROM builder AS seed
ENV NODE_ENV=production \
    DATABASE_URL="file:/data/staykit.db?connection_limit=1"
CMD ["sh", "-c", "node ./node_modules/prisma/build/index.js db push --skip-generate && npm run db:seed"]
