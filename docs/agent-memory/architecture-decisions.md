# Architecture Decisions

Lightweight ADRs — the "why" behind significant technical choices in the
Weblab codebase. **Newest on top.**

Format:

```
## YYYY-MM-DD — Title
Decision: <one-line summary>
Context: <why it came up>
Alternatives considered: <briefly>
Rationale: <why this won>
Status: Active | Superseded by <link> | Reconsidering
```

Keep entries terse. Add cross-links to relevant code or docs.

---

## 2026-06-12 — Component system: code is the source of truth, no new EditorMode
Decision: Component definitions (props/slots/variants/bindings) are pure derivations of project source, indexed client-side alongside the oid index; master editing is a sub-state of DESIGN mode, not a new EditorMode; Convex stores only display metadata (deferred).
Context: Webflow-style master/instance components must work both for Weblab-created projects and imported local Next.js/HTML code, and survive external git edits.
Alternatives considered: (a) Webflow-style DB-backed definitions + codegen — drifts the moment users edit code externally, fights the import use case; (b) server-side scanning (the old tRPC regex route) — stale, no AST fidelity; (c) `EditorMode.COMPONENT_EDIT` — would require auditing dozens of `=== EditorMode.DESIGN` gates in gesture/hotkeys/overlay and regress silently as new checks land.
Rationale: discovery rides the existing `CodeFileSystem` parse pass (zero extra parse cost, `rebuildIndex` covers git pulls); React props/variants map to real language constructs (props, class maps/cva) so generated code is idiomatic and hand-editable; HTML projects get the same model via stamped partials with reversible `masterOid~instanceId` oids. Per-instance overrides are plain JSX attrs at the usage site (value == default ⇒ attribute removed) so usage sites stay clean.
Status: Active. See F-788/F-789 in docs/feature-catalog.md; deferred follow-ups in BACKLOG.


## 2026-06-05 — AI builds from a curated component registry + design-token palette, not from scratch

Decision: The website-builder agent (F-785) is constrained to a fixed catalog of
components and a single design-token source instead of generating arbitrary
markup/colors. The catalog lives as real source in `component-registry/` (repo
root, fetched from the shadcn/ui + Watermelon UI registries) and is mirrored as
typed data in `@weblab/constants` (`COMPONENT_REGISTRY`). Three prompt blocks —
`<design-system>`, `<component-registry>`, `<anti-slop-checklist>` — are injected
into the **cached** system prefix via both prompt paths (`cache-blocks.ts`
stable block and `provider.ts`).

Context: LLMs regress to the training-data mean (shadcn-on-slate, indigo
gradients, three identical feature cards). Naming components + one palette and
auditing against an anti-slop checklist pushes output toward committed, on-brand
craft. Source mandate: `docs/agent-context/design-mandate-source.md`; full field
guide: `docs/agent-context/ai-slop-field-guide.md`.

Alternatives considered: (a) scaffold all components into every project — bloats
the inline scaffolder and can't read a repo folder at runtime in prod; (b) inject
the full 844-line field guide verbatim — too many tokens per request even cached.
Chose: curated folder + compact mirrored catalog + distilled checklist, install
on demand via `bunx --bun shadcn@latest add "<installUrl>"`.

Override precedence (encoded in the prompt): attached reference > the existing
project's own tokens/fonts/stack > defaults. The forbidden-pattern list is
**defaults, not censorship** — an explicit user request or an existing project's
convention always wins, so the agent never breaks a site's consistency or refuses
a deliberate ask.

Placement rationale: the blocks are large but stable, so they belong in the
Anthropic-cached prefix (amortized cost), not the volatile per-request tail.

Status: Active. Extended 2026-06-05 to the full free catalog (1533 items) using a
**catalog-first** model — registry blocks (shadcn/ui, shadcnblocks-free,
Watermelon UI) are catalogued with install URLs and installed on demand rather
than vendored (~4500 third-party files would otherwise enter the repo); only the
198 local pro blocks + a core set are vendored. The full catalog is delivered to
the agent via an embedded `shadcn` skill (`read_skill`) instead of inlining 1533
lines in the always-on prompt. Blank Next.js scaffolds bake the tokens into
`globals.css`. Remaining follow-ups in BACKLOG (codegen the 3-place catalog sync;
dedupe scaffold tokens vs tokens.css; richer Watermelon descriptions).

## 2026-06-04 — Copy to Figma uses native clipboard encoding with a vendored Kiwi schema

Decision: "Copy to Figma" (F-783) produces Figma's **native clipboard format**
(a base64 `fig-kiwi` Kiwi archive inside `text/html`) so plain `Cmd/Ctrl+V`
into Figma yields editable layers — no companion Figma plugin. The encoder
lives in `@weblab/figma-clipboard`, built on `kiwi-schema` + `pako`, and the
Figma scene **schema is vendored as a committed binary** (`src/schema-data.ts`,
extracted from a real `.fig` via `scripts/extract-schema.ts`) rather than
hand-authored.

Context: User explicitly chose "editable layers" over a pixel-perfect image, and
"native paste, no plugin" over a companion plugin. The format is private and
reverse-engineered; the schema lives in chunk-1 of every `.fig`/clipboard buffer.

Alternatives considered: (a) **Image paste** — render element→PNG→clipboard;
trivial + reliable but a flat, non-editable layer. (b) **SVG vectors** — lossy
for flex/grid. (c) **Companion Figma plugin** receiving a clean scene-JSON via
Figma's stable plugin API — far more robust/maintainable, but requires a
one-time plugin install (rejected for UX). (d) **Hand-writing the Kiwi schema**
— thousands of fragile lines; rejected in favour of vendoring the empirical
schema. (e) Depending on the `fig-kiwi` npm package at runtime — its published
0.0.1 doesn't export the schema object `writeHTMLMessage` needs, so we only
reuse its (verified) byte layout and supply our own schema.

Rationale: Native paste matches the literal user flow with zero install. Pinning
`kiwi-schema`/`pako` + a vendored schema keeps the risky binary work isolated,
pure, and round-trip unit-testable (T-813) without a live Figma. Field names are
schema-validated at encode time (kiwi silently drops unknown fields → the
decode test catches drift).

Risks / mitigations: the vendored schema is version-pinned (regen script +
round-trip test fail loudly on drift); two acceptance details are only
verifiable in the real Figma app (clipboard `version` tolerance and the
`parentIndex.position` fractional-index format) — flagged in BACKLOG + T-814 as
the user's manual proof. Browser-safety confirmed by inspection (kiwi-schema has
no Node `Buffer`/fs; pako ships ESM); the `@weblab/figma` package already
establishes that a TS-source `@weblab/*` package bundles client-side.

Status: Active.

---

## 2026-05-28 — Convex prod deploys go through CI (GitHub Action), not the Railway Docker build

Decision: Production Convex (`rapid-crab-113`) is deployed by a dedicated GitHub
Action (`.github/workflows/convex-deploy-production.yml`) running `convex deploy`
with a `CONVEX_DEPLOY_KEY` repo secret — on push to main touching `convex/**` and
on manual dispatch. The Railway Docker image build stays frontend-only (`next build`).

Context: A whole class of "auth broke after the Clerk+Convex migration" symptoms
traced to prod Convex being **empty** — the Railway build only ran `next build`,
nothing ever ran `convex deploy` for prod, and `package.json`'s `convex:deploy`
script was `convex dev --once` (targets the *dev* deployment). So every backend
change shipped to dev only; prod had no functions, no schema, no `auth.config.ts`
⇒ "No auth provider found matching the given token" + `users:me` Server Error.

Alternatives considered: (a) bake `convex deploy --cmd 'bun run build'` into the
Dockerfile — rejected: Railway passes build vars as ARGs (would leak the deploy
key into image history/logs), BuildKit secret-mount support on Railway is
unverified, and a broken build step would take down the frontend too. (b) Keep it
manual — rejected: that's the status quo that caused the outage.

Rationale: Decoupling backend deploy from the frontend image keeps each failure
domain independent, reuses the repo's existing CI-deploys-backend pattern
(`supabase-push-staging.yml`), and keeps the deploy key in GitHub secrets (never
in an image layer). Frontend `NEXT_PUBLIC_CONVEX_URL` stays pinned in Railway to
the stable prod deployment URL.
Status: Active. Requires `CONVEX_DEPLOY_KEY` (production) added as a GitHub repo
secret to function.

## 2026-05-24 — Clerk + Convex as the primary auth + backend (Supabase + tRPC retired)

Decision: All new backend code lives in Convex (`apps/web/client/convex/`).
Auth is Clerk, verified by Convex via the JWT template named `convex`. The
client-side tRPC tree at `apps/web/client/src/server/api/` is removed.
Only two tRPC routers survive at `apps/web/server/src/router/` (`sandbox`,
`components`) — they back the editor → Fastify sandbox lifecycle and are
not extended.

Context: The original stack was Supabase (auth + Postgres) + Drizzle ORM +
tRPC (21 routers). Three problems pushed migration:
- Auth UX was inconsistent — Supabase Auth lacked first-class enterprise
  features (orgs, JWT templates, native OAuth + magic-link), and we kept
  hand-rolling around it. Clerk solves that wholesale.
- tRPC + Drizzle + RLS triple-bookkeeping made every schema change cost
  3× the work and produced subtle drift (Drizzle selecting columns RLS
  policies didn't allow, RLS allowing fields the router didn't validate,
  etc.).
- Convex collapses the data + functions + realtime layers into one
  primitive with a single source of truth (`schema.ts`) and built-in
  identity, scheduling, and HTTP actions.

Alternatives considered:
- Keep Supabase + tRPC, add organizations via custom RLS. Rejected — the
  triple-bookkeeping problem doesn't go away and Clerk is faster to ship.
- Stay on Drizzle but migrate auth-only to Clerk. Rejected — partial moves
  preserve every existing schema-drift bug.
- Move to Drizzle + PlanetScale + Better Auth. Rejected — still requires
  hand-built realtime + scheduling; Convex bundles both.

Rationale: One source of truth (`convex/schema.ts`), one identity layer
(Clerk), one place to put backend logic (Convex queries / mutations /
actions). Capability checks centralize in `convex/lib/permissions.ts`
(`requireCap`, `requireProjectCreateCap`, `requireProjectUpdateCap`,
`getUserByClerkIdSafe`), gated **before** any side effect or paid
external call. Three audit passes (see
`docs/agent-memory/backend-migration-audit.md`) hardened the result.

Follow-ups still open:
- Delete the Supabase stub clients in `apps/web/client/src/utils/supabase/`
  once all callers are migrated (low priority; type-only).
- Delete `@weblab/db` (Drizzle) once no consumer imports remain. Currently
  used for legacy types + seed scripts.
- Remove `apps/backend/supabase/` once the migration archive is no longer
  referenced for archaeology.

Reject: Do not add new tRPC routers to either the client or server tree.
Do not write new SQL migrations under `apps/backend/supabase/`. Do not
import `@supabase/supabase-js` in new code — use the Clerk + Convex
clients.

Status: Active. See `docs/agent-memory/backend-migration-audit.md` for the
audit trail and `docs/agent-context/data-api-architecture.md` for the
runtime contract.

---

## 2026-05-24 — CodeSandbox archived; Vercel Sandbox is the sole runtime

Decision: All new sandbox provisioning routes through Vercel Sandbox. The
CodeSandbox provider (`@codesandbox/sdk`, `packages/code-provider/src/providers/codesandbox/`,
`packages/constants/src/csb.ts`) is retained as `@deprecated` dead code so
legacy DB rows with `cloud_provider: 'code_sandbox'` keep type-checking, but
no production caller invokes it.

Context: The codebase had a dual-mode sandbox abstraction since the Vercel
provider landed (2026-05-13). Committed defaults still routed new projects
to CodeSandbox, with Vercel only kicking in for `nextjs` when
`WEBLAB_CLOUD_PROVIDER=vercel_sandbox` was set locally. The split meant
agents reading the repo cold consistently described the runtime as
CodeSandbox-backed even after the owner had moved local dev to Vercel,
and ~30 files branched on the provider type. Owner explicitly asked to
fully remove CodeSandbox and document the archive.

Alternatives considered:
- Full deletion of the CodeSandbox files and dependency. Rejected — would
  break legacy project rows that still carry `'code_sandbox'` in their
  runtime metadata, with no live migration path yet.
- Keep dual-mode behind a feature flag. Rejected — already tried; the
  ambiguity is what caused the agent-confusion problem in the first place.
- Wait until every legacy CSB-backed project has been migrated. Rejected —
  unbounded calendar time; the dead code keeps growing.

Rationale: Archive-with-deprecation lands the user-visible change today
(default flips, scaffolders work end-to-end on Vercel for Next.js +
static-HTML, the editor surfaces a clear "re-import on Vercel" message
for legacy rows) while leaving a single small follow-up — full deletion
after legacy row migration — that can be done mechanically.

Follow-ups (not yet done):
- `TODO(sandbox-fork)` — implement Vercel snapshot-based fork for
  `project.fork` and `branch.fork` (currently throw a clear error)
- `TODO(publish-vercel)` — implement Vercel snapshot-based build fork in
  `forkBuildSandbox` so publish works again
- Full deletion of `packages/code-provider/src/providers/codesandbox/`,
  `packages/constants/src/csb.ts`, `@codesandbox/sdk` dep, and the
  `'code_sandbox'` union literal — gated on legacy row migration

Reject: Do not re-introduce a multi-provider runtime abstraction unless a
concrete second provider lands. Do not suggest `@codesandbox/sdk` for new
code.

Status: Active. See `docs/notes/2026-05-13-vercel-sandbox-provider.md` and
the Phase 1 / Phase 2 commits (`5e8dca441`, `de3dc9269`).

---

## 2026-05-23 — Codex-aligned dark palette + un-aliased status colors

Decision: Adopt a Codex-exact dark palette as the canonical Weblab dark theme,
expand the semantic token system with named surfaces for every elevation tier
(modal, popover, sidebar, sidebar-active, tooltip, chat-input, selected,
diff-added/removed, etc.), and un-alias status colors so success/warning/
destructive use real green/orange/red instead of the prior blue-aliased values.

Context: Earlier audit showed border was invisible (matched secondary
background), card had no elevation differentiation (matched primary surface),
focus ring was neutral gray, and brand blue was dim against the backdrop.
Owner shared Codex screenshots with literal token values (`#181818`, `#1d1d1d`,
`#458ef7`, etc.) and a long list of additional surface/foreground tokens
needed for chat, diff viewer, code highlight, sidebar, tooltips, etc.

Alternatives considered:
- Keep existing tokens, only tweak hex values — would not cover the
  modal/popover-hover/diff/code/skill use cases owner listed.
- Add tokens piecemeal as features need them — risked drift and another
  round of "all colors look the same" / palette inconsistency.

Rationale: A single coordinated pass keeps tokens internally consistent
(every surface tier named, every foreground tier named), gives `@theme inline`
a single source of truth, and lets new components reach for a token instead
of inventing a hex. Un-aliasing status colors removes confusion ("why is
warning blue?") and matches how Codex / GitHub / modern dark UIs render diff
and status. Live-read in `ColorSwatch` (via `getComputedStyle` +
`MutationObserver`) eliminates the stale-data class of bugs in
`/design-system` — the page now reflects whatever is in `globals.css`.

Light mode left with stubs; full light pass deferred until owner approves
the dark palette in production.

Status: Active. See `packages/ui/src/globals.css` `.dark` block (top comment
documents the surface depth ladder).

---

## 2026-05-20 — Harden Railway client service against silent crashes

Decision: Add three layered defenses against the silent-crash failure mode that
took down `weblab.build` (apex) for several hours on 2026-05-20:

1. **Process-level crash handlers** in `apps/web/client/src/instrumentation.ts` —
   `unhandledRejection`, `uncaughtException`, and `SIGTERM` listeners that log a
   fingerprint to stdout before Node exits. We deliberately do **not** swallow
   the error: letting Node terminate is correct so Railway restarts the
   container under the `ON_FAILURE` policy. The handlers exist only to leave a
   breadcrumb in Railway logs so the next crash isn't invisible.
2. **`restartPolicyMaxRetries: 10 → 50`** in `railway.toml`, `docs/railway.toml`,
   and `apps/docs/railway.toml`. With only 10 retries, a burst of flapping
   crashes (e.g. consecutive OOMs during a traffic spike) drives the replica
   count to zero and Railway gives up — at that point the edge returns
   `502 Application failed to respond` until a human manually redeploys.
   50 retries buys hours of headroom while still bounding the loop.
3. **`NODE_OPTIONS=--max-old-space-size=2048`** Railway env var on the `Source`
   service. Default V8 heap is ~1.5 GB on 64-bit Node; raising it to 2 GB
   gives Next.js SSR room while keeping the cap well below the container
   memory limit. Crucially, hitting the heap cap throws a JS-side
   `JavaScript heap out of memory` (which our `uncaughtException` handler can
   log) instead of triggering a kernel SIGKILL OOM (which leaves zero trace).

Context: On 2026-05-19 at 21:25 UTC the production container's log stream went
silent mid-execution. Over the next ~25 hours every replica died, Railway
exhausted its 10 retries, and `weblab.build` started serving Cloudflare 502s
backed by `x-railway-fallback: true` from the Railway edge. `docs.weblab.build`
stayed up because it is a separate Railway service with its own replicas.
Discovery took longer than it should have because the silent crash left no
stack trace anywhere — no Railway log, no Sentry event, no Langfuse trace.

Alternatives considered: (a) Switching `restartPolicyType` to `ALWAYS`. Rejected
because it would mask hard failures (e.g. bad config) that genuinely need a
fresh deploy. (b) Adding an external uptime monitor only. Deferred —
necessary but doesn't reduce time-to-recovery once the crash is detected.
(c) Tuning Railway autoscaling. Out of scope for this incident.

Rationale: These three changes are cheap, additive, and don't touch product
logic. Together they turn the silent-crash failure mode into one that (i)
leaves logs we can grep, (ii) self-heals across many more crash bursts, and
(iii) prefers a catchable JS exception over an uncatchable SIGKILL. An
external uptime monitor pointed at `/api/health` is the natural next step and
is tracked separately.

Status: Active. Revisit if (a) we see retries exhausted again — bump further or
move to `ALWAYS`; or (b) we add Sentry/Better Stack and want to remove the
stdout-only crash log path.

Touched: `apps/web/client/src/instrumentation.ts`, `railway.toml`,
`docs/railway.toml`, `apps/docs/railway.toml`, Railway env var `NODE_OPTIONS`.

---

## 2026-05-13 — Dual cloud sandbox provider rollout

Decision: Add Vercel Sandbox as a second cloud runtime behind
`WEBLAB_CLOUD_PROVIDER`, while keeping CodeSandbox as the default fallback.
Context: CodeSandbox free credits were consumed quickly during small tests, and
the next CodeSandbox plan is expensive for early Weblab usage.
Alternatives considered: Immediate cutover to Vercel Sandbox; self-hosted
Fly.io/Machines sandbox platform; E2B.
Rationale: Dual-provider rollout preserves uptime, keeps existing CodeSandbox
projects working, and lets Vercel be validated with branch-level metadata
before any existing project migration.
Status: Active

## 2026-05-09 — AbortSignal forwarded through the full chat pipeline

Decision: `createRootAgentStream` accepts an optional `abortSignal` param passed down to `streamText`; `/api/chat` passes `req.signal`.
Context: When users navigate away or cancel a generation, the HTTP connection closes but `streamText` kept calling the LLM until the `stopWhen` step limit. Wasted tokens and money.
Alternatives considered: Middleware-level abort interceptor (added complexity, same effect).
Rationale: Minimal surface change — one optional param; AI SDK `streamText` natively respects `AbortSignal`.
Status: Active

## 2026-05-09 — CMS adapter SSRF guard via DNS + IP blocklist

Decision: `cms/adapters/index.ts` resolves user-supplied CMS base URLs via DNS before fetching; blocks loopback, private RFC-1918, link-local, and cloud metadata IPs.
Context: CMS "connect to your CMS" accepts arbitrary URLs — a classic SSRF vector to reach cloud metadata (169.254.169.254) or internal services.
Alternatives considered: Allowlist approach (too restrictive for customer-managed CMS deployments).
Rationale: Denylist private IP ranges; DNS resolution catches hostname-based bypasses (e.g., `internal.co` resolving to 10.x.x.x).
Status: Active

## 2026-05-09 — Invitation router role-based authorization

Decision: `invitationRouter.list` requires project membership via `verifyProjectAccess`. Invite/delete procedures require OWNER/ADMIN role via `requireProjectRole`. Non-owners cannot grant OWNER role.
Context: Prior code had no auth checks on list — any authenticated user could enumerate all project invitations given a projectId. Invite/delete had no role gating.
Alternatives considered: Middleware-level project membership check (deferred — tRPC middleware must be wired per-router).
Rationale: Direct checks at the procedure level are explicit and auditable; `requireProjectRole` is reusable within the same router.
Status: Active

---

## 2026-05-09 — Repo-scoped agent memory in `docs/agent-memory/`

Decision: Persistent agent memory lives in a committed `docs/agent-memory/`
folder with three files: `user-preferences.md`, `feature-log.md`,
`architecture-decisions.md`.
Context: User wanted future agents to inherit preferences and feature
history without bloating `CLAUDE.md` / `AGENTS.md`. Per-host agent memory
(e.g., `~/.claude/projects/.../MEMORY.md`) doesn't transfer to other agents
or contributors.
Alternatives considered:
- Cram more into `CLAUDE.md` (rejected: bloats the rulebook, reduces
  signal-to-noise on rules).
- Use only host-local memory (rejected: not portable, not visible to other
  agents like Codex/Cursor).
- A single `MEMORY.md` at repo root (rejected: mixes concerns; harder to
  consolidate user preferences vs. feature history).
Rationale: Repo-scoped, three-file split keeps each file focused. Agents read
`user-preferences.md` every session; `feature-log.md` and
`architecture-decisions.md` only on big changes.
Status: Active.

---

## 2026-05-23 — Supabase migrations retained as read-only archive

Decision: Keep `apps/backend/supabase/` in the repository as a read-only
archive of the legacy Supabase migration history while current backend work
uses Convex and Clerk.
Context: The Convex/Clerk migration removes active Supabase/tRPC/Drizzle
runtime dependencies, but deleting the historical Supabase migrations creates
a large diff and removes useful audit/recovery context.
Alternatives considered:
- Delete the legacy migrations with the rest of the Supabase cleanup
  (rejected: loses history and makes review unnecessarily noisy).
- Restore the full old backend stack (rejected: current architecture is
  Convex/Clerk; only the migration archive is needed).
Rationale: Retaining the migration files preserves historical schema context
without reintroducing them into the active runtime. The archive is documented
in `apps/backend/supabase/README.md` and should not receive new migrations.
Status: Active.

---

## Pre-existing decisions (recorded retroactively)

These predate this file but are codified in `CLAUDE.md` / `AGENTS.md`. Listed
here for traceability.

### Brand: Weblab over Onlook
Decision: Product is Weblab; `APP_NAME` is the only source of truth.
Rationale: Forked from Onlook (Apache-2.0); attribution preserved in
`LICENSE.md` only. All user-facing surfaces must use Weblab.
Status: Active.

### Deployment: Railway, not Vercel
Decision: `apps/web/client` deploys via Railway.
Rationale: Project owner's chosen platform. Vercel-specific knowledge in
agent training data does not apply here.
Status: Active.

### Package manager: Bun only
Decision: Bun for all installs and scripts.
Rationale: Speed, native TypeScript, monorepo workspace support, single
toolchain for client + server.
Status: Active. Do not propose npm/yarn/pnpm.

### MobX stores: `useState(() => new Store())`
Decision: Create stores via `useState`, never `useMemo`.
Rationale: React may drop memoized values, causing data loss. The pattern
plus async cleanup avoids both data loss and route-change race conditions.
See `apps/web/client/src/components/store/editor/index.tsx`.
Status: Active.

### Shared AI prompt composer (TipTap)
Decision: Single `AiPromptComposer` component (TipTap-based) drives all chat
surfaces (homepage, create, empty-projects, in-canvas).
Rationale: Consistent shortcuts, accessibility, mention/slash UX, and
no-layout-shift focus across surfaces. Also unblocks structured context
pills.
Status: Active. Legacy snapshots retained as fallback until migration is
fully proven.

### Runtime modes: cloud / local / hybrid
Decision: Three runtime modes — `cloud` (CodeSandbox, production), `local`
(desktop-first), `hybrid` (planned, with explicit sync controls).
Rationale: Different users want different tradeoffs (zero-setup vs. full
local control). Hybrid must never silently overwrite local repo changes.
See `docs/notes/2026-05-06-project-runtime-modes.md`.
Status: Active. Hybrid still planned.

---
