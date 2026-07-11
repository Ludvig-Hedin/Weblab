# Edit-message submit guard is a no-op (`sendMessage` not awaited)

- **Discovered:** 2026-06-02 (chat-panel UI review session, surfaced by `claude-review`)
- **Where:** `apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-messages/user-message.tsx:147-153` (caller `handleSubmit:122-131`)
- **Symptom:** Editing a user message and pressing Submit twice quickly can fire the edit twice; the Submit spinner (`isSubmittingEdit`) never visibly renders.
- **Root cause:** `sendMessage` calls `toast.promise(onEditMessage(...))` but never `await`s or `return`s the inner promise, so it resolves to `undefined` immediately. `handleSubmit` awaits it and the `finally` resets `isSubmittingEdit` before the edit completes, defeating the `if (isSubmittingEdit) return;` dedup guard. `handleRetry` (133-145) already does this correctly.
- **Next step:** make `sendMessage` await/return its promise — `const p = onEditMessage(...); toast.promise(p, {...}); await p;` (mirror `handleRetry`).
- **Risk if ignored:** rare double-submit of an edited message; no visible submitting state. Pre-existing (not introduced by this session's UI tweaks); left out of scope to avoid touching unrelated logic in a multi-session tree.
- **Tags:** `#bug`
