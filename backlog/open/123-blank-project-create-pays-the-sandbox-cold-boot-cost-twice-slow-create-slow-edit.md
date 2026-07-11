# Blank-project create pays the sandbox cold-boot cost twice (slow create + slow editor)

- **Discovered:** 2026-05-29 (project-creation investigation session)
- **Where:** [convex/projectActions.ts:244](apps/web/client/convex/projectActions.ts#L244) (`createBlank` → `VercelSandboxProvider.createProject`, synchronous), then editor cold-resume via [src/components/store/editor/sandbox/session.ts](apps/web/client/src/components/store/editor/sandbox/session.ts) `start()`.
- **Symptom:** "Start blank" shows the creation loader for 15–45s while `createBlank` scaffolds + `npm install` + snapshots + resumes the sandbox synchronously. It then `router.push`es to the editor, which cold-resumes the *same* sandbox from snapshot — the dev server respawns and the preview 502s for another 20–60s. The user waits through the boot twice.
- **Root cause:** Provisioning is fully synchronous in the action, and the editor does not reuse the still-warm sandbox from create; it re-resumes from the persisted `snapshotId`.
- **Next step:** Either (a) keep the create-time sandbox warm and hand its live session to the editor so it skips the second resume, or (b) provision asynchronously (return `projectId` immediately, boot in the background) and let the editor's now-resilient boot loop (see self-heal in [use-frame-reload.ts](apps/web/client/src/app/project/[id]/_components/canvas/frame/use-frame-reload.ts)) cover the wait. Also wire `WEBLAB_VERCEL_WARM_POOL_SIZE` so a pre-warmed VM is claimed instead of cold-provisioned. Needs a live Vercel-sandbox env to verify.
- **Risk if ignored:** every new project feels slow and "stuck"; the perceived double-wait is the top creation-flow complaint.
- **Tags:** `#perf` `#infra` `#sandbox` `#needs-verification`
