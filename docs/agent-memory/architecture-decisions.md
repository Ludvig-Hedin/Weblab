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
See `docs/project-runtime-modes.md`.
Status: Active. Hybrid still planned.

---
