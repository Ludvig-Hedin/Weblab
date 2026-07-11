# Dead code: `/landing-old` route + old home chain (`home-page-client-old`, V1 section, `ComponentsBlock`)

- **Discovered:** 2026-06-17 (QA pass iter-3, while tracing hydration #418)
- **Where:** `apps/web/client/src/app/landing-old/page.tsx`; `…/_components/home-page-client-old.tsx`; `…/landing-page/what-can-weblab-do-section.tsx` (V1, vs the live `-v2`); `…/landing-page/feature-blocks/components.tsx` (`ComponentsBlock`); `…/landing-page/_demo-backup-20260605/` dir
- **Symptom:** The live landing (`/`) renders `home-page-client.tsx` (V2 sections). The V1 chain is reachable only via the separate `/landing-old` route. It still ships in the bundle and carries real SSR hazards (e.g. `ComponentsBlock`'s live `new Date().toLocaleString('default')` calendar). An iter-1 UX critique and an iter-3 #418 hunt both wasted time on this dead chain.
- **Next step:** Confirm `/landing-old` isn't an intentional reference/A-B route (ask owner — do NOT delete unilaterally), then remove the route + `home-page-client-old.tsx` + V1 section + `ComponentsBlock` + the `_demo-backup-20260605` dir. `bun typecheck` will confirm nothing else imports them.
- **Risk if ignored:** Dead code rots and repeatedly misleads audits; ships unused JS.
- **Tags:** `#tech-debt`
