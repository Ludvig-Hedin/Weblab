# Dead-code domain helpers in `packages/utility` have a real ccTLD bug

- **Discovered:** 2026-05-29 (test-hardening session: auth audit)
- **Where:** [packages/utility/src/domain.ts:58](packages/utility/src/domain.ts#L58) `getRootDomain` (naive `parts.slice(-2)`), plus `isSubdomain` (:49) and `verifyDomainOwnership` (:14).
- **Symptom:** `getRootDomain('app.foo.co.uk')` → `"co.uk"` (public suffix, not the registrable apex). These have **zero production callers** (grep across `apps/`+`packages/`); the live Convex path uses tldts (`convex/lib/freestyle.ts::parseDomain`, now unit-tested). Vestigial from the pre-Convex tRPC domain router.
- **Next step:** delete the dead helpers, or if revived, reimplement on tldts/PSL and add tests.
- **Risk if ignored:** none today (dead); a future caller would inherit the ccTLD mis-parse.
- **Tags:** `#tech-debt` `#dead-code`
