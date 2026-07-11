# F-473 — `chat-images/[id]` double-allocates the response buffer

- **Discovered:** 2026-05-28 (deeper bug-hunt pass on F-470..F-479)
- **Resolved:** 2026-07-07 — `return new Response(buffer, ...)` instead of wrapping in `new Uint8Array(buffer)`; Node 18+ undici accepts a `Buffer` directly.
- **Tags:** `#perf`
