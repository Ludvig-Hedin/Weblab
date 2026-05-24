# Production Readiness Security Review - 2026-05-24

## Executive Summary

Recommendation: **do not release this build to production for real users yet.**

The application has several good security foundations: protected project routes,
Convex capability checks on most project data, signed Clerk and Stripe webhooks,
server-side admin gating, ignored local env files, and baseline security headers.
However, this worktree is not production-safe because the web app is pinned to a
Next.js version currently reported vulnerable by `bun audit`, the CSP allows
`unsafe-inline` and `unsafe-eval`, and several paid AI endpoints accept large
client-controlled payloads before invoking LLM providers. Those issues create
real exposure for public users and should be fixed before launch.

Scope reviewed:

- `apps/web/client` Next.js app, middleware, API route handlers, env schema, and
  security headers.
- `apps/web/client/convex` public Convex functions, authorization helpers, and
  HTTP webhooks.
- Dependency posture via `bun audit --audit-level=moderate`.
- Secret-file tracking/ignore posture for `.env*` files.

Important limitation: this is a source-level review plus dependency audit. It did
not include live production header checks, penetration testing, Clerk/Convex
dashboard configuration review, Railway edge/proxy configuration review, or
secret rotation history.

## Critical Findings

### SEC-001 - Vulnerable Next.js version in production app

- **Severity:** Critical
- **Rule:** NEXT-SUPPLY-001
- **Location:** `apps/web/client/package.json:93`
- **Evidence:**
  - `apps/web/client/package.json:93` pins `"next": "16.0.7"`.
  - `bun audit --audit-level=moderate` reports `next >=16.0.0 <16.2.5` with
    critical/high advisories, including RCE in the React Flight protocol and
    multiple Server Components / middleware / proxy issues.
  - NVD CVE-2026-29057 states Next.js versions before `16.1.7` are affected by
    request smuggling in certain rewritten proxy traffic and fixed in `16.1.7`.
- **Impact:** Public attackers may exploit framework-level vulnerabilities before
  application code runs. Because the app uses the App Router and middleware, this
  is a release blocker until Next.js is upgraded and the lockfile is refreshed.
- **Fix:** Upgrade `next` to a currently patched version, preferably at least
  `16.2.5` based on local audit output, then run `bun install`, `bun typecheck`,
  `bun lint`, and `bun --filter @weblab/web-client build`.
- **Mitigation:** If immediate upgrade is impossible, block affected request
  shapes at the edge/proxy and remove any risky rewrites, but this should be
  treated as temporary only.
- **False positive notes:** `next@16.0.7` is patched for the Dec 2025
  React2Shell advisory, but it is still below later patched ranges reported by
  the current audit.

## High Findings

### SEC-002 - Dependency audit has unresolved critical/high vulnerabilities

- **Severity:** High
- **Rule:** Supply-chain hygiene
- **Location:** `bun.lock`, workspace dependencies
- **Evidence:**
  - `bun audit --audit-level=moderate` returned exit code `1`.
  - It reported **94 vulnerabilities**: 2 critical, 43 high, and 49 moderate.
  - Critical/high packages include `next`, `underscore`, `axios`, `tar`,
    `@xmldom/xmldom`, `electron`, and `undici`.
- **Impact:** Some vulnerable packages may only affect development or desktop
  workspaces, but several are in the web-client dependency graph. A production
  release should not ship with known critical/high advisories unresolved or
  explicitly risk-accepted.
- **Fix:** Triage each advisory by production reachability, upgrade direct
  dependencies, use targeted overrides where appropriate, and re-run
  `bun audit --audit-level=moderate` until production-reachable critical/high
  findings are gone.
- **Mitigation:** If a vulnerable transitive dependency is not used in production
  runtime, document that with evidence and isolate it to dev-only workspaces.
- **False positive notes:** `bun audit` is intentionally broad across the
  monorepo; not every finding blocks the hosted web app, but the current `next`
  finding does.

### SEC-003 - CSP is too permissive for a real-user production launch

- **Severity:** High
- **Rule:** JS-XSS-003 / REACT-XSS-001 defense in depth
- **Location:** `apps/web/client/next.config.ts:108-128`
- **Evidence:**
  - `script-src` is configured as `"script-src 'self' 'unsafe-inline' 'unsafe-eval' https:"`
    at `apps/web/client/next.config.ts:116`.
  - The same app has many `dangerouslySetInnerHTML` call sites for JSON-LD,
    code highlighting, charts, and hotkey labels.
- **Impact:** If any XSS primitive lands in user-generated content, markdown,
  syntax-highlighted HTML, third-party scripts, or future UI code, the current
  CSP gives the browser much less ability to contain it. `unsafe-eval` also
  expands the impact of injected strings and compromised dependencies.
- **Fix:** Move toward nonce/hash-based scripts, remove `unsafe-eval` in
  production, inventory required third-party script hosts, and add a CSP report
  endpoint/report-only rollout before enforcement.
- **Mitigation:** Keep raw HTML rendering centralized and sanitized where input
  can be user-controlled. Avoid adding new `dangerouslySetInnerHTML` outside
  trusted constant JSON-LD or sanitized highlighter output.
- **False positive notes:** Some current `dangerouslySetInnerHTML` instances are
  safe constant JSON-LD, but the CSP is still not launch-grade defense in depth.

### SEC-004 - Chat endpoint accepts unbounded client-controlled message payloads

- **Severity:** High
- **Rule:** NEXT-INPUT-001 / AI spend abuse controls
- **Location:** `apps/web/client/src/app/api/chat/route.ts:127-136`,
  `apps/web/client/src/app/api/chat/route.ts:191-204`,
  `apps/web/client/src/app/api/chat/route.ts:342-368`
- **Evidence:**
  - `messages` is validated as `z.array(z.any()).min(1)` with no max count,
    per-message byte cap, total byte cap, or typed part schema.
  - The parsed `messages` array is passed into `buildChatRequest`.
- **Impact:** Any authenticated user can send very large or deeply shaped JSON to
  an expensive AI route. Existing usage checks meter count-based limits, not
  input size or cost. This can cause high provider spend, memory pressure, or
  degraded service before the request is rejected.
- **Fix:** Mirror the summarizer endpoint's bounds: max message count,
  max serialized bytes per message, max total serialized bytes, and a typed
  message/parts schema. Reject before model/provider work begins.
- **Mitigation:** Add per-user distributed rate limiting and request body size
  limits at Railway/edge where possible.
- **False positive notes:** The endpoint requires authentication and project
  access checks for project chats, which is good. The remaining risk is payload
  size/cost abuse by signed-in users.

### SEC-005 - Inline edit and tab-complete endpoints lack payload-size caps

- **Severity:** High
- **Rule:** NEXT-INPUT-001 / AI spend abuse controls
- **Location:** `apps/web/client/src/app/api/ai/inline-edit/route.ts:65-83`,
  `apps/web/client/src/app/api/ai/inline-edit/route.ts:167-179`,
  `apps/web/client/src/app/api/ai/tab-complete/route.ts:58-73`,
  `apps/web/client/src/app/api/ai/tab-complete/route.ts:113-125`
- **Evidence:**
  - Both routes cast `await req.json()` to TypeScript interfaces instead of
    using runtime schemas with length caps.
  - `before`, `selection`, `after`, `prefix`, and `suffix` flow into provider
    calls.
- **Impact:** Any authenticated project member can submit very large source-code
  buffers to paid AI endpoints. This can drive provider spend and memory usage.
- **Fix:** Add Zod schemas with max lengths for file path, language,
  instruction, and code-context fields. Enforce total byte caps before
  `incrementUsage` and before provider calls.
- **Mitigation:** Add endpoint-level rate limiting for tab completion, since it
  is designed to fire frequently while typing.
- **False positive notes:** Both routes correctly verify project access before
  invoking providers; this finding is about size/cost abuse, not cross-tenant
  data access.

### SEC-006 - API error responses can leak internal exception messages

- **Severity:** High
- **Rule:** NEXT-ERROR-001
- **Location:** `apps/web/client/src/app/api/chat/route.ts:176-187`,
  `apps/web/client/src/app/api/chat/route.ts:508-511`,
  `apps/web/client/src/app/api/ai/inline-edit/route.ts:199-208`,
  `apps/web/client/src/app/api/ai/tab-complete/route.ts:145-150`
- **Evidence:**
  - Several catch blocks return `error.message` or `String(error)` to the client.
  - These routes call LLM providers, Convex, model routing, tool loading, and
    project-context builders that may throw internal configuration, provider, or
    stack-shaped messages.
- **Impact:** Authenticated attackers can intentionally trigger edge cases to
  learn internal provider state, model routing details, service configuration, or
  stack-derived strings. This weakens incident response and may reveal sensitive
  architecture details.
- **Fix:** Return stable public error codes/messages and log detailed errors
  server-side with trace IDs.
- **Mitigation:** Preserve `X-Trace-Id` on AI routes and include that in logs so
  support can diagnose without exposing internals to clients.
- **False positive notes:** Some errors are already generic, for example the
  transcribe route's final catch. Apply the same pattern consistently.

## Medium Findings

### SEC-007 - Middleware intentionally skips sensitive API prefixes

- **Severity:** Medium
- **Rule:** NEXT-AUTH-001
- **Location:** `apps/web/client/middleware.ts:17-25`,
  `apps/web/client/middleware.ts:42-48`
- **Evidence:**
  - Middleware skips `/api/chat`, `/api/ai`, `/api/chat-images`, and
    `/api/trpc`.
  - Most reviewed routes do their own auth checks with Clerk/Convex.
- **Impact:** This is acceptable only if every skipped API route has its own
  authentication, authorization, input validation, and rate limiting. Future
  routes under those prefixes can accidentally become public.
- **Fix:** Keep the skip list small and add an API-route checklist/test that
  fails when a skipped prefix adds a route without explicit auth. Prefer
  middleware protection for broad private prefixes where feasible.
- **Mitigation:** Review every new route under skipped prefixes before merge.
- **False positive notes:** Current chat/AI routes do perform authentication, so
  this is a guardrail issue rather than a confirmed bypass.

### SEC-008 - Design-system password gate is weak but acceptable only as non-secret preview protection

- **Severity:** Medium
- **Rule:** Auth/session hardening
- **Location:** `apps/web/client/src/app/design-system/actions.ts:102-115`,
  `apps/web/client/src/app/design-system/layout.tsx:4-12`
- **Evidence:**
  - The unlock cookie is `httpOnly` and `sameSite: 'lax'`, but does not set
    `secure` in production.
  - The server action compares `password === expected` directly.
- **Impact:** This should not protect sensitive data. It is acceptable for a
  style-guide preview gate, but not for admin or customer data.
- **Fix:** If the design-system page remains publicly deployed, set the cookie
  `secure` in production and consider Clerk/admin gating instead of a shared
  password.
- **Mitigation:** Ensure `DESIGN_SYSTEM_PASSWORD` is strong and not reused.
- **False positive notes:** The page is a design surface, not a privileged admin
  app, so this is not a release blocker by itself.

### SEC-009 - Local env files exist but are ignored, not tracked

- **Severity:** Medium
- **Rule:** NEXT-SECRETS-001
- **Location:** `.env`, `.env.local`, `apps/web/client/.env.local`
- **Evidence:**
  - Files exist locally.
  - `git ls-files` returned no tracked `.env*` files.
  - `.gitignore` and `apps/web/client/.gitignore` ignore these env files.
- **Impact:** There is no current committed-secret finding from the working tree,
  but local secrets must not be copied into docs, screenshots, logs, or generated
  artifacts.
- **Fix:** Keep `.env*` ignored, enable GitHub secret scanning, and rotate any
  key that was ever committed historically.
- **Mitigation:** Use deployment secret stores for Railway/Convex/Clerk/Stripe.
- **False positive notes:** This review did not print or inspect secret values.

## Positive Findings

- Project routes and workspace routes use server-side auth guards before
  rendering protected shells.
- The `/admin/*` layout requires Clerk auth, a Convex token, and a Convex admin
  allowlist check before rendering.
- Convex project data generally routes through `requireCap`, with capability
  checks for view/update/publish/delete/member operations.
- Clerk and Stripe Convex HTTP webhooks verify signatures before mutating data.
- `.env` and `.env.local` files are ignored and not tracked in git.
- Security headers exist globally, including `X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, and CSP.

## Release Gate

Before production release to real users:

1. Upgrade Next.js and resolve production-reachable critical/high dependency
   advisories.
2. Add payload size limits and typed runtime schemas to chat, inline-edit, and
   tab-complete.
3. Replace client-visible internal errors with stable public error responses.
4. Tighten CSP, starting with removing `unsafe-eval` in production or documenting
   the exact blocker and rollout plan.
5. Re-run:
   - `bun audit --audit-level=moderate`
   - `bun typecheck`
   - `bun lint`
   - `bun --filter @weblab/web-client build`
6. Verify live production headers and auth behavior on the deployed Railway URL
   before opening access broadly.

## Confidence

I am confident this build should **not** be released as-is. The largest blockers
are evidence-backed: current dependency advisories, permissive CSP, and unbounded
paid AI payloads. I would do a second pass after those fixes land, including live
header checks and route-level abuse tests.
