# Dead component: `hero/start-blank.tsx` (`StartBlank`) has no importers

- **Discovered:** 2026-06-17 (QA pass iter-2)
- **Where:** `apps/web/client/src/app/_components/hero/start-blank.tsx`
- **Symptom:** `StartBlank` is not imported anywhere (`rg "import .*StartBlank|<StartBlank"` → 0 hits). The real "Start blank" CTA users see is in `apps/web/client/src/app/projects/_components/project-chooser-cards.tsx` (calls `useCreateBlankProject` directly). Iter-1's UX assessment critiqued this dead component's low-weight `text-foreground-secondary` button — moot until it's wired up or deleted. Note: the live component is also a raw `<button>` (button-enforcement candidate).
- **Next step:** Delete `start-blank.tsx`, or wire it in if it was meant to be the hero CTA. Separately, audit `project-chooser-cards.tsx`'s blank CTA against [button-enforcement.md](docs/agent-context/button-enforcement.md).
- **Risk if ignored:** Dead code rots; future agents (like iter-1) waste effort assessing it.
- **Tags:** `#tech-debt`
