# QA loop — write-queue concurrency fix, test-backed (2026-06-21 iter-16, /loop dynamic) — 1 FIXED + test, 1 refuted (test-locked)

> **Correction to iter-15:** the offline write-queue DOES have a test harness — `test/offline/write-queue.test.ts` (committed `d41867068`), which I'd missed. So instead of building one, I extended it (concurrent + dead-letter cases) and fixed a real bug test-first. Typecheck ✓; `bun test` 8 pass / 0 fail.

**✅ FIXED (this commit, test-backed):**
1. **`#offline` `#data-integrity` — concurrent writes to the same path didn't coalesce → duplicate queue records.** `services/offline/write-queue.ts` `enqueue` ran `supersedePriorRecords` then inserted, with no serialization. Two concurrent same-path enqueues each superseded the PRE-insert state (neither saw the other) → BOTH survived, defeating coalescing and risking a spurious replay conflict from a stale `baseHash`. Added a failing test (`Promise.all([enqueue, enqueue])` → got 2, want 1), then **fixed** by serializing enqueues through a module-level promise-chain lock (`enqueueLock`) so each coalesce sees the committed prior state. Test now passes. (Resolves the iter-9 `supersedePriorRecords` non-atomic-coalesce lead.)

**❌ REFUTED (locked by a passing test):**
- **dead-letter `retryDeadLetterRecord` reuses `record.id` → concurrent retries clobber content** (iter-15 lead). Verified non-bug: a double-retry of the SAME dead-letter record writes the SAME content to the SAME id (idempotent), and `makeId` ids don't collide across records. Added a test (`Promise.all([retry, retry])` → exactly 1 live record, correct content, dead-letter empty) — passes, documenting the idempotency.

> Note: the **other** offline leads from iter-15 (replay watcher-shutdown race dropping the last offline writes; stranded `suppressSyncInit`; sw preload cache-first) are in `replay-controller`/`use-start-project`/`sw.js` — NOT the write-queue — and remain logged; they need their own test scaffolding (the write-queue harness doesn't cover them). The SATURATION recommendation + open owner decisions (wireframe rate-limit, live-browser pass, wind-down) from the iter-15 entry below still stand.
