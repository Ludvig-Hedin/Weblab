# QA Loop Campaign — Summary (2026-06-20 → 06-21)

A 19-iteration autonomous `/loop` end-to-end QA campaign over weblab.build:
project creation, editing, auth, offline, security, SEO. Code-path QA +
adversarial subagent verification.

**Session constraint (applies to every finding below):** no live browser (Chrome
extension not connected) and the weblab-agent API returned `AUTH_FAILED`, so
**nothing here is click-tested** — all of it is code-verified. A live-browser
pass is the outstanding verification gap (see Open Items).

**Regression check (iter-19):** `bun typecheck` exit 0; parser suite 210/210;
offline write-queue suite 8/8. All fixes collectively green.

---

## Shipped fixes (30) — by area

**Project creation / onboarding**
- `66531af89` provisioning-failure now routes to an honest error + Retry (was an
  eternal spinner / blank shell); blank-create loader no longer marks "Preparing
  workspace" done while still provisioning.
- `1699a2dee` hero prompt box shows example chips (was a blank box for newcomers).

**Editor — design panel / canvas / code**
- `f6b2c8ea0` bg gradient→image switch clears the residual gradient; unknown file
  types render plain (no false TS error squiggles).
- `ec3a31f68` number inputs (icon-number-input, mode-number-cell) no longer
  clobber an undo/selection change on blur; page/folder delete now confirms.
- `fa855494b` stale layer-row hover/click no longer corrupts selection onto
  `<body>` (getElementByDomId body-fallback guard).

**Editor — clone / CMS / commit / publish**
- `66531af89` clone dialog extracts the real ConvexError on prod + stops
  misclassifying permanent errors as retryable.
- `14e7c3341` commit "Continue" disabled until git status loads; CMS source
  Sync/Test tracked per-source (`Set`) — concurrent ops don't clobber each other.
- `77018aee7` CMS sync surfaces per-collection failures (was a green toast hiding
  them); CMS field reorder double-click guard; publish Live/Update label baselined
  at deploy (was stuck on "Update"). **+ delivered the prioritized UX audit:**
  `docs/notes/ux-audit-2026-06-20.md`.
- `1699a2dee` CMS Fields dead-end now has a "Back to Collections" CTA.

**Auth**
- `8a715c217` 5 create/import layouts preserve the deep-link `returnUrl` through
  sign-in (was dropping users on /projects); sign-in self-loop guard now covers
  `/sign-in/*` + `/sign-up/*` sub-paths.
- `d500d1ad3` added `loading.tsx` to 5 auth-gated segments (no more blank flash).

**Security** 🔒
- `5257a8c57` (1) **privilege escalation closed:** an admin could mint workspace
  OWNERS via `inviteCreate` (role accepted `owner`, `inviteAccept` inserted it),
  bypassing owner-only `transferOwnership` — added the same guard `updateMemberRole`
  has. (2) **secret leak closed:** `deployments.getByType`/`list` (gated on
  `project.view`) returned plaintext `envVars` (API keys/tokens) to any
  collaborator — stripped at the query boundary.

**Offline / sync** (data-loss)
- `4fa3a101b` **write-queue concurrent same-path writes now coalesce** (were
  leaving duplicate records → queue bloat + spurious replay conflicts) — fixed via
  enqueue serialization, **test-backed** (failing-first → passing).
- `e55ea0151` **replay watcher-race fixed:** a write made during the reconnect
  replay window could be silently dropped (watcher stopped by an async reaction
  racing `replayQueue`) — now stops the watcher synchronously before replay.

**AI / chat, settings, SEO, desktop**
- `daddea630` chat summarize retries after a failure (cooldown cleared on every
  non-success path, concurrency guard kept); custom-domain removal now confirms.
- `3f3afaadc` sitemap: added 5 live routes it was missing (incl. the uncrawlable
  `claude-opus-4-8` blog post).
- `c73279c75` local projects no longer dead-navigate from the Recent Projects
  carousel or the Cmd-K palette in the browser.

**Tests added**
- `a78d2e6bc` `packages/parser/test/insert.test.ts` — locks paste-oid correctness.
- `4fa3a101b` extended `test/offline/write-queue.test.ts` — concurrent-enqueue +
  dead-letter idempotency.

---

## Refutations — the campaign's highest-value behavior

~15 subagent "findings" were **refuted on verification** — several would have
introduced regressions had they been applied blind:

- **Billing:** a "free-tier cap bypass" (`?? 1` → `|| 1`) would have BROKEN the
  intended real-token-cost accounting (unpriced/local models are deliberately
  free; `freePlanUsage` has no type filter, so a naive wireframe rate-limit via
  `usageRecords` would also charge the message cap).
- **Auth:** `inviteAccept` "apply role on re-accept" would have opened a
  guard-bypassing role-change path (same escalation class as the real bug).
- **Parser:** namespaced-component + paste double-oid were non-bugs (componentStack
  never holds dotted names; `getAstFromCodeblock(…, stripIds=true)` strips the
  source id).
- **Offline:** dead-letter "clobber" is idempotent; stranded `suppressSyncInit`
  can't happen — a `finally` already guarantees `resumeSync`.
- Others: no-oid optimistic divergence, responsive source-drop, filewatcher
  "AI edits don't refresh", CanvasErrorBoundary copy, chat infinite-spinner,
  deploy-failure toast, hero PLAN-mode prompt-loss, FileTree onRefresh,
  theme-toggle data-loss, add-breakpoint gating, frame-deselect breakpoint,
  sanitizeReturnUrl consolidation.

**Recurring lesson:** at least 5 "leads" overlooked an **existing guard** (a
`try/finally`, an oid check, a `stripIds` flag, a credit-cap design comment, a
self-loop guard). Reading the surrounding rationale + tracing the data flow
before acting was worth more than the raw fix throughput.

---

## Open items

**Owner-gated (need a decision/investment, not another hunt):**
1. **Wireframe spend exposure** — `convex/wireframeActions.ts` runs ~3 gpt-5 calls
   per click with no rate-limit. A PURE rate-limit needs a DEDICATED table (NOT
   `usageRecords`, which would charge the message cap). Ready to build on a yes.
2. **Live-browser offline→online reconnect pass** — the 2 offline data-loss fixes
   (iters 16-17) are reasoned, not click-tested. This is the clearest verification
   gap in the whole campaign.

**Deferred (need a test harness / editor-capable session):**
- Route-group / `.jsx` page FS-path bug (`pages/helper.ts`) — real, multi-helper
  fix, can't integration-test headless (full design recorded in BACKLOG iter-4).
- Editor-history leads (coalesce-by-type, redo-action aliasing) — no test harness.

**Minor / logged:** `sw.js` preload cache-first (jsDelivr-pinned, risky sw change);
git-tab field-clear; assorted CMS/UX polish (see BACKLOG + the UX audit doc).

---

## Recommendation

The autonomous broad-hunt loop has **extracted its available value**: the cheap
real bugs were fixed early (iters 1-8), the offline subsystem was mined deeply
(iters 16-18), and recent iterations mostly refute or log-as-risky. Continuing
substantively requires an **owner decision**: build the wireframe rate-limit, do a
live-browser pass, redirect to a named area, or wind the loop down. Absent a
steer, **winding down is the honest call** rather than running more dry hunts.
