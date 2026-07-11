# Preload-injection failure can't be re-armed by the user; "alive but preload-failed" mislabeled

- **Discovered:** 2026-06-16 (bug-hunt; preview AI-2, verdict partial/high)
- **Where:** `components/store/editor/sandbox/index.ts:373-401` (latch + private `resetPreloadRetryState`); `use-frame-reload.ts:68-80` (`immediateReload` doesn't reset preload state); `frame/index.tsx` restart panel
- **Symptom:** After the preload-retry budget (5 non-transient / 30 transient) is exhausted, `preloadScriptState` latches NOT_INJECTED. The existing Restart/Retry panels reload the iframe but never re-call `ensurePreloadScriptExists()`, so a preload/parse failure can't recover without a full provider restart or page reload. When the page is `alive` but preload failed, the panel offers "Restart dev server" — which doesn't fix injection.
- **Next step:** Expose a public `retryPreloadInjection()` (calls `resetPreloadRetryState()` + `ensurePreloadScriptExists()`) and call it from the frame retry/restart handlers. Add a distinct `preloadFailed` signal (NOT_INJECTED && budget exhausted && !sandboxGone) with a panel whose primary action is `retryPreloadInjection()`.
- **Risk if ignored:** Rare terminal preload failures need a manual page reload to recover.
- **Tags:** `#bug` `#editor` `#preview`
