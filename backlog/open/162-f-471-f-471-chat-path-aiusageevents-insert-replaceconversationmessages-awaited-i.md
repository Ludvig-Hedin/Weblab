# ~~F-471 — Chat path: `aiUsageEvents.insert` + `replaceConversationMessages` awaited inside `onFinish` with no timeout~~ FIXED (2026-05-28)

- **Discovered:** 2026-05-28 (validate-feature F-470..F-479 run)
- **Resolved:** 2026-05-28 (user-stopping-bug fix pass)
- **Where:** [apps/web/client/src/app/api/chat/route.ts](apps/web/client/src/app/api/chat/route.ts)
- **Fix:** Added `runWithTimeout()` helper (8s) wrapping both `fetchMutation(api.messages.replaceConversationMessages, …)` and `built.finalizeUsage(…)` inside `onFinish`. On timeout the helper resolves `undefined` and logs `[chat] <label> exceeded …ms; closing stream and continuing best-effort` so the response can close even when Convex stalls. Persistence becomes best-effort under degraded backend conditions, which is the right tradeoff: users no longer see a finished bubble that "never completes."
