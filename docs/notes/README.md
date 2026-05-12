# Working Notes

Short, dated notes capturing what was worked on, what broke, and what was decided in-flight. A running journal — not a polished architecture doc.

## When to add a note

- A debugging session uncovers a non-obvious cause worth recording.
- You finish a chunk of work that isn't big enough for `agent-memory/feature-log.md` but future-you (or another agent) might re-encounter.
- You make a decision that's too local to deserve an entry in `agent-memory/architecture-decisions.md`.

## When NOT to add a note

- Trivial fixes (typos, copy tweaks).
- Anything that belongs in a PR description.
- Anything that should be in `agent-context/*-architecture.md` instead (architecture changed → update the architecture doc).

## Naming convention

```
YYYY-MM-DD-<kebab-topic>.md
```

The date is the day the work happened (not the day the note was filed). Keep the topic short and concrete: `2026-05-06-ai-chat-input-unification.md`, not `chat-stuff.md`.

## Format

Keep notes terse:

```markdown
# <topic>

**Date:** YYYY-MM-DD
**Status:** [active | done | superseded by …]

## Context
Why this needed doing.

## What changed
Files, decisions, gotchas.

## Follow-up
Anything explicitly deferred.
```

## Promotion

A note graduates to `agent-memory/feature-log.md` when the work it describes actually ships as a meaningful feature. Promote by adding a feature-log entry that links back to the note; don't delete the note.

A note graduates to `agent-context/*-architecture.md` when it documents a pattern that now applies broadly. Fold the relevant pieces into the architecture doc and either delete the note or shorten it.
