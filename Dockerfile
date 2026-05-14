# Build Weblab web client
FROM oven/bun:1

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

ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}

# Skip server-env Zod validation during build; server-only vars are read at
# runtime from process.env. See apps/web/client/src/env.ts.
ENV SKIP_ENV_VALIDATION=true

# Native toolchain for node-gyp deps (e.g. better-sqlite3 via mem0ai peer).
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-setuptools make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY . .

RUN bun install --frozen-lockfile \
    && cd apps/web/client \
    && bun run build

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD bun -e "fetch('http://localhost:3000').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["sh", "-lc", "cd apps/web/client && bun run start -- -H 0.0.0.0 -p ${PORT:-3000}"]
