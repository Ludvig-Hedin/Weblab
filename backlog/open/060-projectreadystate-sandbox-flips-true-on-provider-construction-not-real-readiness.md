# projectReadyState.sandbox flips true on provider construction, not real readiness

- **Discovered:** 2026-06-16 (bug-hunt; wiring AI-3, verdict partial/high)
- **Where:** `apps/web/client/src/app/project/[id]/_hooks/use-start-project.tsx:186-188`; `components/store/editor/sandbox/session.ts:157-161`
- **Symptom:** `sandbox` ready-flag flips the instant `VercelBrowserProvider` is constructed (synchronous), independent of whether the :8080 WS actually connected or the dev server started. So the editor can open (isProjectReady true via Convex-driven canvas+conversations) with a dead/booting preview and no surfaced error.
- **Next step:** Add a `session.devServerReady` observable set after `task.open()`/dev-server start resolves, and gate `updateProjectReadyState({ sandbox: true })` on it. (Partly mitigated already by the 60s `startDevServer` WS timeout added 2026-06-16 in `vercel-browser-provider.ts`, which now surfaces a hard error instead of hanging.)
- **Risk if ignored:** "Entered the editor but preview never works, no error" until the watchdog fires.
- **Tags:** `#bug` `#editor` `#preview`
