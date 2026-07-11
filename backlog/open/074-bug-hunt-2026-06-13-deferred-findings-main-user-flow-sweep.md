# Bug-hunt 2026-06-13 — deferred findings (main-user-flow sweep)

- **Discovered:** 2026-06-13 (full bug-hunt across create/dashboard, editor load, chat/AI, auth/settings, CMS/pages; ~25 bugs fixed in the same session — see feature-log)
- **Where / Symptom / Next step:** each item also has a matching `TODO(bug-hunt)` comment in code:
  1. **Route-group page CRUD broken** — `apps/web/client/src/components/store/editor/pages/helper.ts` (`getRouteDirectoryPath`): scan strips `(group)` segments from node paths, but CRUD rebuilds FS paths as `basePath + route`, so delete/rename/move/metadata fail with "Page not found" for `app/(marketing)/about/page.tsx`. Fix: store the real FS-relative path on `PageNode`. `#bug`
  2. **Hardcoded `page.tsx`** — same file (`getPageFilePathForRoute`, non-dir delete): scanner accepts `page.{tsx,ts,jsx,js}` but ops assume `.tsx`; `.jsx/.js` pages in imported projects fail. `#bug`
  3. **CMS wizard slug bypass** — `apps/web/client/convex/cmsActionsInternal.ts` `_wizardCreateCollection`: no `validateSlug`/dup check → duplicate or empty slugs from remote type names. `#bug`
  4. ~~**Interrupted-stream recovery regenerates the wrong turn**~~ FIXED same session (second pass): pending turn now persisted alongside the inflight flag and re-sent when absent from hydrated history; also fixed recovery never firing at all (status effect cleared the flag on mount before the recovery effect read it — now snapshotted in `useState` initializers). `use-chat/index.tsx` + `queue-storage.ts`, tests in `test/chat/queue-storage.test.ts`.
  5. **Conversation-summary cursor invalidated every turn** — `convex/messages.ts` `replaceConversationMessages` re-mints `_id`s, so `summarizedUpToMessageId` misses after reload → silent full-context sends + repeat summarize credits. Fix: stable cursor (index/hash) or stable ids. `#bug`
  6. **User-delete cascade orphans sole-member team workspaces** — `convex/internal/cascade.ts`: only `personal` workspaces cascade; a zero-member team workspace becomes unreachable/undeletable with orphaned projects. `#bug`
  7. ~~**Expired-pending re-invite blocker (project invites)**~~ FIXED same session (second pass): `_validateAndInsert` now treats pending-but-expired rows as non-conflicting and flips them to `EXPIRED` (mirrors `workspaces.inviteCreate`).
  8. **`projects.list` truncates before sorting** — `convex/projects.ts`: 200-row take in membership-index order before `updatedAt` sort; >200-membership users can lose recent projects. `#bug` (low)
  9. **`createFromGit` framework mismatch** — `convex/projectActions.ts`: validator accepts vite/remix/astro/tanstack but provisions nextjs while persisting the requested framework (latent foot-gun, no current template hits it). `#tech-debt`
  10. **Blank-project `(N)` suffix prefix collision** — `convex/projectActions.ts`: `startsWith` makes "Jun 1" match "Jun 10–19" (cosmetic). `#tech-debt`
  11. **VercelBrowserTask drops branch `port`/`devCommand` on boot** — `store/editor/sandbox/vercel-browser-provider.ts` `getTask`: boot path calls `sandbox.setup` without them; package.json inference is the only fallback → wrong port → 502 for custom dev commands. Needs a server-contract decision. `#bug`
  12. **Chat `FIX`/`CREATE` turns unmetered** — `api/chat/route.ts`: only `ChatType.EDIT` increments usage; may be intentional product choice — confirm or meter. `#tech-debt`
- **Pre-existing test failures noticed during validation (not from this session):**
  - `@weblab/backend` `test` script is stale — `cd supabase/functions/api` no longer exists → root `bun run test` always exits 1. Fix or remove the script. `#infra`
  - web-client `test/messages.test.ts` i18n key parity fails (12 keys missing vs `en`) and `test/frame/preload-script.test.ts` fails ("No layout files found in src/app" fixture issue). `#test-gap`
- **Risk if ignored:** items 1/4/5 are silent data-or-cost losses in primary flows; the stale backend script masks real test regressions at the root gate.
- **Tags:** `#bug` `#test-gap` `#infra`
