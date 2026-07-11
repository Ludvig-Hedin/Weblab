# CI "Unit Test" job red on main since 2026-06-20 — bun 1.3.1 (CI) vs 1.3.10 (local) env discrepancy

- **Discovered:** 2026-06-21 (full-repo code-review session; surfaced while verifying a push to prod)
- **Resolved:** 2026-06-23 (CI workflow/root `packageManager` now pin Bun 1.3.10; coverage output is redirected to avoid GitHub log-pipe aborts)
- **Where:** `.github/workflows/ci.yml` (`bun test --timeout 30000 --coverage`); root `package.json` `packageManager`.
- **Symptom:** CI `Unit Test` job concluded `failure` / exit 1 on every main push (`029b30ece` 06-20, `ee63617d6` + `d35141c2b` 06-21, `b0b1a0f3e` and `9dac8332a` 06-23). The GH log showed passes but no `(fail)` markers and no Bun summary line before exit 1; the process terminated after the coverage table.
- **Root cause:** CI was initially pinned to Bun 1.3.1 while local validation and the Chromatic workflow were on Bun 1.3.10. After aligning Bun, the runner still failed with the same shape: no `(fail)` markers, exit 1 immediately after dumping the huge coverage table. A local direct stream reproduced a Bun `WriteFailed`, while the same coverage run redirected to a file exited 0.
- **Fix:** Updated the CI typecheck/test jobs, the commented lint job template, and root `packageManager` from Bun 1.3.1 to 1.3.10 so local and GitHub Actions use the same toolchain. The unit job now runs the tracked test list explicitly and redirects coverage output to `/tmp/bun-test.log`, printing the full log only on failure and the tail on success.
- **Validation:** `git ls-files '*test.*' | xargs bun test --timeout 30000 --coverage > /tmp/weblab-tracked-tests.log 2>&1` on Bun 1.3.10 = 1862 pass / 1 skip / 0 fail across 155 tracked files; GitHub Actions re-run after push.
- **Tags:** `#infra` `#flake` `#tech-debt`
