# `parseDomain` comment claims PSL private-domain handling it doesn't do

- **Discovered:** 2026-05-29 (test-hardening session; pinned in `freestyle.test.ts`)
- **Where:** [convex/lib/freestyle.ts:65](apps/web/client/convex/lib/freestyle.ts#L65) + the comment at [domainActions.ts:58](apps/web/client/convex/domainActions.ts#L58).
- **Symptom:** Comment says tldts splits `.co.uk` / `.github.io` / `.vercel.app` "correctly via the PSL", but `parse()` is called without `allowPrivateDomains: true`, so PRIVATE suffixes are NOT honored: `parseDomain('user.github.io')` → apex `github.io`, `parseDomain('x.vercel.app')` → apex `vercel.app`. `.co.uk` (ICANN suffix) is correct. Behavior is now pinned in `convex/lib/freestyle.test.ts`.
- **Next step:** either fix the comment (private suffixes not handled) or pass `{ allowPrivateDomains: true }` if those should be treated as apexes — and update the test. Low impact: users connect real registrable domains, not `*.github.io`.
- **Risk if ignored:** misleading comment; apex dedup key for a `*.vercel.app`/`*.github.io` custom domain would be the shared private suffix.
- **Tags:** `#docs` `#low-severity`
