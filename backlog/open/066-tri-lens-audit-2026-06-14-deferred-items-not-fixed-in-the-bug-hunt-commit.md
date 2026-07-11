# Tri-lens audit (2026-06-14) — deferred items not fixed in the bug-hunt commit

Source: `/assess-ux-of-main-user-flows` + `/ux-polish` + `/bug-hunt` workflow
(22 surfaces, adversarially verified). The 7 high-confidence, isolated bugs were
auto-fixed and committed. The items below are real (verified) but were deferred
because they touch foreign uncommitted files, are judgment calls, or are feature
gaps rather than mechanical fixes.

#### Middle-mouse pan release forces DESIGN instead of restoring prior mode

- **Discovered:** 2026-06-14 (tri-lens audit, bug-editor-ui-logic)
- **Where:** `apps/web/client/src/app/project/[id]/_components/canvas/index.tsx:278-280`
- **Symptom:** Middle-mouse drag-pan from PREVIEW/COMMENT/CMS drops the user into DESIGN on release (same class as the space-key bug just fixed in `canvas/hotkeys/index.tsx`).
- **Next step:** Mirror the hotkeys fix — capture `editorEngine.state.editorMode` in `middleMouseButtonDown` into a ref, restore it in `middleMouseButtonUp` instead of hardcoding `EditorMode.DESIGN`.
- **Risk if ignored:** Pan gesture silently changes editor mode; confusing for power users.
- **Deferred because:** `canvas/index.tsx` has uncommitted i18n edits from another session — fixing now would entangle the commit. Apply once that work lands.
- **Tags:** `#bug`

#### `updateDeploymentRow` conflates "error" and "not found" (both return null)

- **Discovered:** 2026-06-14 (tri-lens audit, bug-convex-billing)
- **Where:** `apps/web/client/convex/deployments.ts:234-246`
- **Symptom:** On a DB error the catch logs and returns `null`, the same value as "row not found". Callers can't distinguish a transient failure from a missing deployment.
- **Next step:** Let the error propagate (remove the catch) or return a discriminated result `{ ok: false }`; keep the `if (!existing) return null` not-found path.
- **Risk if ignored:** Deployment status polling may treat a DB hiccup as "deployment gone".
- **Deferred because:** Judgment call on caller contract, not a mechanical auto-fix.
- **Tags:** `#bug` `#tech-debt`

#### Project-wide search (Cmd+Shift+F) is a dead stub

- **Discovered:** 2026-06-14 (tri-lens audit, flow-power-editor)
- **Where:** `apps/web/client/src/app/project/[id]/_components/project-search/index.tsx:14-46`
- **Symptom:** The shortcut opens a panel that performs no actual project-wide text search; a power user expecting grep-across-files gets nothing.
- **Next step:** Either wire it to the file-system search or remove the affordance + shortcut until implemented.
- **Risk if ignored:** Advertised power-user capability is non-functional.
- **Tags:** `#bug` `#feature-gap`

#### Workspace billing nav points to global `/pricing`

- **Discovered:** 2026-06-14 (tri-lens audit, flow-settings-billing)
- **Where:** `apps/web/client/src/app/w/[slug]/settings/_components/settings-nav.tsx:26`
- **Symptom:** "Billing" in workspace settings links to `/pricing` (marketing) instead of a workspace-scoped billing page, dropping the user out of the settings context.
- **Next step:** Point to the workspace billing route (`/w/[slug]/settings/billing`) which already exists.
- **Risk if ignored:** Confusing billing navigation; user loses workspace context.
- **Tags:** `#bug` `#ux`

#### Stripe success callback doesn't close window or guide next step

- **Discovered:** 2026-06-14 (tri-lens audit, flow-settings-billing)
- **Where:** `apps/web/client/src/app/callback/stripe/success/page.tsx:11`
- **Symptom:** After checkout the success page neither auto-closes the popup nor offers a "return to app" action; user is stranded.
- **Next step:** Add `window.close()` (popup flow) or a clear CTA back to the editor/dashboard with a success toast.
- **Risk if ignored:** Post-purchase dead-end.
- **Tags:** `#ux`

#### Publish button "Live"/"Update" state derived from undo history, not real change tracking

- **Discovered:** 2026-06-14 (tri-lens audit, flow-import-publish + polish-topbar)
- **Where:** `apps/web/client/src/app/project/[id]/_components/top-bar/publish/trigger-button.tsx:39-43`
- **Symptom:** The button decides "Live" vs "Update available" from undo-stack depth rather than a diff against the published deployment, so it can show stale/incorrect state (e.g. after undoing all edits, or across reloads).
- **Next step:** Track a real "dirty since last publish" flag (compare current source/commit to the last successful deployment).
- **Risk if ignored:** Users can't trust whether their site has unpublished changes.
- **Tags:** `#bug` `#ux`

#### New-user "Create" intent lost across the signup pipeline

- **Discovered:** 2026-06-14 (tri-lens audit, flow-new-user — highest-impact UX finding)
- **Where:** `hero-v2.tsx:30-41` → `sign-in/verify/page.tsx:217-222` → `profile-setup/page.tsx:65-76` → `_components/hero/create.tsx:112-120`
- **Symptom:** A brand-new user who types a prompt and hits "Get started" completes sign-up + profile-setup and lands on `/projects`, NOT `/projects/new?resumeCreate=1`. Their typed prompt (saved in localForage) is orphaned and the create intent is lost.
- **Next step:** Thread `returnUrl` through the whole auth pipeline; after profile-setup, redirect new sign-ups with a saved draft to `/projects/new?resumeCreate=1`. (Note: `profile-setup` redirect can also resolve to `null` when `sanitizeReturnUrl` returns null — verify `router.replace` never receives null.)
- **Risk if ignored:** First-run users lose their first prompt — direct hit to activation.
- **Tags:** `#bug` `#ux` `#activation`
