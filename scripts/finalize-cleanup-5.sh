#!/usr/bin/env bash
# Fifth pass: delete the entire @/trpc/* stub directory now that all
# consumers have been ported to Convex.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf apps/web/client/src/trpc
echo "[finalize-5] done"
