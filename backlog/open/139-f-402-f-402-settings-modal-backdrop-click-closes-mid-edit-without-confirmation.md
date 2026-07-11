# F-402 — Settings modal backdrop click closes mid-edit without confirmation

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [apps/web/client/src/components/ui/settings-modal/non-project.tsx:100](apps/web/client/src/components/ui/settings-modal/non-project.tsx#L100), same pattern in `with-project.tsx`.
- **Symptom:** Backdrop click handler dismisses the modal unconditionally. A user typing in an AI/GitHub/Editor tab loses unsaved input on a stray click.
- **Next step:** add `isDirty` state to `useStateManager` settings; gate close with a confirm dialog when any tab is dirty. This is a cross-cutting change (every tab component owns its own local `useState` draft, none currently report dirty status upward) — needs per-tab wiring plus live browser verification of each tab's save flow before shipping, not a quick patch.
- **Risk if ignored:** unsaved input loss on stray backdrop click; medium-frequency annoyance, no data corruption.
- **Tags:** `#bug` `#editor` `#modal` `#ux`
