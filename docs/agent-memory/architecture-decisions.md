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
