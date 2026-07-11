# ~~ESLint config — `react-hooks/exhaustive-deps` rule unregistered at inline disable sites~~ FALSE ALARM (2026-07-07)

- **Discovered:** 2026-05-28 (bug-hunt F-120..F-135)
- **Re-checked:** 2026-07-07 — does not reproduce. `bunx eslint` on both originally-confirmed sites (`verify-project.tsx`, `use-screenshot-backfill.ts`) now shows normal warnings only, no "Definition for rule ... was not found". `eslint --print-config` confirms `react-hooks/exhaustive-deps` resolves at severity `warn` with the plugin present; a full `bun lint` run fires real `react-hooks/exhaustive-deps` and `@next/next/no-img-element` warnings across dozens of files. `eslint.config.js` hasn't changed since before the original discovery — likely an ESLint/`eslint-plugin-storybook` dependency bump fixed the flat-config plugin-merge shadowing incidentally. No code change needed.
- **Tags:** `#infra` `#lint`
