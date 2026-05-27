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
