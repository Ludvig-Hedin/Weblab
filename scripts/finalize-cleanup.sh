#!/usr/bin/env bash
# Second-pass cleanup. Removes files the first pass missed plus the auth
# helper that no longer routes anywhere.

set -euo pipefail
cd "$(dirname "$0")/.."

echo "[finalize-2] removing login subtree..."
rm -rf apps/web/client/src/app/login

echo "[finalize-2] removing legacy auth-context (Supabase login bridge)..."
rm -f apps/web/client/src/app/auth/auth-context.tsx

echo "[finalize-2] removing legacy Supabase OAuth provider callback..."
rm -rf apps/web/client/src/app/api/auth/providers

echo "[finalize-2] done."
