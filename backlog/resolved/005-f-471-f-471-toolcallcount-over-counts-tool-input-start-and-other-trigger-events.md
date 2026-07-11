# F-471 — `toolCallCount` over-counts `tool-input-start` and other trigger events

- **Discovered:** 2026-05-28 (deeper bug-hunt pass on F-470..F-479)
- **Resolved:** 2026-07-07 — `chat/route.ts` now dedupes by `toolCallId` via the AI SDK's `isToolOrDynamicToolUIPart` type guard instead of a raw `type?.startsWith('tool-')` substring filter, which counted every stream trigger event (`tool-input-start`, `tool-input-delta`, etc.) as a call.
- **Tags:** `#bug` `#telemetry`
