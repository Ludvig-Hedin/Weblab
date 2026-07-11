# GitHub connect — Convex env required per deployment + single Setup-URL caveat

- **Discovered:** 2026-05-29 (debugging "Failed to generate GitHub installation URL").
- **Root cause (fixed):** `githubActions.*` run in the Convex Node runtime and read `GITHUB_APP_ID`/`GITHUB_APP_SLUG`/`GITHUB_APP_PRIVATE_KEY`/`GITHUB_INSTALL_STATE_SECRET` from the **Convex** env store (separate from Next.js `.env.local`). Both deployments were missing all four → `generateInstallationUrlAction` threw. Set on dev `avid-gnat-539` and prod `rapid-crab-113` via [scripts/set-convex-github-env.mjs](apps/web/client/scripts/set-convex-github-env.mjs).
- **Open caveat:** the single GitHub App (id `3588674`) has one post-install Setup URL. It can only point at one host, so the install callback (`/callback/github/install` → `handleInstallationCallbackUrl`) lands on one deployment. **Local-dev connect won't complete** unless the Setup URL targets localhost; prod (weblab.build) is the supported target. A separate dev GitHub App would be needed for local end-to-end testing.
- **Next step:** confirm the GitHub App Setup URL = `https://weblab.build/callback/github/install`; optionally register a second dev App for localhost. New deployments must run the provisioner (or set the 4 env vars) before GitHub connect works.
- **Tags:** `#integration` `#config` `#convex`
