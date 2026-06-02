# Agent prompt — Publishing controls: Website password · Make staging private · 301 redirects · Forms

You are adding four publishing/serving-related controls to **project settings** in the Weblab editor. **Read this whole prompt before writing code.** All four share one hard constraint, so the recommended approach is "persist now, enforce when publishing lands."

## Hard constraint — read first

**Publish/serving is currently disabled on Vercel** (`TODO(publish-vercel)` in [CLAUDE.md](../../CLAUDE.md) and [docs/notes/2026-05-13-vercel-sandbox-provider.md](../notes/2026-05-13-vercel-sandbox-provider.md)). There is **no running served site** to attach an auth gate, honor a redirect, or receive a form POST. Therefore:

- **Do NOT** ship dead controls that claim to protect/redirect/capture but silently do nothing.
- **DO** persist each setting in Convex and render a clear "Applies once your site is published" hint, so the UI is ready and the value survives until the publish pipeline can read it.
- For **Forms**, prefer recommending a third‑party embed (works on the served site with no backend from us) over building a capture backend that can't run.

## Where things live (study these first)

- Settings tabs registry + enum: [with-project.tsx](../../apps/web/client/src/components/ui/settings-modal/with-project.tsx), [helpers.tsx](../../apps/web/client/src/components/ui/settings-modal/helpers.tsx) (`SettingsTabValue`). New tabs are registered in `projectTabs`; the sidebar label is `tabLabel(tab.label)` (special-case acronyms there).
- The **Domain & Publishing** tab is [settings-modal/domain/](../../apps/web/client/src/components/ui/settings-modal/domain/). `preview.tsx` already owns the staging (preview) subdomain. `danger-zone.tsx` owns unpublish.
- Convex domain backend: [convex/domains.ts](../../apps/web/client/convex/domains.ts), [convex/domainActionsDb.ts](../../apps/web/client/convex/domainActionsDb.ts) (`_previewCreate`), schema `previewDomains` / `projectCustomDomains` / `projects` in [convex/schema.ts](../../apps/web/client/convex/schema.ts).
- **`pageAccess` table already exists** in the schema with `pagePath`, `accessType` (`vPageAccessType`), and `passwordHash` — this is the seed for password/private. Check how `vPageAccessType` is currently used before extending.
- Convex patterns: a per‑project query/mutation guards with `requireCap(ctx, 'project.update' | 'project.publish', { projectId })`. Extract any pure validation into `convex/lib/*.ts` and unit-test it (see [convex/lib/previewSlug.ts](../../apps/web/client/convex/lib/previewSlug.ts) + its `.test.ts` as the reference pattern).
- After any Convex schema/function change: run `npx convex codegen` then `npx convex dev --once` to push to the dev deployment.

## What to build

### 1 + 2. Website password & Make staging private
Both are an **auth gate on the served site** — the same mechanism, different scope (custom domain vs staging subdomain).
- **Persist:** add fields to the project's domain/access model. `pageAccess.passwordHash` exists for path-level; for site-level, store a hashed password (bcrypt/argon via a Convex action — **never store plaintext**) + a `stagingPrivate: boolean`. Add the mutation under `convex/domains.ts` (or a new `convex/access.ts`) guarded by `project.update`.
- **UI:** in the Domain tab, a "Password protection" section (toggle + password input, masked, with a "set/clear" affordance) and a "Make staging private" toggle. Show the "applies once published" hint.
- **Enforcement (deferred):** when publish lands, the serving layer (middleware on the deployed app, or the hosting edge) must check the gate. Leave a `TODO(publish-vercel)` where enforcement will hook in, and a BACKLOG note.

### 3. 301 redirects
- **Persist:** a `redirects` list per project — `{ from: string; to: string; permanent: boolean }[]`. New Convex table `projectRedirects` (or a JSON field on `projects`). Validate `from`/`to` are paths/URLs; dedupe `from`.
- **UI:** a "Redirects" section in the Domain tab — add/edit/delete rows (from → to, permanent toggle).
- **Effect (deferred):** redirects must be written into the user's `next.config` `redirects()` OR honored by the serving layer at publish time. Editing `next.config` via the parser is fragile — prefer emitting a generated redirects source the build reads, and wire it when publish lands. Document the chosen mechanism.

### 4. Forms
- **No form-capture backend exists**, and submissions require the served site to POST somewhere. Building this fully needs: a public ingest endpoint, a `formSubmissions` table, spam protection, and email/notification — out of scope until publish + a public API exist.
- **Recommended quick path:** add a small "Forms" section that lets the user configure a **third-party form provider** (Formspree/Tally/Basin) — store the endpoint/form ID + "sender name" + "send submissions to" (email) in Convex, and surface a copy‑paste snippet / guidance for wiring their form `action` to it. This works on the published site with zero backend from us.
- If a native forms backend is later desired, write a separate spec; do not stub it here.

## Acceptance criteria
- Each control **persists** to Convex (guarded by `project.update`) and reloads correctly.
- No control falsely implies it's enforcing something it isn't — every deferred-effect control shows the "applies once published" hint.
- Passwords are **hashed**, never stored or logged in plaintext; the input is masked.
- `bun typecheck` (0 errors) and `bun lint` (0 warnings on touched files); pure validation has unit tests.
- New tab/sections added to [docs/feature-catalog.md](../feature-catalog.md) + [docs/test-plan.md](../test-plan.md); deferred enforcement logged in [BACKLOG.md](../../BACKLOG.md).

## Gotchas
- The settings modal runs with the editor engine available (`useEditorEngine()`), so `editorEngine.activeSandbox.writeFile` is usable if you choose the "write into project" route for redirects.
- Don't reintroduce a multi-provider sandbox abstraction; Vercel Sandbox is the sole runtime.
- Buttons must use `@weblab/ui/button`; inputs `@weblab/ui/input`; follow the existing tab layout (`divide-border flex flex-col divide-y px-6`, section `space-y-4 py-6`, `text-largePlus` title + `text-foreground-secondary` subtitle).
