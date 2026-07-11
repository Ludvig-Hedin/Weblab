# V4 style panel: gradient editor is a "coming soon" stub

- **Discovered:** 2026-06-10 (user report)
- **Where:** `apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v4/sections/background.tsx:224` (`{type === 'gradient' && <p>Gradient editor — coming soon</p>}`).
- **Symptom:** Selecting the Gradient background type in the V4 right panel shows a "coming soon" placeholder — no editor. A working gradient editor already exists in the **editor-bar** color dropdown (`editor-bar/inputs/color-picker.tsx` — `Gradient` component + `useGradientUpdate`).
- **Next step:** Build a V4 gradient section by wiring the existing editor-bar gradient editor (or a shared extract) into `background.tsx`, committing via `useStyleSetter`/`updateMultiple` (backgroundImage + backgroundColor). Fold in the per-move throttle/transaction noted in the perf entry below so stop-dragging doesn't storm source writes.
- **Risk if ignored:** Gradient fills can't be edited from the main style panel (only the top toolbar). Feature gap, not a regression.
- **Tags:** `#feature` `#editor` `#style-panel`
