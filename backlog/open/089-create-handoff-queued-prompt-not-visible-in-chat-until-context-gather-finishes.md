# Create handoff: queued prompt not visible in chat until context gather finishes

- **Discovered:** 2026-06-11 (create-with-AI UX pass)
- **Where:** apps/web/client/src/app/project/[id]/_hooks/use-start-project.tsx (`resumeCreate`) + chat panel
- **Symptom:** after the editor opens, the chat stays empty for several seconds (sandbox file reads with up to ~6.5s retry backoff) before the user's prompt appears. Toast now fires immediately, but the prompt bubble itself is still late.
- **Next step:** render the pending `creationRequest` prompt as an optimistic user message (or "queued" pill) in ChatMessages while `hasPendingCreation` is true and the send hasn't fired.
- **Risk if ignored:** create flow still feels momentarily dead between loader and first stream.
- **Tags:** `#tech-debt` `#ux`
