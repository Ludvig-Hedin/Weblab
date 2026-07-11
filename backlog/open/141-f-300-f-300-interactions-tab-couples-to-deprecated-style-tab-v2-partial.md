# F-300 — Interactions tab couples to deprecated `style-tab-v2` (partial)

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Partial fix (2026-07-07):** `Section` (used by 13 files inside `style-tab-v2` plus 3 in `interactions-tab`) moved to a new [`right-panel/_shared/section.tsx`](apps/web/client/src/app/project/[id]/_components/right-panel/_shared/section.tsx); all 16 importers updated. Deleting `style-tab-v2` no longer breaks the Interactions tab's `Section` usage.
- **Still open — `ElementHeaderSection`:** `list-view.tsx:11` still imports `ElementHeaderSection` from `style-tab-v2/sections/element-header.tsx`. Turned out bigger than the original ticket implied: that file also pulls `../controls/{property-label,select-field,text-field}` from `style-tab-v2/controls/*`, so a clean lift means moving 4 files (or duplicating the 3 controls, which likely already have v3/v4 equivalents worth reusing instead — needs a look before deciding). Deferred; not done in this pass.
- **Tags:** `#tech-debt` `#editor` `#cross-feature-coupling`
