# F-471 / F-474 — `code` field on 501 response is a string while the rest of the API uses numbers

- **Discovered:** 2026-05-28 (deeper bug-hunt pass on F-470..F-479)
- **Re-checked:** 2026-05-28 (user-stopping-bug fix pass) — **not user-stopping after all.**
- **Where:** [apps/web/client/src/app/api/chat/route.ts:306](apps/web/client/src/app/api/chat/route.ts#L306), [apps/web/client/src/app/api/ai/inline-edit/route.ts:182](apps/web/client/src/app/api/ai/inline-edit/route.ts#L182), [apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-messages/error-message.tsx:27](apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-messages/error-message.tsx#L27)
- **Reality:** the client `error-message.tsx` falls through any non-402 case to `errorMessage = parsed.error || chatError.toString();`, so the helpful "Provider X routing is not yet implemented on hosted web. Use the desktop app for CLI providers." text DOES render correctly. The mismatch is API consistency hygiene, not a broken user flow.
- **Next step (low priority):** still worth standardizing the field shape (`code: number`, optional `errorCode: string`) so the client can branch deliberately rather than rely on fall-through.
- **Risk if ignored:** none today; brittle if the client component grows additional branches.
- **Tags:** `#tech-debt` `#api-consistency`
