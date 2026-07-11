# Editable Weblab subdomain — end-to-end serving unverified (publish disabled)

- **Discovered:** 2026-06-02 (settings-modal polish session)
- **Where:** `convex/domains.ts` (`setPreviewSlug`, `previewSlugGet`), `convex/domainActionsDb.ts` (`_previewCreate`), `domain/preview.tsx`
- **Symptom:** Users can now reserve/rename `<slug>.weblab.app`. The slug persists (`projects.previewSlug`) and `_previewCreate` honors it, but `publish` is disabled on Vercel (`TODO(publish-vercel)`), so the slug can't be exercised against live routing/serving yet.
- **Root cause:** Publish path gated until snapshot-based fork lands.
- **Next step:** When publish is re-enabled, verify a chosen slug actually serves the deployed site and that the wildcard DNS + `by_full_domain` lookup resolves it. Pre-publish slug collisions across projects are only guarded at set-time (and at publish-time in `_previewCreate`).
- **Risk if ignored:** Setter UX works, but a reserved slug might not route until verified post-publish.
- **Tags:** `#infra` `#convex` `#test-gap`
