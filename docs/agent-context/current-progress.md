## 2026-10-27 — Owner-approved source integration with checks pending

Ludvig explicitly approved PR #25 with final tests, types and lint pending after source review. This is a narrow merge exception, not validation or deployment approval. The application/package source remains the reviewed77c63481b snapshot; later changes are whitespace/documentation only. Final retained/backend checks, web/filesystem/preload types with normal translation declarations and54-file lint remain required before release.

Railway was read back before integration: Source has no automatic-deploy branch connected; Sandbox and docs automatic GitHub deploys were disabled to preserve source-only integration. Current successful production deployments were observed at e1ce64f1e for all three services. No deployment was started by this task. GitHub Actions remains disabled; cloud rollout/provider operations remain held. The old standalone `weblab-local` source outside `coder-new` was proved an exact imported tree at main ancestor ac0d5edfa and retired after idle checks; original Git history/local metadata remain in the private recovery receipt. All three registered main-repository worktrees remain held for shared history, canonical integration and unfinished verification.

## 2026-10-26 — Merge review complete; local verification resource-blocked

Fetched remote main `e1ce64f1e` and fast-forwarded local main. PR #25 remains the active current-main integration; archive source is preserved in PRs #18–22/#26. Seven specialist source reviews plus an adversarial integration review found no confirmed defect; three donor audits found no missing approved application/package implementation. Two extra EOF blank-line issues in tests were removed without executable changes. Required checks remain incomplete: dependency restore refused at17% reclaimable RAM, focused checks refused at18% against the unchanged20% floor, and the latest disk observation was~1.7GB. No application merge or deployment. Primary integration owner retries from [the durable check continuation](development-setup.md#next-release-merge-checks); the old temporary check manifests no longer exist. Preserve exact archive refs, current worktree state, private-engine exclusions and disabled rollout/provider gates.

## 2026-10-22 — Saved-source recovery complete; final checks in progress

Final inventory found no additional current application/package implementation gap from archive PRs #18–22. Superseded backend/desktop/HTML implementations and the excluded private customer engine remain archived. PR #25 includes checkpoints `da674a2bc` and `75a13c394`; later retained-version/publication/removal source is locally complete, reviewed and undergoing focused checks. The70-path controls/Studio/property/general snapshot has zero lint errors (4,380 warnings); parser types pass. Final frontend session/preparation/publication/removal57 cases and provider/credential/lifecycle198 cases pass. Retained backend fixtures are being aligned with current preparation epochs and permission boundaries; no guards were relaxed. Final web/filesystem/preload types and remaining lint are pending the installed shared scheduler. No next-release deploy or activation. Production and the public Mac download remain the original main `d124aea1e`.

## 2026-10-22 — Image controls, Studio, properties and retained-source continuation

PR #25 remains draft; no next-release source is deployed. Image/history and Studio integration passed focused reruns after preserving immutable Redo pins and current gate expectations. Approved-property backend36 and frontend30 cases pass, including live DOM reuse refusal before dispatch. Parser/text ownership, subscription disposal and strict stylesheet inventory passed52 cases. Legacy image/recovery14 cases pass with actor-bound access fixtures. Frozen snapshots, free candidate preparation and protected builds/private review are integrated locally and under focused verification; retained-version removal and public publication recovery continue. Combined types and final scoped lint remain pending. Earlier59-path scoped lint passed with zero errors (7,996 warnings); that does not validate newer additions. Keep rollout gates and automatic source deployments off. Actual provider/customer/package acceptance remains unproven.

## 2026-10-22 — CSS, public preview settings and imported-image checkpoint

PR #24 is merged as next-release source at `e1ce64f1e`; production remains pinned to `d124aea1e`. The next independent snapshot recovers bounded CSS Modules Apply/Undo/Redo, public Sanity preview settings beside Preview Keys, native JSX read-dependency admission, and gated imported-image backend/HTTP/source transport. Fresh source reviews are clear after repairs. Local batches pass: CSS71, native settings/dependencies14, provider22, image backend71, image/source/recovery141, text compatibility30 and actual atomic image filesystem25. These batches overlap. The web typecheck was twice terminated by the installed RAM guard at17% reclaimable RAM; no passed type result is claimed for this snapshot. Scoped lint is awaiting the shared scheduler. Keep this snapshot draft until those checks pass. Images still have no recovered canvas controls in this checkpoint. Studio and retained-version recovery continue separately. No deployment, gate activation or provider write is authorized by this source checkpoint.

## 2026-10-22 — Next-release imported text recovery

Owner explicitly included the paused team web editor in remaining recovery. The public Mac release remains pinned to `d124aea1e`; do not deploy these next-release merges. PR #23 restored source-location handling and inactive contract validators. Imported version-two text backend and source/history transport are being reconciled on `integration/next-release-2026-10-22`. Both rollout gates remain off. Keep newer main import/preparation protections, actor-bound recovery and legacy starter separation. Canvas wiring, images, retained releases and remaining team CSS Modules/Sanity slices are still pending. Local text/native/preparation batches and web/parser/filesystem types pass; preload types also pass. Seventy-file lint has zero errors and 3,579 warnings. No connected acceptance or backend deployment is claimed. CSS Modules, public preview settings and images are separate local continuations.

# Current Progress Snapshot

## 2026-10-22 — Main release and next-release integration

Next-release continuation is on `integration/next-release-2026-10-22` in `../weblab-main`, with exact source mirrored into the registered `../weblab-project-location-recovery` verification checkout. The owner explicitly included the paused team editor. Missing source-location controls/native binding guards and inactive v2 text/image contracts passed fresh source review, 64 focused cases, web types and scoped lint (zero errors; frontend11/native+contract4,935 warnings). Packaging-test and nullable-path type mismatches were corrected; the normal generator updated translation declarations. Native/visible acceptance remains open. Later text transport/history recovery is still in progress and must receive its own checks; see BACKLOG. No full suite was requested. The remaining cloud and team-editor donor work is still pending current-main recovery.

Owner chose main `d124aea1e` for the current release, then remaining work for the next release. This supersedes earlier open-PR-only/no-deploy instructions. [Mac 0.2.2](https://github.com/Ludvig-Hedin/Weblab/releases/tag/desktop-local-v0.2.2) is public, built from that exact desktop tree `f2eae47d18ce6b375d95e3f18643b74275451124`. Developer ID signature, Apple Accepted (`757606a0-0992-4849-bbaa-f82cf1222a9e`), stapling and Gatekeeper checks pass. The first-party download returns the 229,332,890-byte DMG, SHA-256 `48ecb2bfad867ba178a339c4e66f53fda38c6b3b4539a639c978f67e1e7ac018`. Clean-Mac installation and real provider publication remain unverified.

Railway production deployment `e963b242-0eb5-4c5a-bc90-6a561a3c6382` successfully deployed exactly `d124aea1e`. Railway reports `SUCCESS`; the public home and `/api/health` return HTTP 200 and the health body is `{"ok":true}`. Production remains local-app mode. Automatic GitHub-source deploys were disabled before next-release merges so those changes stay unreleased. GitHub Actions remains disabled. No Convex deployment, credential rotation, provider activation or customer-site write ran.

PRs #17 and #16 are merged for the next release; import activation remains disabled. Exact #16 head `dbed9ba52` also has independent local verification recorded in #17 (285 focused tests, web types and lint). Earlier formatter/connected/backend acceptance limits remain recorded. The current main checkout is `../weblab-main`. All local branch history and the original 720-file snapshot are now pushed, with draft archive PRs #18–22. Those are donor histories, not wholesale merge candidates: #18 predates and omits the current public Mac app, and #20–22 contain superseded implementations. Remaining recovery requires current-main slices and preservation of newer code.

## 2026-10-22 — Local editor synchronized for PR handoff

This checkout pulled remote main `d124aea1e` into the local editor branch. PR #17
also fixes the optional-AI test fixture after the folder dashboard merge. Desktop
lint, types and 2,418 tests pass; a separate unsigned review package builds. The
private client handoff preserves all 18 changed source files and four internal
notes. The recovery sibling paths below describe another machine; those folders
and historical recovery refs are absent here. Do not infer they were uploaded
from this Mac. The owner now requests open PRs only: no merges or deployment.
Fresh packaged acceptance also passed direct body typing, unsaved Reload refusal,
Keep editing, Discard, and clean reload with original text in both frame sizes.

## 2026-10-21 — Current-main recovery integration

PR #8 and recovery PRs #13–15 are merged; clean `../weblab-main` is synchronized to `d124aea1e`. Further recovered work is local on `integration/recovered-work-2026-10-21` in `../weblab-project-location-recovery`. Original dirty source and historical checkpoints remain preserved. The idle HTML donor was normally retired after all 4,935 source fingerprints matched and its exact original edits were archived in `35126f8d8` on retained `recovery/html-original-2026-10-21`.

The desktop recovery covers project-script key isolation, safe settings and HTML imports, selected GitHub Upload, failed-turn Undo and deployment-key rechecks. All five desktop recovery slices passed 227 focused source cases, four affected TypeScript projects and lint. Parser preparation and exact content-target helpers passed 65 focused cases, parser types and lint after formatting. These helpers do not yet complete the imported cloud flow.

GitHub Actions is disabled and verified on all 224 currently owned repositories. Verification is local through the installed guards. Public web access remains invited. No new web deployment or 0.2.2 installer has shipped from this integration. The primary recovery task retains its dependencies for checks and packaging; its completed temporary install cache was removed after an idle check.

## 2026-10-21 — Recovery checkpoints and folder integration continuation

Five local `recovery/cloud-01-*` through `recovery/cloud-05-*` branches preserve the overlapping historical cloud source stack. They are not independently mergeable current-main feature branches. The private `../weblab-recovery-2026-10-21/cloud-checkpoints/` guide, Git bundle and per-checkpoint manifests point to the full saved unfinished source. Keep the original dirty recovery checkout and archives.

The older team-release copy was fingerprint-verified, preserved in local archival commit `b3cbe8cc1` on retained `release/team-desktop`, and normally removed after activity checks and metadata archival. Its checkpoint is unvalidated and unpushed. Keep `weblab-html-dropdown`; all 21 dirty paths have unique later safety work.

PR #8 is being integrated with current main in `../weblab-project-location-recovery`. Content, release, GitHub and delayed-note source boundaries are reconciled and independently reviewed. The four prerequisite libraries, focused root/session/provider regressions, server regressions, server types and 32-file lint now pass locally. Independent source review found no unresolved integration blocker. No full suite, hosted CI, provider publication, browser or installer release ran. Installed Mac/restart/offline-volume proof remains open.

## 2026-10-21 — Local preservation and PR cleanup

The original local checkout is preserved on `recovery/local-work-2026-10-21`, including its 39 unpublished commits and unchanged unfinished files. Verified private local backups cover all five dirty checkouts/repositories. A separate `../weblab-main` checkout tracks remote main cleanly; do not reset the recovery checkout to it.

PR #12 is merged as source, with provider publishing, signing and clean-Mac acceptance still open. PRs #1 and #7 are closed as superseded; useful pilot CI and historical test guidance were recovered in `de0f33ced`. The idle Sanity release worktree was retired with its full branch retained. PR #2 is closed because the owner rejected remote runners. GitHub Actions is disabled on Weblab; local verification only now applies across projects. PR #8 has reconciled its folder guards with newer Content and release actions and passed local focused checks; installed Mac acceptance remains open in `BACKLOG.md`.

This cleanup reused recorded app validation and added independent source review; no fresh local app suite, dependency install or installer release ran. Backup preservation, clean-main synchronization, workflow syntax and the unchanged pilot source were checked.

## 2026-10-21 — Local desktop client editing draft

`feature/2026-10-21-local-client-editor` prepares the public Mac app in
`apps/desktop-local` for native text drafts and reviewed publishing. This is
a release candidate with direct page text input, native Save/Discard and local
Undo/Redo. The Content panel and shared font edits have local acceptance evidence;
provider write/promotion/restore, signing and clean-Mac acceptance remain open.
Continue from [local client editor](../features/local-client-editor.md). Client
source patches and private acceptance notes are kept in a separate private
handoff repository, not this public repo. No production site was changed.

## 2026-10-05 — Team desktop editor released for invited accounts

`apps/desktop` is active again as the team editor (0.2.7): an Electron shell around weblab.build with sign-in, private working copies of local Git projects, reviewed handoff, preview keys and a log file. weblab.build still runs in local-app mode, so the public download stays `apps/desktop-local` and sign-in stays invite only. Switching a live site from the app is disabled server-side. `desktop-v*` releases are never marked latest.

This repository is public. Customer-pinned code and internal readiness notes are gitignored and stay on the owner's machine: see the "stay local" entries in `.gitignore` and `apps/desktop/release/site-engine.js`. Open follow-ups are at the top of `BACKLOG.md`.

## 2026-09-29 — Weblab for Mac HTML sketches

The standalone `apps/desktop-local` editor now exposes JavaScript-created native select options through a Show/Hide control at the right of Style. Canvas pan/zoom transform writes are coalesced per animation frame. The desktop shell checks `desktop-local-v*` GitHub releases and offers a Mac DMG from its menu and top bar. Version 0.2.1 is the next planned Mac release; see `apps/desktop-local/apps/desktop/CHANGELOG.md` and `docs/guides/local-app-mode.md` for the release flow.

Last updated: 2026-07-09.

> **TL;DR for fresh sessions:** Weblab is on Clerk + Convex (not Supabase + tRPC) and
> Vercel Sandbox (not CodeSandbox). Read [`agents-onboarding.md`](./agents-onboarding.md) for the
> 5-minute "everything you need" digest before planning work.

## Product Direction

Weblab is an open-source visual-first AI code editor. Users describe an app
(or import one), and the editor renders the running site in an iframe canvas
with element-level visual editing, chat-driven code generation, branches,
checkpoints, comments, CMS bindings, animation interactions, publishing,
multi-workspace billing, and a desktop shell. Stack target: Next.js 15
(default), Vite/React, Remix, Astro, TanStack Start, plus static HTML.

The current web product ships:

- project creation from prompt, blank frameworks, templates,
  images, Figma, GitHub clone, or local folders, with **framework auto-detection**
  via `@weblab/framework`
- visual editing on an iframe canvas with code-backed style and structure
  edits, **per-frame responsive breakpoints**, and **Figma-style layout guides
  + canvas rulers**
- AI chat for project generation/edits via a **shared TipTap composer** with
  `@` mentions, `/` slash commands, structured context pills, image attachments,
  and a unified `useChat`/`useSummarizer` pipeline
- project branches, checkpoints, comments, members, domains, publishing,
  subscription/usage plumbing, **workspaces** (multi-tenant billing), and
  **project invitations**
- **CMS workspace** for binding canvas elements to external content sources
- **Brand token editor** (color groups, variable tokens, text styles)
- **Animation interactions system** with a timeline editor
- **Page settings drawer** with schema markup parser + access controls
- **Hosting adapters** for multi-provider publish (Vercel/Cloudflare-class)
  with a redesigned publish UI
- a public marketing/docs surface (`weblab.build`, `docs.weblab.build`)
- desktop shell v0.2.0 (drag fallback, crash recovery, vibrancy)

## Backend, Runtime, Auth — current cut

| Concern | Current | Replaces |
|---|---|---|
| Auth | **Clerk** (issuer `convex` JWT template wired in `auth.config.ts`) | Supabase Auth |
| DB / API | **Convex** (`apps/web/client/convex/*` — `query`/`mutation`/`action`) | Supabase + tRPC routers |
| File / sandbox runtime | **Vercel Sandbox** (`@weblab/code-provider/providers/vercel-sandbox`) | CodeSandbox SDK |
| Hosting | **Railway** (`weblab.build` + `docs.weblab.build`) | not Vercel |
| Vestigial tRPC | only `sandbox` + `components` routers in `apps/web/server/src/router/` — used by the editor → Fastify sandbox lifecycle | rest of routers gone |
| Webhooks | Convex HTTP actions in `convex/http.ts` (Clerk users, Stripe billing) | Next.js webhook routes |

**Disabled / blocked paths until snapshot-fork or follow-up fixes land:**

- `project.fork`, `branch.fork`, `publish` — throw clear errors, tracked as
  `TODO(sandbox-fork)` / `TODO(publish-vercel)`.
- Website clone from URL provisions a project, opens the editor, and auto-runs
  the seeded clone prompt after the 2026-06-05 chat state flush fix.
- Marketplace Startd template provisions and boots locally after the 2026-06-05
  legacy Next normalization to Next 12/React 17.
- GitHub import requires a connected GitHub account; Figma import requires a
  Figma URL + personal access token; local-folder import requires a native
  directory picker.

**Working create paths verified on localhost 2026-06-05:** prompt create,
blank Next.js, blank static HTML, clone-from-URL, and Startd marketplace
creation opened editor sandboxes with preview frames; clone-from-URL returned
`/api/chat` 200 and Startd preview returned HTTP 200 directly. Production E2E
requires a live deployment of these local fixes plus a production auth session;
see `docs/agent-context/prod-e2e-testing.md`.

**Production E2E update 2026-06-06:** local signed-in dashboard, blank Next.js
creation, editor mode switch, preview, clone dialog, marketplace, and GitHub
import gate were re-smoked. Production public pages rendered, but email OTP
auth exposed two issues: Railway Source had the production Clerk publishable key
while `CLERK_FRONTEND_API_URL` still pointed at the dev Clerk frontend, and the
verify page navigated immediately after `setActive()` instead of waiting for
Clerk's signed-in state. Railway variables were corrected and Source redeploy
was triggered; verify page now waits for `useUser().isSignedIn` before routing
and retries new-user completion when Clerk only requires name/username fields
after email verification. Production Clerk also requires a password for new
email-code sign-ups, so the verify step now exposes a password continuation
instead of sending users back through sign-in.

**Local/prod QA update 2026-06-07:** localhost public routes, sign-in,
dashboard, project search empty state, blank project dialogs, GitHub import
gate, marketplace listing, and a fresh blank static-HTML editor project were
smoked in the in-app browser. Fresh static HTML preview served HTTP 200 and the
editor became ready across desktop/tablet/phone after cold boot. A reclaimed
Vercel sandbox project still cannot restore because Convex liveness/restore is
missing, but the 410 path is now non-destructive: sync/git/preload cascades stop
once `sandboxGone` is latched. Production unauthenticated smoke passed for `/`,
`/pricing`, `/blog`, `/changelog`, `/sign-in`, and `/projects`; `/projects`
redirected to sign-in and `/changelog` showed the live v3.8 June 5 desktop/local
project update.

**Restore QA update 2026-06-08:** reclaimed Vercel sandbox restore was ported
to Convex. `projectActions.checkSandboxLiveness` probes branch-owned Vercel
preview URLs server-side, `projectActions.restoreSandbox` resumes from the
branch snapshot, and `projects._replaceBranchSandbox` updates project, branch,
and frame metadata to the new sandbox URL. Local validation required
`bun --filter @weblab/web-client convex:dev:once`; after sync, the expired
example.com project restored to `https://sb-7hsurxnx9im0.vercel.run`, and that
URL returned `HTTP/2 200`. Offline project-cache writes were serialized, capped,
and disabled after quota/abort/backing-store failures. Lower-level ZenFS/browser
storage pressure remains open in `BACKLOG.md`; production authenticated E2E
still requires a deployed build plus a production auth session.

**Local/prod QA update 2026-06-20:** unauthenticated main flows were re-smoked
on localhost and `https://weblab.build`: landing hero prompt/auth modal,
promo-banner dismissal, public marketing routes (`/`, `/pricing`, `/download`,
`/blog`, `/changelog`), sign-in validation, protected redirects (`/projects`,
`/projects/new`, `/projects/import`, `/settings`), and mobile landing/menu
layout. Production had the latest public changelog live (`v4.5`, June 17), but
`/sign-in` emitted React minified error #418 while serving
`Cache-Control: public, max-age=0, s-maxage=600, stale-while-revalidate=86400`.
Local fix excludes auth/account/workspace/callback/dev routes from the marketing
HTML CDN cache rule, forces the key auth-gated layouts dynamic/no-store, and
adds the missing `/w/new` server-side auth gate. Local production build now
serves `/sign-in`, `/sign-up`, `/sign-in/verify`, `/projects`, `/settings`, and
`/w/new` with `private, no-cache, no-store, max-age=0, must-revalidate`; `/w/new`
redirects signed-out users to `/sign-in?returnUrl=%2Fw%2Fnew`. Full signed-in
editor/project E2E still needs an auth session and a free local sandbox port;
`:8080` was occupied by Open WebUI during this pass.

**Local/prod QA update 2026-06-23:** main browser flows were re-tested with
`bun dev:ui` on `localhost:3000`, a production build on `localhost:3001`, and
direct probes against `https://weblab.build`. Public/protected route status
matched locally and in production; `/sign-up` correctly redirects to the
unified `/sign-in` form. Local Clerk dev OTP sign-in completed end-to-end into
the workspace dashboard on both dev and production-build servers. Blank static
HTML project creation opened the editor; editor Design/Code/CMS/Preview mode
switches worked without app errors. Two fixes landed: empty provisioning frame
URLs now show `Home` instead of logging `Failed to construct 'URL'`, and the
root layout now uses Next's `viewport` export instead of emitting a duplicate
viewport tag that reproduced production `/sign-in` React #418 locally once
tested against a build. The XML sitemap was converted to an explicit
`/sitemap.xml` route after `next build` failed prerendering the metadata route
with `response.blob is not a function`; the production build now passes and
`/sitemap.xml` returns XML. Remaining blockers: full sandbox-backed editor sync
still needs the local Fastify sandbox server on `:8080` (occupied by Open WebUI
during this pass), production authenticated E2E needs an owned OTP inbox, and
Railway deployment metadata could not be checked because the Railway connector
was unauthorized.

**CI follow-up 2026-06-23:** after pushing the QA hardening commit, GitHub
Actions typecheck and Chromatic passed but the existing `Unit Test` job failed
again on the coverage-runner/log-output issue. The CI workflow and root
`packageManager` now pin Bun 1.3.10, matching local validation and the Chromatic
workflow, and the unit job redirects the large coverage table to `/tmp` before
printing only a short tail on success. The same tracked-file coverage run exits
0 locally when redirected.

**Service-worker follow-up 2026-06-23:** production rolled forward and direct
probes showed `/sign-in` now emits one viewport tag while `/sitemap.xml` serves
the explicit XML route. A fresh Chrome Playwright context with service workers
blocked loaded `/sign-in` with zero console errors, but the persistent test
browser still reproduced React #418 through stale service-worker runtime chunks.
The service worker is now v4 and fetches `/_next/static/chunks/*` network-first
with cached offline fallback, preventing fresh HTML from hydrating against old
Turbopack JS/CSS after adjacent deploys.

**Auth hydration follow-up 2026-06-23:** after the v4 service worker deployed,
`/sign-in` still produced React #418 even with service workers blocked. A
no-JS vs hydrated DOM comparison isolated the mismatch to OAuth provider
buttons: SSR saw a blank `NEXT_PUBLIC_AUTH_PROVIDERS` runtime value and rendered
only Vercel, while the browser bundle fell back to GitHub/Google/Vercel.
`clerk-auth-form` now treats blank/whitespace the same as unset and uses the
documented `github,google` default on both sides.

**Working create paths:** "Start blank" CTA (hero + dashboard) →
`api.projectActions.createBlank` → `scaffoldNextProject` /
`scaffoldStaticHtmlProject`. Vite/Remix/Astro/TanStack Start are gated upstream
in `@weblab/framework` until their scaffolders land.

## Recent Significant Ships

Newest first. Append in `docs/agent-memory/feature-log.md` for the canonical record.

- **2026-07-09** — Desktop v0.2.6 packaged startup fix. `auth-hosts.js` is now
  included in the Electron `build.files` allowlist, fixing the packaged
  `Cannot find module './auth-hosts'` crash on launch. Added a desktop
  packaging regression test that verifies local runtime requires are covered by
  the `app.asar` file list, hardened the desktop release workflow against
  third-party dependency postinstall network flakes, pinned the workflow to
  Bun 1.3.10 with install timeouts, and added a release artifact regression
  test so `latest-mac.yml`, `latest.yml`, `latest-linux.yml`, and blockmaps
  ship with the installers. Published v0.2.6 via the normal `desktop-v*`
  release path; local `/Applications` installs still on v0.2.5 must be
  manually replaced once because that build crashes before its updater can run.

- **2026-07-07** — Transcribe anti-spam cap moved from the old per-process
  in-memory helper to Convex (`convex/transcribeRateLimit.ts`) with one bounded
  rolling timestamp log per user, plus daily stale-row cleanup. This keeps
  `/api/transcribe` at 10 requests/minute across Railway replicas instead of
  per Node process. Unit coverage: `convex/lib/transcribeRateLimit.test.ts`.
  The same full user-flow bug hunt also fixed local folder import framework
  validation after auto-detect, middle-mouse pan mode restore, and async text
  edit cleanup races.

- **2026-07-04** — Editor stability/perf/UX hardening sweep. 10-dimension
  evidence-based audit → 23 fixes across the core editing loop: blank-project
  boot dead-end (live vs stale bootstrap), engine-teardown zombie
  sandbox/session/comment leaks (per-branch `disposed` latches), penpal
  safe-fallback proxy, canvas wheel input drops, per-tick style-slider AST
  writes, `updateStyleNoAction` wrong-level mirror, persisted-undo wipe on nav
  (`dispose()` vs `clear()`), hotkeys hijacking inspector inputs, numeric-input
  draft reset, opacity/custom-property/text-commit UX, overlay feedback,
  branch-switch page-scan race, preload duplicate observers, MobX `.cancel`
  footguns, `@weblab/ui/input` ref. Confirmed-but-deferred: responsive-rebase
  corruption cluster, `isChildTextEditable` stub, post-ready sandbox reclaim,
  perf items — all in `BACKLOG.md`. Audit:
  `docs/editor-stability-audit-2026-07-04.md`. Validation: typecheck 0, lint 0
  errors, 817 tests pass.

- **2026-06-05** — Component registry + anti-slop design prompt (F-785), then
  extended to the **full catalog (1533)**. `component-registry/` catalogues all
  free shadcn/ui (78), shadcnblocks-free (293), Watermelon UI (964) + 198 vendored
  local pro blocks (catalog-first: install URL + description per item; vendor only
  pro + core). The builder agent is constrained to this catalog + one OKLCH palette
  via three cached prompt blocks (`<design-system>`, `<component-registry>`,
  `<anti-slop-checklist>`) in both `cache-blocks.ts` and `provider.ts`, plus an
  embedded `shadcn` skill (`read_skill`) carrying the full catalog index. Blank
  Next.js scaffolds bake the tokens into `globals.css` (on-brand pre-AI). Defaults
  to Next.js+React+shadcn, never invents colors/fonts, matches an existing
  project's stack/tokens when editing. ADR `2026-06-05`.
- **2026-05-24** — CodeSandbox archived. Vercel is sole runtime. CSB files +
  `@codesandbox/sdk` kept as `@deprecated` dead code for legacy DB rows.
  See `docs/notes/2026-05-13-vercel-sandbox-provider.md` and ADR `2026-05-24`.
- **2026-05-24** — Backend migration audit passes 1/2/3 closed CRITICAL IDORs
  (`upsertCanvasView`, `branchActions.fork/createBlank`, `setStripeCustomerId`,
  `revertIncrement` farmable refunds, `uploadServerSideBlob` unlimited binary
  upload), HIGH SSRF / cost-amplification / cross-project bugs, and 5 race
  conditions in `requireUserJIT` / clerk webhook readers. Full audit:
  `docs/agent-memory/backend-migration-audit.md`.
- **2026-05-24** — Landing-page asset restyle + light bg token shift
  (`#ffffff` → `#f7f7f4`).
- **2026-05-23** — Component system pass: button rewrite, dropdown/popover/menu
  unified, tabs animated, dark Codex palette + un-aliased status colors,
  un-blue success/warning/destructive. Light mode left with stubs.
- **2026-05-22** — Core flow QA fixes for login, editor boot, sandbox preview
  (dev magic-link, MobX history persister, presence channel idempotent,
  Vercel preview duplicate Next dev server).
- **2026-05-20** — Railway client hardened against silent crashes: stdout
  crash handlers, `restartPolicyMaxRetries 50`, `NODE_OPTIONS --max-old-space-size=2048`.
- **2026-05-16..18** — `feat(layout-guides)`: Figma-style canvas guides +
  rulers + tick step tests. `feat(brand-tokens)`: brand token editor with
  groups + variable tokens + text styles. `feat(interactions)`: animation
  timeline editor. `feat(page-settings)`: page settings drawer + schema markup
  parser + page access controls. `feat(hosting)`: multi-provider hosting
  adapters + publish UI redesign.
- **2026-05-14..15** — `feat(backend)`: Supabase → Clerk + Convex migration
  final cut. `feat(landing)`: marketing pages, design system, i18n updates.
  `feat(editor)`: editor store hardening + canvas/panel UI improvements.
- **2026-05-12..13** — `feat(desktop) v0.2.0`: drag fallback, crash recovery,
  vibrancy. `feat(auth)`: custom Clerk-powered sign-in form replacing prebuilt UI,
  Vercel OAuth, layout tightening.

## In-Flight (Visible In Worktree)

The worktree may contain unstaged work by the project owner or other agents.
Inspect each file before editing; never revert unrelated edits.

Observed active areas in `git status` and recent commits:

- **AI chat composer + summarizer pipeline** — `useSummarizer` hook + Convex
  `chatActions` summarizer pipeline, model router, cache blocks, observability.
  Files: `src/app/project/[id]/_hooks/use-chat/use-summarizer.ts`,
  `packages/ai/src/chat/summarizer.ts`, `packages/ai/src/chat/model-router.ts`,
  `packages/ai/src/chat/request-builder.ts`,
  `packages/ai/src/observability/index.ts`,
  `packages/ai/src/prompt/cache-blocks.ts`.
- **Properties clipboard** — copy/paste style props across selection.
  Files: `src/components/store/editor/style/properties-clipboard.ts` (+ tests).
- **Layout guides + canvas rulers** — see `convex/layoutGuideStyles.ts`,
  `packages/models/src/project/canvas.ts`, `packages/models/src/project/frame.ts`,
  rulers tick step tests.
- **Workspaces (multi-tenant)** — `convex/workspaces.ts`, `/w/[slug]/settings/*`
  routes (general, members, invitations).
- **CMS deep work** — `convex/cmsActions.ts`, `cmsBindings.ts`,
  `cmsCollections.ts`, `cmsCollectionPages.ts`, `cmsFields.ts`, `cmsItems.ts`,
  `cmsSources.ts`.
- **Skills (AI agent capabilities)** — `convex/skillActions.ts`, `skills.ts`,
  `packages/ai/src/skills/embedded.ts`, embedded skills manifest.
- **Page access** — `convex/pageAccess.ts`.
- **Hosting connections** — `convex/hostingConnectionActions.ts`,
  `hostingConnections.ts`.
- **Publish flow** — `convex/publishActions.ts`, `publishActionsDb.ts`,
  Vercel-aware redeployment tracking.
- **Convex schema growth** — `convex/schema.ts` is the source of truth for
  Convex tables; usage records gained `linkedRateLimitId`, cursors gained
  `by_user`.
- **Project import polish** — local-folder framework picker, verify-project
  flow, figma credentials/context, github connect.
- **Sign-in / sign-up unification** — custom Clerk form, SSO callback, verify
  page, OAuth desktop window.
- **AI prompt composer** — model picker, pull-model dialog, slash-commands
  extension, mention extension.
- **Hero v2** — landing hero refresh with create flow integration.

## Useful working notes

Start here before deep work in an area:

- `docs/notes/2026-05-13-vercel-sandbox-provider.md` — full Vercel sandbox
  design + the `TODO(sandbox-fork)` / `TODO(publish-vercel)` follow-ups
- `docs/notes/2026-05-24-ai-chat-optimization-design.md` — AI chat pipeline
  design (model router, cache blocks, summarizer, observability)
- `docs/notes/2026-05-06-project-runtime-modes.md` — `cloud` / `local` /
  planned `hybrid` mode plumbing
- `docs/notes/2026-05-06-ai-chat-input-unification.md` — single TipTap
  composer
- `docs/notes/2026-05-06-editor-project-flow-fixes.md` — project bootstrap
- `docs/notes/2026-05-06-user-settings-migration.md` — settings shape
  alignment with Drizzle (now Convex)
- `docs/notes/2026-05-07-dev-log-debug.md` — dev-log triage workflow
- `docs/notes/2026-05-03-shadcn-blocks-editor-ai.md` — shadcn blocks injection

## Safety Rules For Current Work

- The current branch is allowed to be dirty. Before editing, inspect the
  target file and the existing diff for that file.
- Never revert unrelated changes. If a file already has unrelated edits, make
  a surgical patch that preserves them.
- Do not create a new branch unless the project owner explicitly asks.
- Commit only edited repo files for your task, and only after validation
  passes.
- Global files outside this repository (e.g. `~/.codex` or `~/CLAUDE.md`)
  cannot be part of a repo commit.
- **No new tRPC routers.** Backend work goes into Convex. The
  `src/server/api/` tree on the client no longer exists.
- **No new Supabase migrations.** `apps/backend/supabase/` is a read-only
  archive of the legacy schema; current schema lives in `convex/schema.ts`.
- **Do not re-introduce `@codesandbox/sdk` calls.** Use Vercel Sandbox.

## Completion Bar

A code task is not done until:

- relevant tests / typecheck / lint / build / targeted validation has run
- migrations / config / env changes have been run **or** clearly handed off
  in a `⚠️ MANUAL STEP REQUIRED` block at the end of the response
- docs updated with durable progress or architecture context
- code review of the session's changed code has been performed
  (`/caveman-review` or the equivalent), with all blocking issues fixed
- if significant, an entry appended to `docs/agent-memory/feature-log.md`
  (and `architecture-decisions.md` if architectural)
- the catalog (`docs/feature-catalog.md`) + test plan (`docs/test-plan.md`)
  updated if a new route / module / package / webhook landed
- the final answer lists files changed, validation status, manual steps,
  and a confidence note

Scoped invited cloud entry passed 198 focused local cases, web/file-system type checks and 51-file focused lint with zero errors and 444 warnings. Fresh authority and runtime source reviews found no confirmed blocker. Real invitation claim/reopen/revocation and deployed backend/web acceptance remain open. Happy DOM is a normal pinned test dependency. Under disk pressure, only this task’s idle desktop-local root dependencies were removed after desktop checks and merge, with 1,221 tracked source fingerprints unchanged. Reinstall those dependencies through the exact guarded integration-install operation before packaging. Root web dependencies remain held for cloud checks. The web and 0.2.2 installer have not been released.


## 2026-10-22 — Imported source and preparation recovery, local only

F-846–848 / T-888–890 recover immutable folder import, bounded private transports and explicit preparation with preserved media/config provenance. Imported open starts no runtime; later content, Studio, backup and publication transports stay refused. Fresh backend/frontend source reviews found boundary gaps which were repaired and covered by direct-handler/mounted cases. 273 focused cases pass. Web types passed before final narrow epoch admission tightening; final types follow formatting. Focused lint: 61 files, zero errors and 3,147 warnings before formatting. The exact 61-file formatter maintenance patch awaits owner approval. No generated donor types were copied; normal generation refuses selected Weblab project access.

The guarded 0.2.2 Mac build completed with Developer ID signing and strict deep signature verification. Notarization is waiting for the shared guarded scheduler; no installer was published. Both dependency trees are held by root for remaining checks/packaging. The root-owned generated browser captures were removed after a clean idle scan; saved site login profiles remain private and intact.

Railway's production history still shows October 5, with deployments paused by its platform-wide security investigation. The provider recommends rotating stored credentials; account-specific exposure is not established. A private scoped rotation proposal is prepared for owner approval. Convex browser sign-in requires an email-code check after cookie transfer failed. No credential was revealed, rotated or revoked, no new backend/web version or imported runtime was activated, and remote CI remains disabled.
