# `@weblab/ai` package lint is red from pre-existing warnings (max-warnings 0)

- **Discovered:** 2026-06-05 (component-registry session — surfaced, not caused)
- **Where:** `packages/ai/test/stream/convert.test.ts`, `test/tools/edit.test.ts`, `test/tools/read.test.ts` (`no-explicit-any`, `await-thenable`, prettier); `packages/ai/src/prompt/provider.ts:~220` (`img.id || 'unknown'` → prefer `??`)
- **Symptom:** `bun --filter @weblab/ai lint` exits 1 with 383 warnings, 0 errors. This session's new prompt files lint clean — the debt predates it.
- **Next step:** type the test fixtures (drop `any`), remove non-thenable `await`s, run `format`, and switch the provider `||` to `??` (confirm empty-string id semantics first).
- **Risk if ignored:** the ai workspace lint stays red, so genuinely new warnings get lost in the noise.
- **Tags:** `#tech-debt` `#test-gap`
