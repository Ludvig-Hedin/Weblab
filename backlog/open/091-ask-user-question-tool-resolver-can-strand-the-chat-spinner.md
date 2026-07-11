# ask_user_question tool resolver can strand the chat spinner

- **Discovered:** 2026-06-11 (stop-button investigation)
- **Where:** apps/web/client/src/components/tools/tools.ts:37-47 (`AskUserQuestionTool.register` promise never resolves if the question card unmounts / chat type has no card UI)
- **Symptom:** `isExecutingToolCall` stays true forever → "Working…" spinner that Stop previously couldn't clear (hard-stop now force-clears it, but the underlying promise still leaks).
- **Next step:** resolve/reject the registered resolver on conversation switch/unmount, or add a timeout with `output-error`.
- **Tags:** `#bug` `#tech-debt`
