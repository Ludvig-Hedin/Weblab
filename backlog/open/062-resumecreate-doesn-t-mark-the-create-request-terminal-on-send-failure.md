# resumeCreate doesn't mark the create request terminal on send failure

- **Discovered:** 2026-06-16 (bug-hunt; wiring AI-5, verdict partial/medium)
- **Where:** `apps/web/client/src/app/project/[id]/_hooks/use-start-project.tsx:541-547` (catch); `convex/projectCreateRequests.ts:24-39` (`updateStatus` accepts FAILED already)
- **Symptom:** If `sendMessage` throws, the create request stays PENDING forever (`hasPendingCreation` truthy), the right panel keeps its mount-only wide "first-creation" layout, and the user gets only a dismissible toast — no inline retry.
- **Next step:** In the catch, when the failure is at/after `sendMessage`, `await updateCreateRequest({ projectId, status: ProjectCreateRequestStatus.FAILED })` (enum value exists). For pre-send (context-gather) failures, trigger a real retry (bump a retry-counter in the effect deps; `processedRequestIdRef=null` alone doesn't re-fire). Surface an inline retry CTA in the chat panel, not the frame overlay.
- **Risk if ignored:** A failed first AI send leaves a stale PENDING request + lingering wide panel until reload.
- **Tags:** `#bug` `#editor` `#ai`
