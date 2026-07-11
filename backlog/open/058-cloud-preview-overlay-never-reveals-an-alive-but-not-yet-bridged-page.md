# Cloud preview overlay never reveals an alive-but-not-yet-bridged page

- **Discovered:** 2026-06-16 (bug-hunt; preview AI-1, verdict partial/high)
- **Where:** `apps/web/client/src/app/project/[id]/_components/canvas/frame/index.tsx:312,578-586`; `frame-connection.ts:28-43`; `use-sandbox-liveness.ts`
- **Symptom:** For a CLOUD (Vercel) frame, the opaque `bg-background` boot overlay only lifts on `isFrameReady = preloadScriptReady && isPenpalConnected`. A sandbox serving HTTP 200 (`livenessState==='alive'`) stays fully hidden behind the overlay until the preload+penpal bridge completes. The `alive`-lifts-overlay shortcut (`localPreviewReady`, index.tsx:312) is `isLocalFrame`-only — no cloud equivalent.
- **Root cause:** No `cloudPreviewReady`. `shouldUnlockCodeSandboxPreview()` hardwired false.
- **Next step:** Add `const cloudPreviewReady = !isLocalFrame && livenessState==='alive' && !hasBuildErrors && preloadScriptReady;` and, once true, switch the overlay from opaque to a translucent "connecting tools" hint (show the rendered page, small corner spinner) while penpal finishes. Do NOT reveal before `preloadScriptReady` (an unbridged iframe makes select/edit no-op). Keep build-error + `sandboxIsGone`/Restart paths intact.
- **Risk if ignored:** After the :8080 deploy lands, normal boots are fine, but a slow/failed penpal handshake reads as "blank page, loading forever" instead of a usable preview.
- **Tags:** `#bug` `#editor` `#preview`
