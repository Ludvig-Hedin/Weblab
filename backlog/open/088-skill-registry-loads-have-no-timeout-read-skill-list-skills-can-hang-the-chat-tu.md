# Skill registry loads have no timeout (read_skill / list_skills can hang the chat turn)

- **Discovered:** 2026-06-11 (create-with-AI bug hunt)
- **Where:** packages/ai/src/skills/registry.ts (`loadFromDb` → `scope.trpcCaller.skills.list.query()`)
- **Symptom:** if the skills source stalls, the server-side `read_skill` execute blocks the stream indefinitely — chat shows "Reading skill …" forever with no error.
- **Root cause:** no timeout/AbortSignal on the skills query inside `loadSkills`/`loadSkillByName`.
- **Next step:** wrap the query in `withTimeout` (~10s) and let the tool return an `output-error` so the turn continues.
- **Risk if ignored:** rare but unrecoverable stuck chats; user must reload.
- **Tags:** `#bug` `#infra`
