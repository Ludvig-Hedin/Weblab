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

## Next iteration

1. Clear a live-QA blocker (token refresh, or CDP browser, or cookie export).
2. Exercise blank-create → editor → design-sync → responsive live.
3. Reproduce the preview-down edit-loss path, then fix with a toolbar
   edit-channel health indicator.
4. Re-verify the hero UX fixes visually before applying.
