# Sandbox liveness probe is a no-op on Convex — editor can't tell "booting" from "dead"

- **Discovered:** 2026-05-29 (project-creation investigation session)
- **Where:** [src/app/project/[id]/_components/canvas/frame/use-sandbox-liveness.ts:23](apps/web/client/src/app/project/[id]/_components/canvas/frame/use-sandbox-liveness.ts#L23) (TODO(convex-migration): always returns `'unknown'`); also stubbed in [project-preview-surface.tsx:93](apps/web/client/src/app/projects/_components/select/project-preview-surface.tsx#L93).
- **Symptom:** `useSandboxLiveness` never probes, so every auto-recovery branch in [frame/index.tsx](apps/web/client/src/app/project/[id]/_components/canvas/frame/index.tsx) that keys off `livenessState === 'alive' | 'gone' | 'notFound'` is dead code. The editor relies solely on the penpal handshake + reload loop; a genuinely-reaped sandbox can't surface a Restore CTA, and the boot loop can't distinguish "still cold" from "gone forever". Partially mitigated this session by a background self-heal reload after the cap, but that's a fallback, not a real signal.
- **Root cause:** The legacy `sandbox.checkAlive` tRPC procedure (apps/web/server) was never ported to Convex during the migration.
- **Next step:** Add a Convex `action` `sandboxActions.checkAlive({ projectId })` that server-side `HEAD`s the project's *own* stored `sandboxUrl` (look it up server-side — do NOT accept an arbitrary URL from the client, SSRF) and classifies `2xx/3xx/404→alive`, `502/503/504→booting`, `410/DNS-fail→gone`. Wire it into `useSandboxLiveness` (poll while `enabled`). Unit-test the classifier in isolation.
- **Risk if ignored:** reaped sandboxes spin forever with no Restore path; boot UX stays guess-based.
- **Tags:** `#bug` `#sandbox` `#convex` `#tech-debt`
