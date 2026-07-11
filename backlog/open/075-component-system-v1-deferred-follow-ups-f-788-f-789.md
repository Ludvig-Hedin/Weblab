# Component system v1 — deferred follow-ups (F-788/F-789)

- **Discovered:** 2026-06-12 (component-system build session)
- **Where:** `apps/web/client/src/components/store/editor/components/`, `packages/parser/src/component/`
- **Symptom:** v1 ships master/instance + properties + variants + slots(children) + unlink for React and HTML; these pieces are intentionally deferred:
  1. **Convex `componentMeta` table** — display names, descriptions, prop groups/tooltips/order, per-instance rename (`instanceNames`). Nothing structural; schema sketch in the approved plan (`~/.claude/plans/design-webflow-style-component-system-concurrent-sparrow.md`).
  2. **Undo/redo for instance-prop writes** — `setInstanceProp` goes through `code.writeRequest` directly, bypassing the action/history pipeline. Needs a `write-code`-style action with inverse.
  3. ~~**Inline prop-override text editing on canvas**~~ — RESOLVED 2026-06-13 (commit pending). Double-clicking a text-bound element inside an instance now edits THAT instance's value inline via the existing text editor with a `commitOverride` routed to `setInstanceProp`; entering master edit is reserved for non-bound elements / the boundary / `⌘⏎`. Matches Webflow's documented inline-bound-value gesture.
  4. **Named-slot insertion UI** — `children` works via the normal insert path; named ReactNode slots need a `SET_SLOT_CONTENT` structure change + drop-target resolution (transform sketch in plan §slots).
  5. **HTML in-canvas master edit routing** — elements inside stamped instances carry `masterOid~instanceId` oids; canvas edits on them currently hit the *page* copy (overwritten on next re-stamp). Route `~`-oids → master partial edit + restamp (`resolveEditTarget` HTML branch in plan §6).
  6. **node_modules / external component instances** — currently `getDefinitionForInstance` returns null (no chip/panel). Wanted: instance-only mode (literal attrs editable as untyped fields, no master edit/detach).
  7. **richtext prop creation** — discovery types exist; `createPropFromElement` doesn't generate ReactNode props yet.
  8. **Design-system page specimens** — green palette swatches added; component chip / edit banner / prop-field specimens still to add to `/design-system`.
- **Next step:** pick items off in order of user pain; 3 and 5 are the most user-visible.
- **Risk if ignored:** prop edits not undoable (2); HTML instance edits silently lost on re-stamp (5).
- **Also (low, from the 2026-06-12 review pass):**
  9. `countComponentUsages` is name-based — same-named components from other files/libraries inflate the banner's "applies to N instances". Filter by resolved import → `def.filePath`.
  10. `toImportPath` in `store/editor/insert/index.ts` still hardcodes the `@/` alias for Components-tab drag-inserts (create-from-selection now resolves tsconfig paths — reuse `resolveImportPath`).
  11. Extract leaves now-unused imports in the source page (lint noise, not breakage).
  12. Raw `<button>`s in component-instance/master sections + chip/tree pencils violate [button-enforcement.md](docs/agent-context/button-enforcement.md) — swap for ghost `<Button>` or add an icon-chip variant.
  13. Component chip uses `zIndex: 60` (matches CmsPill) — paints over panels when the rect is near edges; both should clamp.
  14. `detachInstanceHtml` leaves an orphan `<div data-wb-slot-content>` wrapper (attr stripped, div kept) — cosmetic stray div in unlinked static HTML; should unwrap to children for parity with React detach.
- **Tags:** `#tech-debt` `#editor`
