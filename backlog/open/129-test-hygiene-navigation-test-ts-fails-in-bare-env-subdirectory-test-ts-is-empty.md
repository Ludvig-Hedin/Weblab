# Test hygiene: `navigation.test.ts` fails in bare env; `subdirectory.test.ts` is empty

- **Discovered:** 2026-05-29 (test-hardening session: baseline run)
- **Where:** [apps/web/client/test/frame/navigation.test.ts](apps/web/client/test/frame/navigation.test.ts) (transitively imports `src/env.ts`); [apps/web/client/test/sandbox/subdirectory.test.ts](apps/web/client/test/sandbox/subdirectory.test.ts) (0 bytes).
- **Symptom:** `navigation.test.ts` is the only failing test in the client suite — it throws "Invalid environment variables" at import time because `OPENROUTER_API_KEY` is unset under `bun test` (env IS set at runtime, so not a product bug). `subdirectory.test.ts` is empty → false-confidence "coverage" with zero assertions.
- **Next step:** preload a test-only env (bunfig `preload` or set a dummy `OPENROUTER_API_KEY` in a test setup file) so the suite is green in CI; delete or fill `subdirectory.test.ts` (no subdirectory-resolution helper currently exists to test).
- **Risk if ignored:** perpetually red suite masks new real failures; empty file misleads.
- **Tags:** `#test-gap` `#flake` `#infra`
