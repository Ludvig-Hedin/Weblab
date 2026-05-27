# BACKLOG

Living list of known bugs, follow-ups, and deferred TODOs that did not block the
work that surfaced them. Every entry is something an agent or human can pick up
later without re-discovering the context.

## Protocol — read this before editing

- **Both [CLAUDE.md](CLAUDE.md) and [AGENTS.md](AGENTS.md) point here.** Any
  agent (Claude Code, Codex, Gemini, etc.) starting work in this repo should
  skim this file once and decide whether anything listed below intersects the
  task at hand. If it does, fix it as part of the work instead of duplicating
  the entry.
- **Always log it here when you defer a bug or TODO.** If you discover a real
  defect, latent issue, or follow-up that you cannot fix in the current
  change, append an entry below (or update an existing one) — do not leave it
  buried in a chat transcript, code comment, or PR description.
- Entries are organized newest first under **Open**. Move closed items to
  **Resolved** with the resolution date and PR/commit if known.
- Each entry should be self-contained: location (file:line), what's wrong,
  why it matters, a concrete next step.

### Entry template

```markdown
### <short-noun-phrase title>

- **Discovered:** YYYY-MM-DD (session/source if relevant)
- **Where:** path:line (or feature ID like F-131)
- **Symptom:** what the user / dev / test sees
- **Root cause:** if known
- **Next step:** what to do — usually a one-line fix sketch
- **Risk if ignored:** what stays broken
- **Tags:** `#bug` / `#test-gap` / `#tech-debt` / `#docs` / `#flake` / `#infra`
```

---

## Open

### F-330..F-335 — Bottom-bar unguarded null/undefined access risks runtime crash

- **Discovered:** 2026-05-28 (validate-feature F-300..F-361 + F-420..F-439 run)
- **Where:**
  - [apps/web/client/src/app/project/[id]/_components/bottom-bar/terminal-area.tsx:55](apps/web/client/src/app/project/[id]/_components/bottom-bar/terminal-area.tsx#L55) — `branches.activeBranch.id` accessed inside try/catch (caught) but only by accident.
  - [apps/web/client/src/app/project/[id]/_components/bottom-bar/terminal-area.tsx:83](apps/web/client/src/app/project/[id]/_components/bottom-bar/terminal-area.tsx#L83) — `sandbox.session.activeTerminalSessionId =` assigns into possibly-undefined `.session`; only `sandbox` itself is null-checked.
  - [apps/web/client/src/app/project/[id]/_components/bottom-bar/restart-sandbox-button.tsx:178](apps/web/client/src/app/project/[id]/_components/bottom-bar/restart-sandbox-button.tsx#L178) — `activeBranch.sandbox.id` dereferences a sub-field that may be undefined depending on Branch shape.
- **Symptom:** if a branch is mid-init (no session yet) or has no `sandbox` sub-record, the terminal-switch / restart paths throw `Cannot read properties of undefined`.
- **Root cause:** missing optional-chain / explicit guards on intermediate fields.
- **Next step:** add `if (!sandbox?.session) return;` guards before writes, and `?.` on `activeBranch.sandbox?.id`. Verify Branch.sandbox type in [@weblab/models](packages/models) before deciding which is nullable.
- **Risk if ignored:** terminal cycle hotkey and Restart Sandbox button can crash the editor during sandbox cold-boot.
- **Tags:** `#bug` `#editor`

### F-422 — Account-tab accepts unvalidated first/last name input

- **Discovered:** 2026-05-28 (validate-feature F-420..F-439 run)
- **Where:** [apps/web/client/src/components/ui/settings-modal/account-tab.tsx:48-57](apps/web/client/src/components/ui/settings-modal/account-tab.tsx#L48-L57)
- **Symptom:** any length / character sequence accepted; no trim, no max length, no script-tag stripping before save.
- **Next step:** zod-validate `firstName`/`lastName` (1..64 chars, trimmed) on submit; toast on invalid; mirror Convex `users.update` validator.
- **Tags:** `#flag` `#validation`

### F-424 — Appearance-tab still leaves DOM out of sync on save failure

- **Discovered:** 2026-05-28 (validate-feature F-420..F-439 run)
- **Where:** [apps/web/client/src/components/ui/settings-modal/appearance-tab.tsx:85-103](apps/web/client/src/components/ui/settings-modal/appearance-tab.tsx#L85-L103)
- **Symptom:** optimistic `data-accent` / `data-density` / `data-font-size` mutations are not reverted on `updateSettingsMutation` failure. User now sees a toast (fix applied), but visually the change "stuck" until reload.
- **Next step:** snapshot prior attr values before mutation, restore in `catch`.
- **Tags:** `#flag` `#ux`

### F-427 — GitHub-tab silently clears repo list on fetch failure (no toast / retry)

- **Discovered:** 2026-05-28 (validate-feature F-420..F-439 run)
- **Where:** [apps/web/client/src/components/ui/settings-modal/github-tab.tsx:83-87](apps/web/client/src/components/ui/settings-modal/github-tab.tsx#L83-L87)
- **Symptom:** on `getOrgs` / `getReposWithApp` rejection, `orgs` and `repos` are set to `[]` with no user feedback — looks identical to "GitHub App has no repos".
- **Next step:** preserve error, show inline retry surface (similar to installation-check retry at line 168-180).
- **Tags:** `#flag` `#integration` `#ux`

### F-431 — Subscription-tab uses unsafe `(response as { url?: string })` cast

- **Discovered:** 2026-05-28 (validate-feature F-420..F-439 run)
- **Where:** [apps/web/client/src/components/ui/settings-modal/subscription-tab.tsx:40](apps/web/client/src/components/ui/settings-modal/subscription-tab.tsx#L40)
- **Symptom:** Convex action result is cast without runtime check; if shape ever changes, redirect will navigate to `undefined`.
- **Next step:** validate shape with `if (!result?.url) throw new Error(...)` before redirect.
- **Tags:** `#flag` `#billing`

### F-435 — Account deletion UI calls a not-yet-implemented Convex mutation (always toasts "unavailable")

- **Discovered:** 2026-05-28 (validate-feature F-420..F-439 run)
- **Where:** [apps/web/client/src/components/ui/settings-modal/user-delete-section.tsx:45-56](apps/web/client/src/components/ui/settings-modal/user-delete-section.tsx#L45-L56)
- **Symptom:** the destructive flow ends with `toast.error('Account deletion is temporarily unavailable...')`. UI implies deletion succeeded after the second-confirm step, but nothing happens.
- **Next step:** either gate the Delete button behind a "coming soon" disabled state OR ship the `users.delete` Convex mutation (server-side cleanup of projects, conversations, storage, subscriptions). The `// TODO(convex):` comment already flags this in code.
- **Risk if ignored:** users will repeatedly try, file support tickets, and assume their data is being deleted when it isn't.
- **Tags:** `#bug` `#user-trust`

### F-427 — `disconnectGitHub` button shows confirm dialog then no-ops

- **Discovered:** 2026-05-28 (validate-feature F-420..F-439 run)
- **Where:** [apps/web/client/src/components/ui/settings-modal/github-tab.tsx:123-133](apps/web/client/src/components/ui/settings-modal/github-tab.tsx#L123-L133)
- **Symptom:** Disconnect → Confirm → toast "Disconnect is temporarily unavailable". User cannot actually revoke connection from the app.
- **Next step:** implement `users.disconnectGitHub` Convex mutation that revokes the GitHub App installation and clears `providerConnections` row; until then disable the button instead of pretending it works.
- **Tags:** `#bug` `#integration`

### F-491 — Stripe webhook accepts only one `v1=` signature; rotation will reject valid requests

- **Discovered:** 2026-05-28 (validate-feature F-490..F-501 run)
- **Where:** [apps/web/client/convex/http.ts:112-117](apps/web/client/convex/http.ts#L112-L117) — `verifyStripeSignature`
- **Symptom:** during a Stripe webhook signing-secret rotation Stripe sends
  `Stripe-Signature: t=…,v1=oldSig,v1=newSig`. The current parser builds
  `Object.fromEntries(...)` so only the LAST `v1` survives. If our held
  secret signs the FIRST entry, verification fails and Stripe retries until
  rotation finishes.
- **Root cause:** `Object.fromEntries` collapses duplicate keys.
- **Next step:** split header → keep an array of `v1` values; HMAC the
  payload once → return true if any candidate matches via constant-time
  compare. Add a test that feeds two `v1=` entries.
- **Risk if ignored:** ~5-minute window of dropped events on every rotation,
  silent until alerted by Stripe dashboard.
- **Tags:** `#bug` `#billing` `#webhook`

### F-491 — Stripe webhook lacks `evt.id` idempotency; replays grant duplicate credits

- **Discovered:** 2026-05-28 (validate-feature F-490..F-501 run)
- **Where:** [apps/web/client/convex/http.ts:235-270](apps/web/client/convex/http.ts#L235-L270) +
  [apps/web/client/convex/lib/stripeWebhook.ts:220-401](apps/web/client/convex/lib/stripeWebhook.ts#L220-L401)
- **Symptom:** `customer.subscription.updated` pro-rated upgrade branch
  (`stripeWebhook.ts:268`) and renewal branch (`handleSubscriptionRenewed`,
  `stripeWebhook.ts:379`) both `ctx.db.insert('rateLimits', …)`. Stripe
  retries 5xx for up to 3 days and can double-deliver even on 2xx
  (documented behavior). Each replay inserts another full-quota rateLimits
  row → user receives N× credits.
- **Root cause:** no event-id dedupe at the webhook entry point.
  `_handleSubCreated` is idempotent (item-id upsert) but the `Updated`
  paths are not.
- **Next step:** introduce a `stripeEventLog` table indexed by
  `stripeEventId` (= `evt.id` from raw payload). In the webhook handler,
  attempt an insert before dispatch; on uniqueness conflict, return 200
  early.
- **Risk if ignored:** duplicate credits granted on every Stripe retry,
  inflated `rateLimits.left` for affected users, silent revenue leak.
- **Tags:** `#bug` `#billing` `#webhook` `#idempotency`

### F-492 — catalog row claims GitHub webhook but no HTTP handler exists

- **Discovered:** 2026-05-28 (validate-feature F-490..F-501 run)
- **Where:** [docs/feature-catalog.md:531](docs/feature-catalog.md#L531) +
  [docs/test-plan.md:383](docs/test-plan.md#L383) (T-492) vs
  [apps/web/client/convex/http.ts](apps/web/client/convex/http.ts) (only
  `/clerk-webhook` and `/webhooks/stripe` exist) and
  [apps/web/client/convex/githubActions.ts](apps/web/client/convex/githubActions.ts)
  (OAuth + installation callback + PR create actions only).
- **Symptom:** F-492 is unreachable. T-492 ("Replay GitHub event → Convex
  action invoked") cannot execute — no `/github-webhook` route is mounted
  anywhere in the repo.
- **Root cause:** either (a) GitHub webhook was never ported, or (b) the
  catalog row is mis-tagged and should describe the OAuth/installation
  actions, not a webhook.
- **Next step:** decide intent. If a webhook IS planned, scaffold a
  `/webhooks/github` httpAction that verifies the `X-Hub-Signature-256`
  HMAC and dispatches at minimum `installation.created` / `installation.deleted`.
  Otherwise rewrite the catalog row + T-492 to describe the existing
  OAuth/install/PR actions and drop the `#webhook` tag.
- **Risk if ignored:** misleading inventory — agents and humans assume
  GitHub event sync exists when it doesn't.
- **Tags:** `#docs` `#bug` `#integration`

### F-500 — tRPC `sandbox` router is a hello-world stub; no production caller

- **Discovered:** 2026-05-28 (validate-feature F-490..F-501 run)
- **Where:** [apps/web/server/src/router/routes/sandbox.ts](apps/web/server/src/router/routes/sandbox.ts) +
  mount [apps/web/server/src/router/index.ts:6](apps/web/server/src/router/index.ts#L6)
- **Symptom:** `create`, `start`, `stop`, `status` return `"hi <input>"`
  or canned objects. Every `sandbox.*` reference in
  `apps/web/client/**/sandbox/**` targets `api.sandbox.*` (Convex
  namespace, not yet ported — search `TODO(sandbox-port)`). The Fastify
  tRPC sandbox router is mounted but not called from any production code
  path.
- **Root cause:** placeholder left after the CodeSandbox → Vercel +
  Convex migration; never wired to a real lifecycle.
- **Next step:** either delete the router (and the F-500 catalog row), or
  ship a real implementation that calls the Vercel Sandbox provider in
  [packages/code-provider](packages/code-provider/src/providers/vercel-sandbox/index.ts).
- **Risk if ignored:** dead code in the tRPC surface; agents wire new
  features to a stub thinking it works; bloats `AppRouter` type.
- **Tags:** `#tech-debt` `#sandbox`

### F-131 — invalid project ID maps to "unknown" variant instead of "invalid-id"

- **Discovered:** 2026-05-26 (validate-feature F-120..F-135 run)
- **Where:** [apps/web/client/src/app/project/[id]/page.tsx:113-148](apps/web/client/src/app/project/[id]/page.tsx#L113-L148)
- **Symptom:** signed-in user visits `/project/abc` (any string that is not a
  valid Convex `Id<"projects">`); server logs
  `ArgumentValidationError: Value does not match validator. Path: .projectId`
  and the page renders `OfflineEditorBootstrap` with
  `fallbackVariant="unknown"`. T-128 in [docs/test-plan.md](docs/test-plan.md)
  expects a **variant-specific** error (`not-found`, `unauthorized`, or
  `invalid`).
- **Root cause:** catch block at lines 132-140 maps via substring match on
  `forbidden|unauth|session|not found|not_found`. The Convex
  `ArgumentValidationError` message matches none of those. The dedicated
  `invalid-id` branch at line 75 only fires for the literal string
  `projectId === 'undefined'`.
- **Next step:** add a branch matching
  `/does not match validator|argumentvalidationerror|invalid id/i` →
  `'invalid'`. Confirm `ProjectLoadError`'s variant set includes `'invalid'`
  (currently has `'unauthorized' | 'forbidden' | 'not-found' | 'unknown' |
  'invalid-id'` — pick the right name and keep it consistent).
- **Risk if ignored:** users hitting a malformed deep-link see a generic
  "something went wrong" instead of "that project ID is malformed", masking
  bad-link bugs in upstream callers.
- **Tags:** `#bug` `#auth-gated` `#editor`

### F-122 — unauth bounce sends user to `/w/new` instead of `/sign-in`

- **Discovered:** 2026-05-26 (validate-feature F-120..F-135 run)
- **Where:** [apps/web/client/src/app/projects/creating/page.tsx](apps/web/client/src/app/projects/creating/page.tsx) — middleware + `useAuthContext` interplay
- **Symptom:** unauthenticated user navigates to
  `/projects/creating?templateId=…` and lands on `/w/new` (workspace create
  page) instead of `/sign-in?returnUrl=%2Fprojects%2Fcreating…` like every
  sibling under `/projects/*`.
- **Root cause:** unclear. Either middleware exempts `/projects/creating`,
  or the client component's auth modal logic redirects via
  `localStorage`/`localforage` state before the sign-in redirect fires.
- **Next step:** repro with a fresh incognito profile (cleared cookies +
  localStorage). Compare middleware matcher against `/projects/creating`
  vs `/projects/new`. Fix divergence so all `/projects/*` routes share the
  same unauth path.
- **Risk if ignored:** confusing UX — magic-link / OAuth callbacks for the
  "create from template" flow land on the wrong landing page.
- **Tags:** `#bug` `#auth-gated` `#routing`

### Missing test-plan rows for F-126, F-130, F-132, F-133

- **Discovered:** 2026-05-26 (validate-feature F-120..F-135 run)
- **Where:** [docs/test-plan.md](docs/test-plan.md)
- **Symptom:** four features in the catalog have no `T-XXX` test row.
  - **F-126** `/projects/import` (import hub) — no nav/render test.
  - **F-130** `/project` (bare index) — no listing/redirect test.
  - **F-132** `/project/[id]/loading.tsx` — no skeleton test.
  - **F-133** `/project/[id]/error.tsx` — no error-boundary render test.
- **Next step:** add minimal `T-XXX` rows. For F-132 / F-133, write
  integration tests that force the loading / error state (throttle a query;
  render `error.tsx` with `new Error('boom')`).
- **Risk if ignored:** silent regressions in the loading skeleton and error
  fallback — both surface to users on slow networks and crashes.
- **Tags:** `#test-gap` `#docs`

### `bun test` does not auto-load `apps/web/client/.env.local`

- **Discovered:** 2026-05-26 (validate-feature F-120..F-135 run)
- **Where:** [apps/web/client/src/components/store/create/manager.test.ts](apps/web/client/src/components/store/create/manager.test.ts) and any test that transitively imports [apps/web/client/src/env.ts](apps/web/client/src/env.ts)
- **Symptom:** running `bun test src/components/store/create/manager.test.ts`
  from `apps/web/client/` fails with `Invalid environment variables: …
  OPENROUTER_API_KEY: expected string, received undefined` even though
  `.env.local` contains the key. Tests only pass after explicit
  `set -a; source .env.local; set +a`.
- **Root cause:** Bun loads `.env.local` from CWD, but tooling expectation
  (per Bun docs) doesn't align here — likely because the test file imports a
  module that reads `process.env` at module-load time before Bun's loader
  sequence applies.
- **Next step:** either (a) add a `bunfig.toml` `[test]` preload that sources
  the env, or (b) add a `tests/setup.ts` that calls `dotenv.config({ path:
  '.env.local' })` and wire it via `bun test --preload`. Document in
  [CLAUDE.md](CLAUDE.md) test section.
- **Risk if ignored:** every new contributor and every fresh CI shell hits
  the same false-failure; signal-to-noise on local test runs degrades.
- **Tags:** `#infra` `#dev-loop`

### Lint warnings inside F-120..F-135 scope (0 errors, 7 warnings)

- **Discovered:** 2026-05-26 (validate-feature F-120..F-135 run)
- **Where:**
  - [apps/web/client/src/components/store/create/manager.ts:34](apps/web/client/src/components/store/create/manager.ts#L34) — `readActiveWorkspaceId` defined but unused.
  - [apps/web/client/src/app/projects/import/local/page.tsx:8](apps/web/client/src/app/projects/import/local/page.tsx#L8) — `Icons` imported but unused.
  - [apps/web/client/src/app/projects/import/local/_context/index.tsx](apps/web/client/src/app/projects/import/local/_context/index.tsx) — 1 `react-hooks/exhaustive-deps` (`validateProject`), 1 unused `startOrphanSandbox`, 3 `@typescript-eslint/no-explicit-any` at lines 303, 435, 441.
  - [apps/web/client/src/app/projects/layout.tsx:19](apps/web/client/src/app/projects/layout.tsx#L19) — `||` should be `??` per `prefer-nullish-coalescing`.
- **Next step:** delete unused symbols, tighten the three `any`s, and fix the
  `??` swap. The exhaustive-deps warning needs a real look — adding the dep
  may trigger a re-validation loop, so verify before changing.
- **Risk if ignored:** `bun lint --max-warnings 0` (CI gate) will keep
  failing on any touch to these files.
- **Tags:** `#tech-debt` `#lint`

### Node 22 stream compat noise in Convex client logs

- **Discovered:** 2026-05-26 (validate-feature F-120..F-135 run)
- **Where:** server logs during any failed `fetchQuery` call from the editor route.
- **Symptom:** `TypeError: controller[kState].transformAlgorithm is not a
  function` appears in stderr next to legitimate request errors. Originates
  inside the Convex client's `Response` body handling on Node ≥ 22.
- **Root cause:** undici / Node-internal stream API drift; not in our code.
- **Next step:** bump `convex` SDK once upstream ships the fix, or pin Node
  to 20.x in `engines` and Railway/Vercel runtime config if the noise gets
  worse. Track upstream issue.
- **Risk if ignored:** log noise only — does not block requests. Becomes a
  real problem if real errors get hidden behind the spam.
- **Tags:** `#tech-debt` `#infra` `#noise`

---

## Resolved

_None yet — move closed entries here with the resolution date and PR/commit._
