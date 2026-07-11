# Storybook preview still loads Inter web-font (out of sync with app)

- **Discovered:** 2026-06-13 (caveman-review of font change).
- **Where:** `apps/web/client/.storybook/preview.tsx:3,9-12,25`.
- **Symptom:** App dropped the Inter `next/font` web-font for a pure system stack (`layout.tsx`, `styles/globals.css`, `packages/ui/src/globals.css`), but Storybook still imports `Inter` and wraps stories in `--font-inter`. Component previews render in Inter while production renders in the system stack — previews misrepresent real typography.
- **Next step:** Remove the `Inter` import + the `--font-inter` wrapper in `preview.tsx` so Storybook inherits the same system stack as `globals.css`.
- **Risk if ignored:** Visual QA in Storybook doesn't match shipped fonts; cosmetic only.
- **Tags:** `#tech-debt` `#docs`
