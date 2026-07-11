# F-471 — `USAGE_LIMIT_REACHED` is detected via substring match

- **Discovered:** 2026-05-28 (deeper bug-hunt pass on F-470..F-479)
- **Where:** [apps/web/client/src/app/api/chat/helpers/usage.ts:92](apps/web/client/src/app/api/chat/helpers/usage.ts#L92)
- **Symptom:** `error.message.includes('USAGE_LIMIT_REACHED')` is how the route discovers that Convex hit the cap. If Convex wraps the error differently in a future runtime (already does in different layers), the substring miss flips the code to the "transient error, don't penalize the user" branch — silently granting free LLM responses to everyone over quota.
- **Next step:** throw a typed `ConvexError` from `usage.increment` and `instanceof` check it, OR pin the message format with an explicit reserved prefix and an integration test that boots Convex and asserts the message shape.
- **Risk if ignored:** future Convex upgrade silently disables the quota cap.
- **Tags:** `#bug` `#billing` `#convex` `#brittle`
