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
