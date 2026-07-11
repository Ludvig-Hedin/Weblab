# ~~F-131 — invalid project ID maps to "unknown" variant instead of "invalid-id"~~ FIXED (2026-05-28)

- **Resolution:** Extracted the catch-block classification into a pure
  `classifyProjectLoadError(message)` helper
  ([apps/web/client/src/app/project/[id]/_adapters/classify-load-error.ts](apps/web/client/src/app/project/[id]/_adapters/classify-load-error.ts))
  that checks `does not match validator` / `argumentvalidationerror` **first**,
  returning the existing `invalid-id` variant. `page.tsx` now short-circuits
  to `<ProjectLoadError variant="invalid-id" />` for malformed ids and skips
  the pointless offline-cache lookup. Verified by
  `classify-load-error.test.ts` (12 cases incl. invalid-id precedence over a
  co-occurring "not found" substring). Was: malformed id → `unknown` variant
  leaked the raw validator string in a `<pre>`.
