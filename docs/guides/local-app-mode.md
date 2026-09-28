# Local-app mode (weblab.build promotes the Mac app)

**Added:** 2026-09-28. **Owner:** Ludvig.

weblab.build can run in one of two modes. One build-time env var picks the mode.
Nothing is deleted in either mode, so switching back restores the full cloud app.

| Mode | `NEXT_PUBLIC_SITE_MODE` | What visitors get |
| --- | --- | --- |
| Cloud (default) | unset or `cloud` | The full hosted Weblab web app: sign-up, projects, pricing, cloud editor, publish. |
| Local | `local` | A marketing site that only sends people to download the Mac app (`weblab-local`). Sign-up is closed. Sign-in is invite only. |

Why: the new Mac app (`~/Programming/personal/AB/weblab-local`, GitHub
`Ludvig-Hedin/airship`, product name "Weblab") has no login and runs fully on
the user's Mac. For now it is shared with friends only. The cloud app is paused,
not removed.

## Turn it on or off

All three are Railway service variables on the web app. `NEXT_PUBLIC_*` values
are baked in at build time (Docker `ARG`), so every change needs a redeploy.
Railway redeploys on its own when a variable changes.

| Variable | Where | Value in local mode | Default |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_MODE` | Railway (build arg) | `local` | `cloud` |
| `NEXT_PUBLIC_LOCAL_APP_DOWNLOAD_URL` | Railway (build arg), optional | direct `.dmg` URL | `https://github.com/Ludvig-Hedin/airship/releases/latest/download/Weblab-mac-arm64.dmg` |
| `WEBLAB_SIGN_IN_ALLOWLIST` | Railway (runtime) | comma-separated emails | `ludvighedin15@gmail.com` |
| `WEBLAB_SIGN_IN_ALLOWLIST` | Convex prod env (`npx convex env set`) | same emails | unset = no restriction |

To go back to the cloud app:

1. Remove `NEXT_PUBLIC_SITE_MODE` on Railway (or set it to `cloud`). Railway redeploys.
2. Remove `WEBLAB_SIGN_IN_ALLOWLIST` from the Convex prod env.
3. In the Clerk dashboard (prod), set sign-up mode back to **Public** and turn
   off the allowlist (Configure → Restrictions).

To invite someone to the web app: add their email to both allowlists, and to
the Clerk allowlist if sign-ups must work for them.

## What changes in local mode

Everything below is gated on `IS_LOCAL_APP_MODE` from
`apps/web/client/src/lib/site-mode.ts`. Grep for it to find every switch.

**Hidden or swapped**

- Hero: the prompt box and the Get started / Projects buttons are hidden. A
  centered title, one line of copy and a **Download for Mac** button replace
  them (`hero/local-app-hero-intro.tsx`). The editor mockup below stays.
- Top bar: no Sign in. The Download button links straight to the `.dmg`. The
  owner still sees Projects + avatar when signed in.
- Mobile menu, CTA section, "What can Weblab do" CTA: Get started becomes
  Download for Mac.
- "What can Weblab do": the CMS card is hidden.
- Feature trio terminal: the `weblab deploy --prod` / "Live at weblab.build" run is hidden.
- Editor mockup: Publish button, member avatars and live collaborator cursors are hidden.
- Landing FAQ: swapped for a local-app FAQ (`localApp.faq` in `messages/en.json`).
  No collaboration, hosting or pricing answers. The "read more" link is hidden.
- Footer: Pricing, My Projects and Compare are hidden. Download links to the `.dmg`.
- `/download`: one Apple Silicon Mac button. No Windows, Linux or Intel.
- Search metadata: site title, description, `/download` metadata and the
  SoftwareApplication JSON-LD describe the free Mac app (`seo.rootLocalApp`,
  `seo.downloadLocalApp`).
- Mobile menu: the Product group is hidden (its pages redirect home).
- `/api/download/mac` redirects to the local `.dmg`. Other platforms return 404.
- Redirected home (`next.config.ts`): `/pricing`, `/faq` (to `/#faq`),
  `/features/*`, `/workflows/*`, `/website-builder`, `/visual-site-builder`,
  `/ai-website-builder`, `/compare/*`, `/see-a-demo`.

**Kept as is:** design, open source, free, canvas, visual editing, code,
history, blog, docs, changelog, about, legal pages.

## Sign-up and sign-in block

Three layers, from strongest to friendliest:

1. **Clerk (prod dashboard):** sign-up mode **Restricted**, plus the allowlist
   with the owner email. Clerk then refuses to create any new account, even
   through direct Clerk URLs or OAuth. This does not block existing accounts
   from signing in to Clerk.
2. **Convex:** `convex/lib/permissions.ts` checks `WEBLAB_SIGN_IN_ALLOWLIST`
   (Convex env) in `getOptionalUser` and `requireUserJIT`. An account not on
   the list gets `UNAUTHORIZED` from every function that uses these helpers,
   including AI usage checks, and no new user row is created for it. A few
   functions read `ctx.auth.getUserIdentity()` directly and are not covered.
   Unset = no effect.
3. **Next.js:** `getCurrentUser()` returns `null` for emails not on the list,
   so protected pages send them to `/sign-in`. There, a signed-in but blocked
   account sees an invite-only panel with Download and Sign out. The email code
   form refuses to create new accounts, and the Google / GitHub / Vercel
   buttons are hidden (OAuth could create accounts). The owner signs in with
   an email code. The top bar shows Projects + avatar only for an allowlisted
   account.

Helpers: `convex/lib/signInAllowlist.ts` (tested in `signInAllowlist.test.ts`).

## Shipping a new Mac build

The download URL points at the **latest** release of `Ludvig-Hedin/airship`
with a fixed asset name, so a new build needs no site change:

```bash
cd ~/Programming/personal/AB/weblab-local/apps/desktop
pnpm build:mac          # signs; notarizes when Apple credentials are set
xcrun notarytool submit dist/Weblab-<version>-arm64.dmg --keychain-profile weblab --wait
xcrun stapler staple dist/Weblab-<version>-arm64.dmg
cp dist/Weblab-<version>-arm64.dmg /tmp/Weblab-mac-arm64.dmg
gh release create weblab-local-v<version> /tmp/Weblab-mac-arm64.dmg \
  -R Ludvig-Hedin/airship --title "Weblab for Mac <version>" --latest
```

The keychain profile `weblab` is created once with
`xcrun notarytool store-credentials weblab --key <AuthKey.p8> --key-id <id> --issuer <issuer>`.

## Later (not done yet)

- Move `weblab-local` into this repo as `apps/desktop-local` and make it the
  desktop app. Mark the current `apps/desktop` as paused. Then point the site's
  GitHub links and releases at this repo. See backlog entry 178.
