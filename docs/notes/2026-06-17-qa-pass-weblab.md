# Weblab QA pass — 2026-06-17

End-to-end QA of project creation + editor + UX. Skills used: `qa`,
`ux-assesment` (subagent), `bug-hunt` (subagents). Method: 3 parallel
code-reading subagents (Sonnet) + live probes (WebFetch, weblab-agent MCP,
gstack browse).

## TL;DR

- **Live authenticated QA could not run autonomously** — three environment
  blockers (agent token dead, Playwright not installed, app is Clerk-gated).
  Public marketing landing is healthy. See "Blockers" below.
- **No new code defects were introduced; one real bug was fixed** (project-name
  over-count) with an offline test.
- The agents' two "BLOCKER" string-leaks were **over-rated** — branch-fork shows
  a generic toast (no leak), publish leak is gated unreachable. Verifying
  reachability before fixing mattered.
- The genuinely dangerous defect is **preview-down silent edit loss** (logged to
  BACKLOG, needs live repro + a careful fix).

## Capability / coverage

| Path | Could test? | Result |
|------|-------------|--------|
| Public landing (`weblab.build`) | ✅ WebFetch | Healthy, real content |
| Blank create | ⚠️ code-only | Working path; fixed name bug; reliability gaps logged |
| Clone / GitHub import / AI-prompt create | ⚪ disabled-by-design | Gated on Vercel (`TODO(sandbox-port)`/`sandbox-fork`); not bugs |
| Editor (canvas, code, design sync, file ops) | ⚠️ code-only | Bug-hunted; data-loss + preview-down risks logged |
| Responsive / multi-page | ❌ | Needs live authed session |
| Publish / commit / CMS | ⚪ disabled / code-only | Publish disabled (`TODO(publish-vercel)`); surfaced cleanly |

## Blockers to live authenticated QA

1. `weblab-agent` MCP → `[AUTH_FAILED] invalid or missing agent token`. No live
   API signal, even read-only. (Per memory the agent API is dev-only /
   prod unconfigured.)
2. gstack `browse` → Playwright chromium not installed (`npx playwright install`).
3. App create/editor/preview are Clerk-gated → unreachable headless without a
   logged-in browser session (CDP mode against a real Chrome, or a cookie export).

## Findings (severity-ranked)

All non-trivial items are logged in [BACKLOG.md](../../BACKLOG.md) with file
refs and next steps. Summary:

| Sev | Finding | Status |
|-----|---------|--------|
| 🔴 Blocker | Preview-down (`SANDBOX_NOT_LISTENING`): ~90s silent dead-end, then false-recovery silently discards all edits (no edit-channel health indicator) | Logged — needs live repro + careful fix |
| 🟠 High | Hero AI-prompt dead-end + "Start blank" visually buried (new-user first-action looks broken) | Logged — needs visual verify |
| 🟠 High | Create reliability: orphaned project rows on scheduler failure; orphaned **paid** VM on 45s provision timeout (no SDK abort); zombie terminal processes | Logged — confirm lines first |
| 🟡 Med | Editor style-write data loss via single shared rebase debounce; async sync-engine init has no serialization guard | Logged — **do not fix blind** (core live-sync) |
| 🟡 Med | Project-name over-count (`startsWith`) inflated `(N)` suffix | **FIXED this commit** + offline test |
| ⚪ Info | Publish button hidden (`null`) when `!canPublish` | **Intentional** (explicit reasoned comment) — not a bug |
| ⚪ Info | Branch-fork / publish internal-string leaks | Over-rated: branch-fork shows generic toast; publish leak gated unreachable |

## Fix shipped

`_countProjectsByNamePrefix` (convex/projects.ts): prefix `startsWith` →
exact-base-or-numbered-sibling regex (escaped). Offline-verified: a workspace
with `Jun 1`, `Jun 10/11/19`, `Jun 1 (2)/(3)` went from a wrong count of 6
(next name `(7)`) to the correct 3 (next name `(4)`). Stale `TODO(bug-hunt)`
comment updated to note the residual same-tick/gap race.

## Iteration 2 (2026-06-17, scheduled wake)

**Blockers:** weblab-agent token still `AUTH_FAILED`. gstack `browse` still
broken (its vendored Playwright wants chromium-shell **1217**, system has
**1223**) — but **direct Playwright works** (1223 installed), so public-surface
live QA is now possible. Authed app still needs a logged-in browser.

**Live public QA (direct Playwright vs live `weblab.build`):**

- Landing renders cleanly at 1440 / 768 / 375; **0 console errors**.
- ✅ unauth `/projects/new` → clean redirect to
  `/sign-in?returnUrl=%2Fprojects%2Fnew` (returnUrl preserved); sign-in page
  renders well (Google/GitHub/Vercel + email).
- 🟠 **1 page error: React hydration #418** on the landing — logged to BACKLOG.
- 1 benign `ERR_ABORTED` on a `/projects?_rsc=` prefetch.

**Agent claims corrected this iteration (verified against source):**

- `StartBlank` (hero) is **dead code** — no importers. The real blank CTA is in
  `project-chooser-cards.tsx`. The iter-1 "Start blank buried" critique targeted
  unused code.
- The UNAVAILABLE create error surfaces via the `<CreateError>` banner **with a
  Retry** (create-error.tsx) — not a bare dead-end toast.
- `_provisionSandbox` handles **all** provision-time failures via `markFailed`
  (writes `_markProvisioningFailed`). The orphan gap is narrower than iter-1
  implied: only if the `scheduler.runAfter` call itself throws after the insert
  commits.

**Fixed + verified:** `UNAVAILABLE_MESSAGE` copy (manager.ts) — dropped internal
jargon ("sandbox layer is being migrated to Convex") and pointed users to the
working blank path. `bun typecheck` exit 0 (covers both iter-1 + iter-2 edits).

## Iteration 3 (2026-06-17, scheduled wake)

**Blocker:** weblab-agent token still `AUTH_FAILED`. No code fix shipped this
pass — output is diagnosis + verified bug logging (shipping a blind,
live-unverifiable editor fix would be lower quality than logging it).

**Hydration #418 — thorough diagnosis, not pinned (logged):** ruled out, on the
*reachable* landing tree, `unicorn-background` + `promo-banner` (both
mount-guarded), `changelog-grid` (date-fns deterministic), and
`feature-blocks/ComponentsBlock` (dead — only on `/landing-old`). A live
Playwright DOM scan found no reparenting nesting (`a a`, `button button`,
`p>div`). Needs the React component stack from a non-minified build — logged
with that next step.

**Editor bug-hunt (focused subagent, 39 tool-uses, read-confirmed):** 12
findings logged to BACKLOG, top 3:
- HIGH — CMS `bind-dialog` reads `selected[0]` every render → can save a REPEAT
  binding onto the wrong (non-list) element.
- HIGH — directory rename calls `moveFile` not `moveDirectory` → OID index
  goes stale, canvas can't resolve elements under the renamed dir.
- HIGH — CMS binding re-save drops previously-saved `filters` (whole-doc
  overwrite).

**Dead code found:** `/landing-old` route + `home-page-client-old` + V1
`what-can-weblab-do-section` + `ComponentsBlock` + `_demo-backup-20260605/`.
Logged as a cleanup candidate (don't delete unilaterally — confirm `/landing-old`
isn't an intentional reference route first).

## Next iteration

1. Clear a live-QA blocker (token refresh, or a Chrome logged into weblab.build).
2. Get the #418 component stack from a non-minified build / `onRecoverableError`.
3. Once authed: fix CMS bind-dialog stale-target + directory-rename OID bugs and
   verify in the editor; exercise blank-create → editor → design-sync →
   responsive live.
