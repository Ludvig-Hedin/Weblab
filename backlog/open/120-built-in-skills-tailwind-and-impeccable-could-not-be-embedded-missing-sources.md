# Built-in skills `tailwind` and `impeccable` could not be embedded (missing sources)

- **Discovered:** 2026-05-29 (skills built-in seeding session)
- **Where:** `agent-temp-input/tailwind` → `../../.agents/skills/tailwind` and `agent-temp-input/impeccable` → `../../.agents/skills/impeccable` (dangling symlinks); generator [packages/ai/scripts/generate-skills.ts](packages/ai/scripts/generate-skills.ts) reads `skills/<name>/SKILL.md`.
- **Symptom:** User asked for both to ship as default-on built-ins, but their symlink targets resolve to `coder-new/.agents/skills/*`, which does not exist on disk; no matching `SKILL.md` found under `~/.claude` either. The other 7 requested skills were embedded; these two were skipped.
- **Next step:** Obtain the real `tailwind` + `impeccable` `SKILL.md` sources, drop them into `skills/tailwind/SKILL.md` and `skills/impeccable/SKILL.md`, then run `bun run generate:skills`. No code change needed.
- **Risk if ignored:** the agent's built-in skill menu is missing two skills the user expected.
- **Tags:** `#docs` `#tech-debt`
