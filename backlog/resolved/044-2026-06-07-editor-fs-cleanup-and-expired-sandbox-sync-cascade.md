# 2026-06-07 — Editor FS cleanup and expired-sandbox sync cascade

Resolved by the 2026-06-07 local/prod E2E QA pass.

- `CodeFileSystem` no longer tries to save `.weblab/index.json` when the FS was
  never initialized or has already torn down during route changes. The
  project-creation tab-churn console error (`File system not initialized`) is
  now a guarded no-op.
- Expired Vercel sandbox sessions now latch 410 as `sandboxGone`, release sync,
  and skip git/preload work. Local E2E verified the old reclaimed project no
  longer logs directory deletes or push attempts after the guard.
- Full sandbox restore was completed in the 2026-06-08 resolved entry above.
