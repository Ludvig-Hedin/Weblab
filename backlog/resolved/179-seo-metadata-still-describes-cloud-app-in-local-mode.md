# SEO metadata still describes the cloud app in local-app mode

- **Discovered:** 2026-09-28 (local-app mode launch)
- **Where:** `apps/web/client/src/app/seo.ts:95-133` (SoftwareApplication schema: Web/Windows/Linux, price range), `seo.*` in `apps/web/client/messages/en.json`
- **Symptom:** Search results and link previews for weblab.build still mention teams, pricing and Windows/Linux while the site runs in local-app mode.
- **Root cause:** Local-app mode (`IS_LOCAL_APP_MODE`) only gates visible UI and routes, not metadata.
- **Next step:** Gate the JSON-LD and root/download SEO strings on `IS_LOCAL_APP_MODE` with Mac-only, free copy.
- **Risk if ignored:** Low while the site is shared with friends only; misleading once indexed.
- **Resolved:** 2026-09-28. Root and /download metadata plus the SoftwareApplication JSON-LD now switch on `IS_LOCAL_APP_MODE` (`seo.rootLocalApp`, `seo.downloadLocalApp`).
- **Tags:** `#docs` `#tech-debt`

---
