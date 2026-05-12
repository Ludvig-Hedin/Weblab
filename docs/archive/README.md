# Archive

Stale material kept for searchability. Nothing here is load-bearing for the current product, but the content has enough historical or reference value that we don't want to lose it.

If you need to find a closed code-review thread, a legacy architecture description, or a deprecated reference project, look here.

## Contents

| Path | Origin | Why kept |
|---|---|---|
| [`chatgpt-project/`](./chatgpt-project) | was `docs/chatgpt-project/` | Legacy T3 / Bird Code reference docs (project overview, architecture, user flows, coding rules, editor deep-dive, DB/API, UI design system, ChatGPT prompt guide). Useful for comparing the current Weblab editor to its T3 ancestor. |
| [`t3code/`](./t3code) | was `reference/t3code/` | Snapshot of the old Bird Code project (AGENTS.md, CLAUDE.md, GEMINI.md, PROJECT.md, RELEASE.md, etc.). Reference for migration archaeology. |
| [`code-review-backlog.md`](./code-review-backlog.md) | was `/CODE_REVIEW_BACKLOG.md` | Closed code-review notes (~200 KB). Searchable for "did anyone flag X before?". |
| [`coderabbit-reviews.md`](./coderabbit-reviews.md) | was `/CODERABBIT_REVIEWS.md` + `/coderabbit-reviews.md` (merged) | CodeRabbit AI review output captured during past runs. The smaller former-root file is appended at the bottom under a dated header. |
| [`activity.md`](./activity.md) | was `/activity.md` | Loose work log from earlier in the project. |

## When is it safe to delete?

A file in this folder can be deleted when **all** of the following are true:

1. The information is mirrored somewhere live (git history doesn't count as "live" for searchability purposes).
2. No active doc, plan, or memory file links to it.
3. No one has referenced it in the last 6 months.

If in doubt, leave it. Disk is cheap; reconstructing context from git archaeology is expensive.

## Don't add to this folder casually

If you're tempted to put something here, first ask: is this _stale_ (no longer applies) or _just old_ (still applies)? Old-but-applicable docs belong in `agent-context/` or `agent-memory/`. Stale-but-historically-interesting belongs here.
