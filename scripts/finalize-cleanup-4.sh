#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf apps/web/client/src/utils/supabase
rm -f apps/web/client/src/middleware.ts.bak 2>/dev/null || true
echo "[finalize-4] done"
