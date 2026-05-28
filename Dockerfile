# Build Weblab web client
# Pinned to match the bun version that generated bun.lock (1.3.10).
# When upgrading bun: update this tag, run `bun install` locally, commit bun.lock.
FROM oven/bun:1.3.10

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Public env vars only — these are baked into the client bundle and are not secret.
# Server secrets (SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY, CSB_API_KEY,
# SUPABASE_DATABASE_URL, etc.) are runtime-only and supplied by the platform
# (Railway). They must NOT appear as ARG/ENV in this Dockerfile, which would
# echo their values into build logs and image history.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_AUTH_PROVIDER
ARG NEXT_PUBLIC_HOSTING_DOMAIN
ARG NEXT_PUBLIC_SHOW_DEV_LOGIN
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_CONVEX_URL

ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}
ENV NEXT_PUBLIC_AUTH_PROVIDER=${NEXT_PUBLIC_AUTH_PROVIDER}
ENV NEXT_PUBLIC_HOSTING_DOMAIN=${NEXT_PUBLIC_HOSTING_DOMAIN}
ENV NEXT_PUBLIC_SHOW_DEV_LOGIN=${NEXT_PUBLIC_SHOW_DEV_LOGIN}
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
ENV NEXT_PUBLIC_CONVEX_URL=${NEXT_PUBLIC_CONVEX_URL}

# Skip server-env Zod validation during build; server-only vars are read at
# runtime from process.env. See apps/web/client/src/env.ts.
ENV SKIP_ENV_VALIDATION=true

# Native toolchain for node-gyp deps (e.g. better-sqlite3 via mem0ai peer).
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-setuptools make g++ \
    && rm -rf /var/lib/apt/lists/*

# ── Cache-efficient install ────────────────────────────────────────────────────
# Copy only the files bun needs to resolve + install the workspace. These change
# far less often than source files, so the bun install layer stays warm across
# the vast majority of deploys (i.e. anything that isn't a dep bump).
COPY bun.lock package.json bunfig.toml ./

COPY packages/ai/package.json              ./packages/ai/
COPY packages/ai-cli/package.json          ./packages/ai-cli/
COPY packages/auth/package.json            ./packages/auth/
COPY packages/code-provider/package.json   ./packages/code-provider/
COPY packages/constants/package.json       ./packages/constants/
COPY packages/db/package.json              ./packages/db/
COPY packages/email/package.json           ./packages/email/
COPY packages/figma/package.json           ./packages/figma/
COPY packages/figma-plugin/package.json    ./packages/figma-plugin/
COPY packages/file-system/package.json     ./packages/file-system/
COPY packages/fonts/package.json           ./packages/fonts/
COPY packages/framework/package.json       ./packages/framework/
COPY packages/git/package.json             ./packages/git/
COPY packages/github/package.json          ./packages/github/
COPY packages/growth/package.json          ./packages/growth/
COPY packages/image-server/package.json    ./packages/image-server/
COPY packages/mcp/package.json             ./packages/mcp/
COPY packages/models/package.json          ./packages/models/
COPY packages/parser/package.json          ./packages/parser/
COPY packages/penpal/package.json          ./packages/penpal/
COPY packages/rpc/package.json             ./packages/rpc/
COPY packages/scripts/package.json         ./packages/scripts/
COPY packages/stripe/package.json          ./packages/stripe/
COPY packages/types/package.json           ./packages/types/
COPY packages/ui/package.json              ./packages/ui/
COPY packages/utility/package.json         ./packages/utility/

COPY apps/web/package.json                 ./apps/web/
COPY apps/web/client/package.json          ./apps/web/client/
COPY apps/web/server/package.json          ./apps/web/server/
COPY apps/web/preload/package.json         ./apps/web/preload/
COPY apps/web/product-video/package.json   ./apps/web/product-video/

# Sibling apps that aren't built here but ARE bun workspace members: their
# package.json must be present or `bun install --frozen-lockfile` rejects the
# lockfile (the graph wouldn't match). None have install scripts except docs.
COPY apps/backend/package.json             ./apps/backend/
COPY apps/desktop/package.json             ./apps/desktop/
COPY apps/video/package.json               ./apps/video/

# @weblab/docs has `postinstall: fumadocs-mdx`, which bun runs during the
# workspace install. It reads source.config.ts and scans content/docs, so both
# must be copied alongside the manifest or the install fails.
COPY apps/docs/package.json                ./apps/docs/
COPY apps/docs/source.config.ts            ./apps/docs/
COPY apps/docs/content                     ./apps/docs/content/

COPY tooling/eslint/package.json           ./tooling/eslint/
COPY tooling/prettier/package.json         ./tooling/prettier/
COPY tooling/typescript/package.json       ./tooling/typescript/

RUN bun install --frozen-lockfile
# ──────────────────────────────────────────────────────────────────────────────

# Copy full source (only invalidates the build step, not install)
COPY . .

RUN cd apps/web/client \
    && bun run build

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD bun -e "fetch('http://localhost:3000').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["sh", "-lc", "cd apps/web/client && bun run start -- -H 0.0.0.0 -p ${PORT:-3000}"]
