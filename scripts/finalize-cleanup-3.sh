#!/usr/bin/env bash
# Third pass: remove auth-form / auth-modal / login-button — Supabase OTP
# UI bits replaced by Clerk's hosted /sign-in.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -f apps/web/client/src/app/_components/auth-form.tsx
rm -f apps/web/client/src/app/_components/auth-modal.tsx
rm -f apps/web/client/src/app/_components/login-button.tsx
echo "[finalize-3] done"
