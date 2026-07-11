# F-472 — Summarize refunds the user credit even when the LLM was actually called

- **Discovered:** 2026-05-28 (deeper bug-hunt pass on F-470..F-479)
- **Where:** [apps/web/client/src/app/api/chat/summarize/route.ts:162-164](apps/web/client/src/app/api/chat/summarize/route.ts#L162)
- **Symptom:** `summarizeConversation()` runs the LLM (cost incurred at OpenRouter). If it returns `null` (e.g. truncation produced no usable summary), `refundOnce()` reverts the user's quota deduction. The user pays nothing, but Weblab still pays OpenRouter.
- **Root cause:** the refund path treats "no result" as "no work done"; in reality it means "work done, result discarded".
- **Next step:** distinguish "no summary produced" (refund) from "summary attempted but LLM returned empty / parse failed" (keep deduction; log + metric). Or accept the asymmetry and document it as a policy choice.
- **Risk if ignored:** small cost leak proportional to summarizer flakiness.
- **Tags:** `#bug` `#billing` `#design-question`
