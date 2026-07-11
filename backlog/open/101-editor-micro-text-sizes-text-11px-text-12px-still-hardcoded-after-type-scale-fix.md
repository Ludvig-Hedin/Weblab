# Editor micro text sizes (`text-[11px]`/`text-[12px]`) still hardcoded after type-scale fix

- **Discovered:** 2026-06-05 (standard-text-scale session)
- **Where:** editor panels — `apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v2|v3|v4/**`, `left-panel/design-panel/**`; className literals `text-[11px]` and `text-[12px]`.
- **Symptom:** these micro-labels stay a fixed px and do **not** follow the Appearance → Font size (density) setting, unlike the now-tokenized `text-tiny`/`text-sm` siblings. Minor inconsistency at non-default density.
- **Why it matters:** design-system guidance (`design-system/_components/demos/data.ts`) recommends tokens over hardcoded px; mixed approaches drift.
- **Next step:** convert real-text `text-[11px]`→`text-micro` (0.6875rem, exact) and `text-[12px]`→`text-mini` or `text-xs` (both 0.75rem, exact). **Skip** SVG/icon-glyph sizing (e.g. `landing-page/feature-trio-section.tsx` `text-[13px]` inside an `h-3 w-3` box) and landing `design-mockup`. Left out of the 2026-06-05 sweep per "editor can be custom".
- **Also:** `--text-tiny` (10px) is defined in `@theme` (`packages/ui/src/globals.css`) but not shown in the design-system typography visual scale (`typography.tsx` iterates the `--font-size-*` family, not `--text-*`). Add a row/note there.
