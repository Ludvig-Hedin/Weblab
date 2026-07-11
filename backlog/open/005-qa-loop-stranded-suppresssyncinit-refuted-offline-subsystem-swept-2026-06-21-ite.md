# QA loop — stranded-suppressSyncInit REFUTED + offline subsystem swept (2026-06-21 iter-18, /loop dynamic) — 0 fixed (refuted)

> Verified the last offline lead; refuted. The offline subsystem is now swept.

**❌ REFUTED:**
- **stranded `suppressSyncInit` on interrupted reconnect** (iter-15 FRUSTRATING lead). The reconnect effect in `use-start-project.tsx:265-345` wraps the replay flow in a `try` whose **`finally` (lines 323-331) calls `resumeSync()` on every exit path** — its own comment states the intent: "Ensure sync engine init is never left permanently suppressed even if swap or replay throws." The `if (cancelled) return` at line 285 is INSIDE that try, so the `finally` still runs → `resumeSync()` → `resumeSyncInit()` (which clears `suppressSyncInit` first, `sandbox/index.ts:224`). The flag cannot strand. The subagent missed the try/finally.

> **Offline subsystem status: SWEPT.** write-queue concurrent-coalesce (FIXED+test, iter-16), replay watcher-race (FIXED, iter-17), stranded-suppressSyncInit (REFUTED, iter-18), retryDeadLetter clobber (REFUTED+test, iter-16). Remaining: `sw.js` preload cache-first (MINOR — jsDelivr-pinned in prod, risky sw change, low priority).

> **Loop recommendation:** the broad-hunt and offline veins are exhausted. The remaining high-value work is OWNER-GATED: (1) wireframe rate-limit dedicated table (ready to build on a yes); (2) a LIVE-BROWSER offline→online reconnect pass to verify the iters 16-17 data-loss fixes end-to-end (none are click-tested). Suggest the loop either redirect to a named area, do a consolidation/regression-sweep pass, or wind down.
