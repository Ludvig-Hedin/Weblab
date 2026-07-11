# QA loop — offline/PWA hunt + SATURATION call (2026-06-21 iter-15, /loop dynamic) — 0 FIXED (all risky/no-harness), findings logged

> Offline/PWA/service-worker hunt. **No clean ship** — the real findings are data-loss in the no-test sync/offline area (won't patch blind), and the safe-looking one is intentional. **The broad-hunt loop is saturated; see the recommendation at the bottom.**

**📋 LOGGED — offline write-integrity leads (real-looking; need a TEST HARNESS before fixing — services/offline + sync have none):**
- **BLOCKER `#offline` `#data-loss` — last offline writes can be dropped on reconnect.** `services/offline/replay-controller.ts` snapshots the queue once, but the watcher isn't stopped until `suppressSyncInitForReplay` fires via the provider-reaction — leaving a window where new watcher events enqueue records sharing paths with snapshot records; `write-queue.supersedePriorRecords` deletes those new records during replay, and since they're not in the snapshot they're never applied. **Fix:** stop the offline watcher BEFORE `replayQueue`, or replay only the snapshot IDs.
- **FRUSTRATING `#offline` — editor silently unsynced for the tab's lifetime after an interrupted reconnect.** `use-start-project.tsx` reconnect effect sets `cancelled=true` in cleanup; if it unmounts while `swapToOnline` is awaiting, the early-return skips `resumeSync()`, leaving `suppressSyncInit===true` permanently → next mount skips `initializeSyncEngine`. **Fix:** call `resumeSync()` before every `cancelled` early-return.
- **FRUSTRATING `#offline` — dead-letter retry can apply wrong content under concurrent retries** (`write-queue.retryDeadLetterRecord`): both reuse `record.id` as the blob key → second clobbers the first in-flight write. **Fix:** `makeId()` a fresh id for the requeued record. (Pairs with the iter-9 non-atomic-coalesce write-queue lead.)
- **MINOR `#pwa`** — `sw.js` serves `weblab-preload-script.js` cache-first → existing tabs keep a version-skewed preload after a deploy (new tabs are fine via SW activate purge). Move it to `staleWhileRevalidate`. (Preload is jsDelivr-pinned in prod per [[project_preload_artifact_must_commit]] — sw change needs care.)

**❌ REFUTED:**
- online-status initial `heartbeat({ allowFlipUp:false })` "leaves 'unknown' 15s" — intentional: the comment (`online-status.ts:96`) says the initial ping deliberately doesn't blindly trust `navigator.onLine`; a normal 2xx still flips up via `|| currentOnline`. The window only occurs on a 4xx from `/api/health`, which returns 200 normally. Conservative-by-design + abnormal-edge.

---
