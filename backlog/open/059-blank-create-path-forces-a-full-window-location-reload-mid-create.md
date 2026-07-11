# Blank-create path forces a full window.location.reload() mid-create

- **Discovered:** 2026-06-16 (bug-hunt; creation AI-3, verdict confirmed/high)
- **Where:** `apps/web/client/src/app/project/[id]/_components/canvas/frame/index.tsx:183-189`; `convex/projectActions.ts:472-491` (createBlank optimistic) vs `:683-728` (createFromPrompt synchronous)
- **Symptom:** "Start blank" inserts frames with empty URLs + provisions in the background; when the real URL lands, the frame effect calls `window.location.reload()`, replaying the whole loader chain (loading.tsx → Main → frame overlay) + a white flash. The hero AI-prompt path (`createFromPrompt`) provisions synchronously and is NOT affected.
- **Next step (preferred):** Align `createBlank` with `createFromPrompt` — provision the sandbox synchronously and `_insertProjectGraph` with `sandboxUrl` set, so frames are never inserted at `url:''` and the reload effect never fires. Cost: blank open waits ~13s (warm) on one loader (same UX as the prompt path). Alternative (keeps optimistic open): replace `window.location.reload()` with `immediateReload()` (reloadKey bump) ONLY after making the EditorEngine branch sandbox metadata reactive to the live Convex query — naive reloadKey swap regresses the "boot with correct branch sandboxId" guarantee (comment at index.tsx:180-182).
- **Risk if ignored:** Blank-create feels broken (double loaders + flash). Not on the user's AI-prompt flow.
- **Tags:** `#bug` `#editor` `#ux`
