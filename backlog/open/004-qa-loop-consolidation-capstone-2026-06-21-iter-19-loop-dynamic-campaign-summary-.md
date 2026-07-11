# QA loop — CONSOLIDATION CAPSTONE (2026-06-21 iter-19, /loop dynamic) — campaign summary + regression sweep

> Capstone, not a hunt. **Regression check: `bun typecheck` exit 0; parser 210/210; offline write-queue 8/8** — the campaign's 30 fixes are collectively green. Wrote the campaign summary ([docs/notes/qa-loop-campaign-2026-06-21.md](docs/notes/qa-loop-campaign-2026-06-21.md)) + a feature-log entry.

**Campaign outcome (iters 1-19):** 30 fixes shipped (incl. 2 security: workspace owner-invite escalation + deployment `envVars` leak; 2 offline data-loss: write-queue coalesce [test-backed] + replay watcher-race), 1 prioritized UX audit, 2 test files. ~15 subagent findings REFUTED on verification (≥5 overlapped existing guards) — the highest-value behavior, since several would have regressed billing/auth/parser/sync if applied blind.

**This is a natural stopping point.** Broad hunts saturated; offline swept; remaining high-value work is OWNER-GATED:
1. **Wireframe spend rate-limit** — dedicated table (NOT `usageRecords`, which would charge the message cap). Ready to build on an explicit yes.
2. **Live-browser offline→online reconnect pass** — the iters 16-17 data-loss fixes are reasoned, not click-tested. The clearest verification gap.
3. Deferred (need a test harness / editor session): route-group page FS-path (iter-4 design recorded), editor-history coalesce/redo-alias leads. Minor: `sw.js` preload cache-first.

Absent an owner steer (build wireframe RL / live-browser pass / redirect / wind down), recommend winding the loop down rather than running more dry hunts.
