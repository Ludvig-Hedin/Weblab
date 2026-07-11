# F-134 — invalid Convex ID on settings/access shows generic boundary error (not invalid-id)

- **Discovered:** 2026-05-28 (bug-hunt F-120..F-135)
- **Severity:** LOW (downgraded 2026-05-28 after tracing — **not a hard crash / white-screen**).
- **Where:** [apps/web/client/src/app/project/[id]/settings/access/page.tsx:35](apps/web/client/src/app/project/[id]/settings/access/page.tsx#L35)
- **Symptom:** `const projectId = params.id as Id<'projects'>;` is an unchecked cast. A non-Convex id (e.g. `/project/abc/settings/access`) makes the client `useQuery` throw `ArgumentValidationError`. **This is caught by the parent `/project/[id]/error.tsx` boundary**, which renders "We couldn't open this project" + a "Back to projects" escape. So the user is not stranded — they just get a generic message rather than the dedicated "Invalid project ID" copy.
- **Why not fixed this pass:** the natural fix (validate id shape before the hook) is risky — Convex exposes no client-side `Id` validator, and a hand-rolled regex (`length === 32`, charset) would risk rejecting **valid** ids if Convex's id format ever changes, which is strictly worse than the current graceful fallback. The server-component F-131 fix could be reused only if settings/access were converted to fetch server-side first.
- **Next step (low priority):** when the F-131 `classifyProjectLoadError` helper is mature, give settings/access its own segment `error.tsx` that runs the same classifier on `error.message` and renders `ProjectLoadError variant="invalid-id"` for validator errors. Pure additive, no fragile up-front regex.
- **Risk if ignored:** a typo'd settings deep-link shows "couldn't open this project" instead of "invalid link". Minor copy mismatch; user always has an escape button.
- **Tags:** `#ux` `#auth-gated` `#convex` `#low`
