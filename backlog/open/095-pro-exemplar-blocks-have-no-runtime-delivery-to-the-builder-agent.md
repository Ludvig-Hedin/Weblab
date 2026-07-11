# Pro + exemplar blocks have no runtime delivery to the builder agent

- **Discovered:** 2026-06-05 (review of F-785 full-catalog session)
- **Where:** `component-registry/pro/**`, `component-registry/blocks/**`, `component-registry/templates/**`; referenced by `skills/shadcn/SKILL.md` and the `<component-registry>` prompt.
- **Symptom:** the agent runs in the user's Vercel sandbox and cannot read the Weblab repo, so the 198 vendored pro blocks and the exemplar blocks/templates are not reachable as source — only their names/descriptions reach the agent (via the skill). Registry blocks (shadcn/ui, shadcnblocks, Watermelon) are fine because they install by URL. Wording was corrected this session to say "reproduce the pattern / install the closest equivalent" instead of "copy from component-registry/…", but the pro blocks still can't be installed directly.
- **Next step:** host the pro blocks as a shadcn-compatible registry (serve `manifest.json` + per-item registry JSON from a Weblab endpoint) so the agent can `bunx --bun shadcn@latest add "<weblab-url>"`; then give pro entries real `installUrl`s in the catalog.
- **Risk if ignored:** the local pro blocks are reference-only — the agent can imitate them but not install them.
- **Tags:** `#enhancement` `#tech-debt`
