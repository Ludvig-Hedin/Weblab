# Keep `getNextJsScaffoldFiles` in sync with cloud `scaffoldNextProject`

- **Discovered:** 2026-06-12 (caveman-review of local blank scaffolding)
- **Where:** packages/code-provider/src/scaffold-templates.ts `getNextJsScaffoldFiles` vs packages/code-provider/src/providers/vercel-sandbox/index.ts `scaffoldNextProject`.
- **Symptom:** the local Next.js blank claims to be "byte-for-byte the same project as a CLOUD blank" (minus an intentional `postcss.config.mjs`). There's no test asserting parity, so the two file sets can drift (deps, `next.config`, tsconfig) unnoticed.
- **Next step:** add a unit test comparing the two file sets (allowing the documented `postcss.config.mjs` divergence), or extract a shared base.
- **Risk if ignored:** local vs cloud blanks diverge over time → "works in cloud, not local" surprises.
- **Tags:** `#test-gap` `#tech-debt`
