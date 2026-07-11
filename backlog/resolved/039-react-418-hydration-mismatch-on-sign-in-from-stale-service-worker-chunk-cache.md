# React #418 hydration mismatch on /sign-in from stale service-worker chunk cache

- **Discovered:** 2026-05-28 (prod Google-login crash investigation), re-confirmed 2026-06-16 and 2026-06-23.
- **Resolved:** 2026-06-23 (service worker v4; chunk requests are network-first with cached fallback)
- **Where:** `apps/web/client/public/sw.js`; `apps/web/client/src/app/sign-in/**`.
- **Root cause:** Not a sign-in markup bug. A clean fresh Chrome context with service workers blocked renders `/sign-in` with 0 console errors and a single viewport tag. A persistent browser context with an installed SW could still serve cached `/_next/static/chunks/*` JS/CSS from the previous build against fresh HTML, reproducing React #418 for returning users. The older v3 fix only purged one poisoned cache generation; it did not prevent stale chunk reuse if a Turbopack chunk URL stayed stable across adjacent deploys.
- **Fix:** Bumped the SW namespace to v4 to purge v3 runtime caches, and changed `/_next/static/chunks/*` handling from cache-first to network-first with runtime-cache fallback. Other static assets remain cache-first; chunks still work offline from cache when the network is unavailable.
- **Validation:** Live `https://weblab.build/sign-in` after deploy served one viewport tag and the new sitemap route. Fresh Chrome Playwright context (`serviceWorkers: 'block'`) loaded `/sign-in` with 0 console errors; the stale persistent browser context reproduced #418 before the SW cache hardening.
- **Tags:** `#bug` `#auth` `#infra` `#pwa`
