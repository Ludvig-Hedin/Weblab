# Optimistic-creation window boots OfflineProvider — edits made before provisioning can clobber the scaffold

- **Discovered:** 2026-06-12 (working-tree review of optimistic creation)
- **Where:** apps/web/client/src/components/store/editor/sandbox/session.ts (~103), src/services/offline/write-queue.ts, convex/projectActions.ts `_provisionSandbox`
- **Symptom:** while `sandboxId` is empty (background provisioning), the editor starts OfflineProvider; writes made in that window queue in localforage against an empty ZenFS and replay into the freshly scaffolded sandbox after the auto-reload — potentially clobbering scaffold files — and the editor presents an "offline" state for a brand-new online project.
- **Next step:** gate editing surfaces (or at least chat sends / file writes) on a provisioned state (`frame.url`), or hold the offline write queue while `provisioningPending`.
