# Design tokens duplicated: scaffold copy vs tokens.css

- **Discovered:** 2026-06-05 (full-catalog session)
- **Where:** `packages/code-provider/src/providers/vercel-sandbox/index.ts` (`NEXTJS_GLOBALS_CSS`) and `component-registry/theme/tokens.css`
- **Symptom:** the OKLCH token values are written in two places — the scaffolder can't read the repo file at runtime in prod, so the CSS is inlined. Editing one and not the other drifts the palette.
- **Next step:** codegen `NEXTJS_GLOBALS_CSS` from `tokens.css` at build, or move the canonical tokens into `@weblab/constants` and import in both.
- **Risk if ignored:** blank-scaffold palette can diverge from the registry tokens.
- **Tags:** `#tech-debt`
