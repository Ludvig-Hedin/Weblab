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

## Iteration 4 (2026-06-17, scheduled wake)

**Blocker:** weblab-agent token still `AUTH_FAILED`.

**Fixed + unit-test-verified + committed:** parser `displayClassValue`
(`responsive-classes.ts`) was missing the table-family / `flow-root` /
`list-item` display values that `removeUtilityClasses`'s strip set already
recognized — the asymmetry meant a rebase converted a clean `className="table"`
into the ugly arbitrary `[display:table]`. Added the 6 missing emit entries
(now symmetric with the strip set) + 2 regression tests. `bun test
responsive-classes.test.ts` → 17 pass / 0 fail.

**Retracted iter-3 finding:** the "directory rename → `moveFile` not
`moveDirectory`" bug is NOT reachable — `file-tree-node.tsx:71` blocks directory
rename; page moves already use `moveDirectory`. Logged as not-a-bug.

**Untouched-area bug-hunt (subagent — auth / billing / chat / breakpoints):**
logged to BACKLOG. Highest-value: segment error boundaries
(`projects/error.tsx`, `project/[id]/error.tsx`) dead-end users on token expiry
with no re-auth path (mirrors the already-fixed root boundary) — best next fix.
Plus pricing double-submit + raw error strings, and corroboration of the iter-1
shared-debounce style-write data loss.

**Parser note:** `bun --filter @weblab/parser typecheck` is red on
*pre-existing* issues (cross-package `--jsx` config, `Object.groupBy`/es2024 lib,
a `CodeActionType` test mismatch) — unrelated to this change; the repo gate is
the web-client-scoped `bun typecheck`.

## Iteration 5 (2026-06-17, scheduled wake)

**Blocker:** weblab-agent token still `AUTH_FAILED`.

**Fixed + typecheck-verified + committed:** the auth **segment** error-boundary
dead-ends. A Convex `UNAUTHORIZED` (expired session) thrown under `/projects` or
`/project/[id]` was caught by the segment boundary *before* the root boundary's
re-auth redirect could fire → user stranded on a card with no sign-in path.
Extracted the proven root-boundary logic into a shared
`useErrorBoundaryAuthRedirect` hook (faithful copy — root file left untouched)
and wired it into both segment boundaries; a confirmed signed-out session now
bounces to `/sign-in?returnUrl=…` and stale-chunk crashes self-recover.
`bun typecheck` exit 0. (Not unit-tested: the analogous root boundary isn't
either — Clerk/`window` deps; verification is the faithful mirror + typecheck.)

**Assessed, deferred (payment code, not live-verifiable):** pricing `pro-card`
double-submit. The earlier "set the flag first line" suggestion is insufficient
(React state isn't a synchronous guard) — corrected the backlog to specify a
`useRef` in-flight guard.

**Untouched-area bug-hunt (component system / wireframes / copy-to-figma):**
logged to BACKLOG. 3 new BLOCKERS — parser writes `"[object Object]"` on HTML
prop-reset (strongest verifiable next fix), copy-to-Figma loses the user-gesture
activation window (clipboard write after an await), and the wireframe route maps
every SSR error (incl. auth) to "not found".

## Next iteration

1. Clear a live-QA blocker (token refresh, or a Chrome logged into weblab.build).
2. Fix the parser `[object Object]` HTML prop-reset BLOCKER (unit-testable).
3. Get the #418 component stack from a non-minified build / `onRecoverableError`.
4. Once authed: verify the logged CMS / chat / billing / figma bugs in-editor.

---

# Session Summary (capstone, 2026-06-18)

End-to-end QA campaign run as a self-paced loop (iters 1–16 + two foreground
rounds). Every fix below was read-and-confirmed real + reachable before any code
change, verified (typecheck / test / lint, and live where possible), and
committed file-scoped alongside an active parallel agent (never `git add .`).

## Connected user flow — VERIFIED end-to-end (live, authed)
`sign-in → dashboard → /projects/new → Start blank → Next.js → create → editor
opens → preview renders ("Hello from Weblab") → select element → design panel
(reads source classes) → change padding → source written + sandbox hot-reload →
preview + Tablet frame update`. Confirmed iter-12 with the preview-affecting
fixes (CSP, saveCanvas) in place; later fixes are in unrelated areas, so no
regression. (The recurring preview failure under load was a multi-agent session
collision — UNAUTHORIZED invalidating the shared QA token — NOT a product bug.)

## Access unblock (durable, dev-only) — commit `d71911163`
Root-caused `[AUTH_FAILED]` (the weblab-agent MCP token wasn't in Claude Code's
launch env; backend already configured). Documented + tooled two routes in
`docs/agent-context/agent-qa-access.md`: (1) the read-only agent API, (2)
`scripts/qa/auth-setup.mjs` — localhost Clerk dev keys + `+clerk_test` email +
OTP `424242` → reusable Playwright storageState for full authed editor QA.

## 12 fixes shipped (all verified)
| # | commit | area | fix |
|---|--------|------|-----|
| 1 | `fcd6a610a` | create | exact-match blank-project name dedup (was over-counting via `startsWith`) |
| 2 | `bb330a79f` | create | de-jargon the unavailable-create message |
| 3 | `b0a26de72` | parser | emit bare `table`/`flow-root`/`list-item` display utilities on rebase (+ tests) |
| 4 | `8424ce7ab` | auth | re-auth redirect for segment error boundaries (no dead-end on token expiry) |
| 5 | `b6da02251` | parser | HTML prop-reset removes the attr instead of writing `"[object Object]"` (+ test) |
| 6 | `f9c66d8e0` | editor | keep `saveCanvas` debounced so `clear()` can `.cancel()` (MobX annotation) |
| 7 | `165eb1dab` | dev | derive editor sandbox-WS origin in the dev CSP from `NEXT_PUBLIC_SANDBOX_SERVER_URL` |
| 8 | `12f95012c` | parser | `getTemplateNodeChild` resolves the target sibling's oid or null (+ tests) |
| 9 | `ad282b794` | wireframe | `ensureDoc` failure surfaces an error + retry (was infinite "Preparing…") |
| 10 | `78fbe8158` | wireframe | `handleSaveApply` error/busy handling + disabled button |
| 11 | `96e50d61f` | git | synchronous `useRef` double-submit guard on commit/PR `handleContinue` |
| 12 | `bdd2494ce` | billing | synchronous `useRef` double-submit guard on pricing `handleCheckout` (double-charge) |

Highest-impact: #7 + #6 jointly unblocked the local editor preview (the
`SANDBOX_NOT_LISTENING` from earlier iters was a local :8080/Open-WebUI port
conflict + a CSP that hardcoded :8080 — NOT product code). #11/#12 close the
double-submit class (create/commit/billing).

## Findings corrected (verified NOT real / collision-only)
- figma-clipboard version-skip — test-only decode path, no production caller.
- `getTemplateNodeChild` "writes to LAST sibling" — misread; only the no-oid edge was real (fixed).
- "Access denied on freshly-created project" — multi-agent collision, did not reproduce isolated.
- Shared-debounce "all rebases" scope — upstream `scheduleSourceRebase` is already per-key.

## Deferred (one item)
**Responsive-debounce data loss** (`editor/code/index.ts:276` `writeResponsiveStyle`
shared 600ms debounce): real but narrow (editing 2+ properties within 600ms on a
non-default breakpoint drops the earlier responsive write). Core live-sync code;
NOT fixed because it needs a live-verifiable approach (responsive multi-property
editing) that the session collision blocks. Precise lowest-blast fix plan logged
in BACKLOG (`runSourceRebase` → undebounced `writeResponsiveStyleNow`).
