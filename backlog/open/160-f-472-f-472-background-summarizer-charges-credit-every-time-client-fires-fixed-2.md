# ~~F-472 — Background summarizer charges credit every time client fires~~ FIXED (2026-05-28)

- **Discovered:** 2026-05-28 (validate-feature F-470..F-479 run)
- **Resolved:** 2026-05-28 (user-stopping-bug fix pass)
- **Where:** [apps/web/client/src/app/api/chat/summarize/route.ts](apps/web/client/src/app/api/chat/summarize/route.ts)
- **Fix:** Added two cheap server-side gates in front of the LLM call:
  1. Same-tip skip — read `conversations.getSummary` and 204 immediately if `upToMessageId` already matches the last incoming message id.
  2. Per-process cooldown — `Map<conversationId, number>` with 60s minimum interval; redundant fires within the window 204 without charging the user.
- **Caveat:** the cooldown is in-process; multi-replica deployments could still fire once per replica per cooldown window. That is acceptable today and far below the unbounded burst the buggy/malicious client could previously generate.
