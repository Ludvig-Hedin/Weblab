# Hero create flow: AI-prompt dead-end + "Start blank" is visually buried

- **Discovered:** 2026-06-17 (QA pass — UX assessment, 32-tool-use subagent, higher confidence)
- **Where:** `apps/web/client/src/app/_components/hero/create.tsx` (AI input + UNAVAILABLE toast path, ~line 272); the hero "Start blank" button component; `apps/web/client/convex/projectActions.ts` create-cap gating
- **Symptom:** On Vercel the hero AI prompt input is the most visually prominent element but is non-functional — typing a prompt and submitting yields a developer-worded toast ("…sandbox layer is being migrated to Convex…") with **no forward action**, then the hero resets. The only working path, "Start blank", is rendered as low-weight `text-foreground-secondary` link-style text below the pill buttons — easy to miss. New users hit a dead end on their most likely first action.
- **Next step:** (a) Add a "Start blank instead" action button to the unavailable toast + rewrite the copy in user terms. (b) Elevate "Start blank" to an outline pill button matching the other CTAs. (c) Ideally render the AI input in a visibly-disabled "coming soon" state at render time (feature flag) instead of failing at submit. Verify visually once an authenticated browser session is available.
- **Risk if ignored:** High new-user bounce — first interaction looks broken and the working path is hidden.
- **Tags:** `#bug` `#ux` `#editor`
