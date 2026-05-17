# Workspaces — Rollout & QA Notes

This doc accompanies the Workspaces feature. It captures the deploy gates,
the manual + automated QA matrix, and the legacy-drop pre-flight.

## Migrations

| File | Phase | Idempotent | Reversible |
|---|---|---|---|
| `0034_workspaces_schema.sql` | 2 | Yes (IF NOT EXISTS guards) | Yes (drop new tables + columns) |
| `0035_workspaces_backfill.sql` | 2 | Yes (WHERE NOT EXISTS / IS NULL) | Yes (delete created personal workspaces) |
| `0036_workspaces_constraints.sql` | 2 | Yes (no-op consistency check) | Yes |
| `0037_workspaces_drop_legacy.sql` | 9 | NO — drops columns + enum | **Irreversible** |

Apply 0034 → 0035 → 0036 together at deploy. Apply 0037 only after the
soak gates below pass.

## Soak gates for 0037

Run **all** of the following before applying `0037_workspaces_drop_legacy.sql`:

1. Workspace feature has been in production for ≥ 1 week with zero rollback.
2. CI grep: no source files import `ProjectRole` (the legacy enum) — only
   `ProjectMemberRole`.
3. Telemetry / log scan confirms zero `project_role`/`OWNER`/`ADMIN` enum
   reads from deployed bundles.
4. Snapshot of `(user_id, project_id : has_view)` set is identical to the
   post-0035 baseline (no access widening).

## QA matrix

The matrix is encoded as a unit test in `packages/auth/test/can.test.ts`
(18 assertions covering every workspace × project role combination
against every capability). That test is the canonical truth table.

Manual smoke checklist (run on staging after each deploy):

- New user signup creates a single personal workspace named `<displayName>'s Workspace`.
- Existing user has exactly one personal workspace after migration.
- `/projects` redirects to `/w/{personalSlug}/projects`.
- Workspace switcher lists exactly the user's memberships; personal first.
- Create team workspace → caller becomes owner.
- Invite teammate → email sent → accept lands in members list.
- Last owner cannot remove or demote self.
- Restricted projects hidden from non-explicit workspace members.
- Workspace owner/admin always sees restricted projects (recovery).
- Project-only invitee: only the shared project visible; workspace
  settings 404 on direct URL.
- `projectRouter.update` / `delete` reject viewer/reviewer with FORBIDDEN.
- `projectRouter.setAccessMode` only works for project managers + workspace owner/admin.
- Invite state machine: pending → accepted, pending → revoked blocks accept,
  pending → expired blocks accept.

## Known follow-ups

These were intentionally deferred to a follow-up PR:

- Migrate `routers/cms/*`, `routers/publish/*`, `routers/comment/*`,
  `routers/chat/*` writes from the `verifyProjectAccess` shim (currently
  gated as `project.view`) to explicit `project.update` / `project.publish`
  / `project.comment` / `project.use_ai` caps. The shim already denies
  unrelated users; the gap is between same-workspace roles.
- Wire `useProjectCapabilities` into the editor's MobX engine so write
  affordances (Publish, Invite, Delete, AI composer) hide for viewers.
  Hook is shipped; consumers need to import it.
- Migrate `/project/[id]/_components/members/*` invite popover UI to use
  the new `ProjectMemberRole` enum (manager/editor/reviewer/viewer) — UI
  still references the legacy `ProjectRole` enum strings. Server-side
  dual-write keeps both columns in sync, so this is cosmetic.
- Workspace ownership transfer flow (out of MVP).
- Audit log UI (table exists; surface deferred).
- Optional `/w/[slug]/projects/new` route — current new-project flow on
  `/projects/new` still works and lands the project in the caller's
  personal workspace via `resolvePersonalWorkspaceId`.
