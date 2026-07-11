# QA loop — auth loading states (2026-06-21 iter-14, /loop dynamic) — 1 FIXED (5 files), 1 refuted

> Cleared the last iter-12 auth leads. Typecheck ✓, lint clean.

**✅ FIXED (this commit):**
1. **`#auth` `#ux` — blank-screen flash on auth-gated segments during RSC resolve.** Added `loading.tsx` Suspense fallbacks to the 5 segments that lacked one — `sign-in/verify`, `profile-setup`, `w/new`, `invitation/[id]`, `invitation/workspace/[id]` — each rendering `<ProjectCreationLoader heading="…" />`, the established full-page-loader pattern used by `/projects` + `/project/[id]`. Purely additive; an invited/verifying/onboarding user now gets immediate feedback instead of a white flash while the server segment resolves.

**❌ REFUTED — not a clean swap:**
- **consolidate the two `sanitizeReturnUrl` impls** — they have genuinely DIFFERENT contracts: `utils/auth/sanitize-return-url.ts` returns `string | null` (null on unsafe → caller falls back); `utils/url/index.ts` returns `string` (defaults to `Routes.HOME`, accepts an `origin` opt AND same-origin absolute URLs). Swapping `verify/page.tsx` + `profile-setup` from the `utils/url` impl to the `utils/auth` one would change auth-redirect behavior (null vs HOME default) and make the currently-dead null-branch live. The dead branch is harmless; merging is a behavior-changing refactor, not a cleanup — deferred. (If consolidating later, pick ONE canonical contract and migrate all callers deliberately.)

> Still-OPEN owner decisions (unchanged): wireframe spend exposure (dedicated rate-limit table — ready to build on request — vs. credit pricing); loop continue/redirect/wind-down.
