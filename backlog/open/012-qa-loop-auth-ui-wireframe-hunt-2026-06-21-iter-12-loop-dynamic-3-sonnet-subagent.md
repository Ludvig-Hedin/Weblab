# QA loop — auth/UI/wireframe hunt (2026-06-21 iter-12, /loop dynamic, 3 sonnet subagents) — 1 FIXED, 1 refuted, wireframe-RL re-analyzed, leads logged

> Fresh hunt of auth/session, editor left-panel tools, and the wireframe rate-limit feasibility. Shipped 1 clean editor fix; refuted a claimed drag bug (already guarded); **re-analyzed the wireframe rate-limit and found the subagent's proposal would cause a credit side-effect** (so still not a blind ship). Typecheck ✓.

**✅ FIXED (this commit):**
1. **`#editor` `#layers` — hovering/clicking a STALE layer row corrupted the selection onto `<body>`.** `left-panel/design-panel/layers-tab/tree/tree-node.tsx:134` `sendMouseEvent` guarded only on `!el`, but `getElementByDomId` falls back to `document.body` (not null) for a stale/removed domId, so `mouseover(el)`/`click([el])` fired on `<body>` → selection jumps to the whole page. **Fix:** added `|| el.domId !== node.domId` to the guard, mirroring the exact pattern already in `layers-tab/index.tsx:93` (handleDrop). 1-line.

**❌ REFUTED:**
- **layers-tab drag `-1` guard "reparents `<body>`"** — already guarded. `index.tsx:93,98` bail when `childEl.domId !== dragNode.data.domId` / `parentEl.domId !== parentNode.data.domId` (with an explanatory comment), so the stale-domId→body case can't reach the move. The subagent missed those guards.

**🚩 WIREFRAME RATE-LIMIT — re-analyzed; subagent's `reserveImage`-mirror proposal is UNSAFE as-is (would charge credits):**
- Inserting `'wireframe'` rows into `usageRecords` to count a rate-limit would COUNT AGAINST THE FREE MESSAGE CAP: `freePlanUsage` (`usage.ts:90-103`) queries `by_user_time` with `q.eq('userId', …)` only — NO type filter — and `sumUsageAmount` sums every row. So a free-tier user's wireframe gens would silently consume their 5/day, 50/month message budget. (`reserveImage` is fine only because images *intentionally* share the credit pool, line 512.) Also note the subagent's field names were wrong: real `usageRecords` fields are `timestamp`/`amount`, not `createdAt`/`tokens`.
- **Correct options (still need an owner call):** (a) a DEDICATED rate-limit table (e.g. `wireframeRateLimits` or `@convex-dev/rate-limiter`) that the credit caps ignore — pure abuse guard, no pricing side-effect; OR (b) the owner decides wireframe gens SHOULD cost credits, then the reserveImage pattern (with real fields) applies. Feature is reachable (unlisted page `/project/[id]/wireframe`, no flag) so the unbounded-spend exposure is real. **STILL OPEN, needs owner decision.**

**📋 LOGGED — leads (lower priority / multi-file):**
- `#auth` — `getSignInUrl()` is called with NO returnUrl in 5 layouts (`projects/new/layout.tsx`, `projects/import/{,local/,github/,figma/}layout.tsx`), so an unauthenticated deep-link to create/import lands on `/projects` after login instead of the intended page (sibling `projects/layout.tsx` correctly forwards `x-pathname`). Fix: pass `(await headers()).get('x-pathname')`. (5 files.)
- `#auth` (minor) — `sanitizeReturnUrl` only blocks exact `/sign-in`, not `/sign-in/verify` or `/sign-in/sso-callback` → a 2-hop post-login bounce; change to `startsWith('/sign-in/')`. Two divergent `sanitizeReturnUrl` impls (`utils/auth` returns `string|null` vs `utils/url` returns `string`) leave a dead null-branch — consolidate. Missing `loading.tsx` on `/sign-in/verify`, `/profile-setup`, `/w/new`, `/invitation/[id]`, `/invitation/workspace/[id]` (blank flash).
- `#editor` (minor) — layers eye-toggle desyncs after undo (`tree-node.tsx:256-261`, has a TODO; derive icon from the live style not `node.data.isVisible`); brand-tab rename context action doesn't auto-focus the Name input.

> Auth core verified SOLID: Clerk→Convex token gate, signing-out sentinel, per-segment UNAUTHORIZED boundaries, open-redirect sanitization. Editor insert/drag paths verified guarded (the drag refutation above).
