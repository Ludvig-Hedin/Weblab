# Browser FS persistence can fail under heavy editor navigation when storage is full/busy

- **Discovered:** 2026-06-07 (local/prod E2E QA pass)
- **Where:** editor browser storage/ZenFS persistence path; surfaced in dev logs while cycling project/editor routes.
- **Symptom:** Dev logs showed `Compaction failed: No space left on device`, `Persisting failed: Another write batch or compaction is already active`, and IndexedDB `AbortError` reads/writes for chat conversation persistence during heavy local editor navigation.
- **Root cause:** Partially confirmed. Offline project-cache writes could race and keep retrying after storage pressure. A lower-level ZenFS/dev-toolchain persistence path can still report compaction/write contention when the browser/dev cache is already full.
- **Progress:** 2026-06-08 serialized offline project-cache writes, trims cached frames/conversations, and disables further project-cache writes after quota/abort/backing-store failures. Chat last-active-conversation storage now logs one warning instead of spamming.
- **Next step:** Add storage-pressure detection to the ZenFS persistence layer itself and show a user-visible degraded-storage warning with a clear "clear local cache" recovery action.
- **Risk if ignored:** Users with full browser storage can still see noisy lower-level persistence errors and may lose cached editor file state.
- **Tags:** `#bug` `#editor` `#storage` `#reliability`
