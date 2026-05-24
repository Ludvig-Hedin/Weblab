#!/usr/bin/env bash
# One-shot setup for the Convex secrets the migration introduced. Run this
# from the repo root after pulling the migration commit:
#
#     bash scripts/setup-deploy-secrets.sh
#
# Generates 3 random 32-byte secrets and pipes them into the active Convex
# deployment (controlled by CONVEX_DEPLOYMENT in apps/web/client/.env.local).
# Stripe webhook secret is NOT generated — you must paste it after creating
# the Stripe Dashboard endpoint.

set -euo pipefail
cd "$(dirname "$0")/../apps/web/client"

echo "[setup] Generating + setting Convex deployment secrets..."
bunx convex env set GITHUB_INSTALL_STATE_SECRET "$(openssl rand -hex 32)"
bunx convex env set PROVIDER_TOKEN_ENCRYPTION_KEY "$(openssl rand -base64 32)"
bunx convex env set CMS_SOURCE_ENCRYPTION_KEY "$(openssl rand -base64 32)"

echo
echo "[setup] Secrets set. Remaining manual steps:"
echo "  1. Get Stripe webhook secret from https://dashboard.stripe.com/webhooks"
echo "     bunx convex env set STRIPE_WEBHOOK_SECRET <whsec_...>"
echo
echo "  2. Update Clerk dashboard webhook endpoint URL:"
echo "     https://avid-gnat-539.convex.site/clerk-webhook"
echo
echo "  3. Update Stripe dashboard webhook endpoint URL:"
echo "     https://avid-gnat-539.convex.site/webhooks/stripe"
echo
echo "  4. Update OAuth provider callback URIs to /sign-in/sso-callback"
echo "     (GitHub OAuth App, Google OAuth Client, Vercel OAuth App)"
echo
echo "  See docs/deploy-checklist.md for full details."
