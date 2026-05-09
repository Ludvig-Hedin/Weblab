# Agent Memory

Persistent, repo-scoped memory for AI coding agents. The goal: every future
agent picks up immediate context about what the user (project owner) wants,
what was recently shipped, and what architectural decisions are in force —
without bloating `CLAUDE.md` / `AGENTS.md`.

> **This folder is committed to the repo.** Treat it as durable team
> knowledge, not session scratch space. Be precise; outdated entries are worse
> than no entries.

## Files

| File | Purpose | Owner |
|------|---------|-------|
| `user-preferences.md` | What the user (Ludvig) wants, dislikes, and prioritizes — durable preferences that persist across sessions | All agents may append; see rules below |
| `feature-log.md` | Append-only log of significant features, fixes, and edits agents have shipped | All agents append on major changes |
| `architecture-decisions.md` | Lightweight ADRs — the "why" behind significant technical choices | All agents append on architectural changes |

## Read Protocol (every agent, every session)

Before starting any non-trivial task, **read `user-preferences.md`** in this
folder. It is short by design.

Before planning a **big edit, refactor, or feature addition**, also read:

- `feature-log.md` (recent entries) — to know what already exists
- `architecture-decisions.md` (relevant entries) — to avoid violating
  established constraints
- The relevant files in `docs/agent-context/` for the area you're touching

The mandatory rules in `CLAUDE.md` and `AGENTS.md` always take precedence.

## Write Protocol

### When to write to `user-preferences.md`

Append (or update an existing entry) when:

- The user **explicitly states a preference** ("I always want X", "never do
  Y", "I prefer Z over Q").
- The user **corrects an agent's default** in a way that suggests it should
  apply going forward, not just this once.
- A pattern emerges across multiple sessions where the user has clearly
  signaled a preference.

Do **not** record:

- One-off task instructions
- Anything about a single feature (that goes in `feature-log.md`)
- Sensitive personal information beyond what's needed (email is fine if
  already in CLAUDE.md context)

### When to write to `feature-log.md`

Append on every **significant ship**:

- New user-facing feature (also requires changelog entry per `CLAUDE.md`)
- New tRPC router or major router expansion
- New package in `packages/*`
- New major dependency added
- Significant refactor that changes how an area works
- DB migration that changes a meaningful shape

Skip for:

- Typos, copy tweaks, small style fixes
- Minor bug fixes that don't change architecture or behavior contracts
- Anything covered by an existing changelog entry **and** without architectural
  impact (link to the changelog instead of duplicating)

### When to write to `architecture-decisions.md`

Append a short entry whenever you (or the user) make a decision that:

- Establishes a new pattern other agents should follow
- Rejects an alternative approach for a specific reason worth remembering
- Adds or changes a cross-cutting constraint

Format: see the file's own template.

## Style

- Keep entries **terse**. The user values low context-bloat.
- Use dated headers (`## YYYY-MM-DD — Title`) for `feature-log.md` and
  `architecture-decisions.md`.
- Group `user-preferences.md` by category; keep each preference to 1–3 lines.
- Link to source files / migrations / PRs for traceability.
- If you replace an existing preference, leave a `~~strikethrough~~` of the
  old one with a brief note rather than silently deleting — the history
  matters.

## Anti-Patterns

- Pasting full PR descriptions into the log.
- Recording every chat turn or session result.
- Adding "I think" / "maybe" entries — only write what's confirmed.
- Letting `user-preferences.md` grow past ~100 lines without consolidation.
