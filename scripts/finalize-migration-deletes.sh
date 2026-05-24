#!/usr/bin/env bash
# Final cleanup deletes for the Supabase → Convex + Clerk migration.
# Run from the repo root: `bash scripts/finalize-migration-deletes.sh`
#
# What gets removed:
#   - tRPC infrastructure (server + client + Next.js route handler)
#   - Legacy webhook routes (Clerk + Stripe — replaced by convex/http.ts)
#   - Supabase utility modules (server, middleware, admin, request-server)
#   - Legacy login subtree (Supabase OTP flow — replaced by /sign-in)
#   - Legacy OAuth callback (replaced by /sign-in/sso-callback)
#   - Stale parallel middleware entry (proxy.ts)
#   - Drizzle workspace (packages/db)
#   - Supabase CLI wrapper + 43 migration files (apps/backend/supabase)
#
# Note: the project owner approved these deletes during the migration. Re-read
# the diff before running if you want to double-check.

set -euo pipefail

cd "$(dirname "$0")/.."

echo "[finalize] removing tRPC infrastructure..."
rm -rf apps/web/client/src/server/api/
rm -rf apps/web/client/src/trpc/
rm -rf apps/web/client/src/app/api/trpc/

echo "[finalize] removing legacy webhook routes..."
rm -rf apps/web/client/src/app/api/clerk/
rm -rf apps/web/client/src/app/webhook/

echo "[finalize] removing legacy OAuth callback..."
rm -rf apps/web/client/src/app/auth/callback/

echo "[finalize] removing Supabase utility modules..."
rm -f apps/web/client/src/utils/supabase/server.ts
rm -f apps/web/client/src/utils/supabase/middleware.ts
rm -f apps/web/client/src/utils/supabase/admin.ts
rm -f apps/web/client/src/utils/supabase/request-server.ts
rm -f apps/web/client/src/proxy.ts

echo "[finalize] removing legacy login subtree..."
rm -rf apps/web/client/src/app/login/

echo "[finalize] removing Drizzle workspace..."
rm -rf packages/db/

echo "[finalize] removing Supabase CLI + migrations..."
rm -rf apps/backend/supabase/

echo "[finalize] done. Now run:"
echo "    bun install            # refresh lockfile after package.json edits"
echo "    bun typecheck          # confirm no broken imports"
echo "    bun lint               # confirm style"
echo "    bun build              # confirm prod build"
