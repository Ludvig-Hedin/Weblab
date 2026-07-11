# AI chat UX — deferred polish follow-ups

- **Discovered:** 2026-06-02 (chat-tab `/ux-assesment` + `/ux-polish` session)
- **Where:** `apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/*` + `messages/en.json` (`panels.edit.tabs.chat.*`)
- **Symptom / items not done this pass** (the high-value W1–W9 + thread-title orientation shipped):
  - **Queue clarity (S3):** the message queue never explains *why* messages queue or *when* they send, and a committed queued-edit shows no save confirmation. `chat-input/queue-items/*`.
  - **History-recall affordance (S2):** ↑/↓ recalls prior prompts but there is no hint and no "browsing history (n/total)" active indicator. `chat-input/index.tsx:281-320`.
  - **Context-pill near-limit count:** made the remove-X always visible (W6) but did **not** add the `n/max` image-limit indicator — intentionally skipped to avoid clutter. `context-pills/input-context-pills.tsx`.
  - **Stale composer copy:** `chat.input.tooltip` = "Chat with AI about the selected element" (selection no longer required — misleading) and `chat.mode.tooltip` = "Switch between Build and Ask modes" (omits **Plan**). `messages/en.json` (~1164, ~1167).
- **Next step:** small, independent edits; each a self-contained quick win. Fix the two stale strings first (one-line copy each).
- **Risk if ignored:** minor friction / mild confusion; nothing broken.
- **Tags:** `#ux` `#polish` `#i18n`
