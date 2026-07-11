# React hydration error #418 on the production landing page

- **Discovered:** 2026-06-17 (QA pass iter-2 — direct Playwright against live `weblab.build`)
- **Where:** `apps/web/client/src/app/page.tsx` + `_components/hero/*` / promo bar / footer (exact component TBD)
- **Symptom:** Live landing throws a single `pageerror`: *"Minified React error #418; …args[]=HTML"* (hydration: server-rendered HTML did not match client). Console is otherwise clean (0 console errors) and the page renders fine across 1440/768/375. Also seen: one `net::ERR_ABORTED` on a `/projects?_rsc=` prefetch — likely benign Next prefetch cancellation, not tracked separately.
- **Root cause:** Not yet pinned. Iter-3 ruled out the obvious suspects on the *reachable* landing tree (page.tsx → HomePageClient → HeroV2 / ResponsiveMockupSection / WhatCanWeblabDoSectionV2 / FeatureTrioSection / FAQSection / ChangelogGrid / CTASection / PageFooter):
  - `unicorn-background.tsx` + `promo-banner/index.tsx` — both correctly mount-guarded (`webglSupported===null` / `mounted` flag) → render identically server vs first-client. Not it.
  - `changelog-grid.tsx` — formats dates via `date-fns format(parsed,'MMM d, yyyy')`, which is locale-deterministic. Not it.
  - `feature-blocks/components.tsx` (`ComponentsBlock`, renders live `new Date().toLocaleString('default',…)` + a "today"-highlighted calendar — a genuine SSR hazard) is **dead on the real landing**: only `what-can-weblab-do-section.tsx` (V1) renders it, and V1 is only reachable via `home-page-client-old.tsx` → the `/landing-old` route. Not the `/` culprit.
  - Live DOM nesting scan (Playwright) found no reparenting patterns (`a a`, `button button`, `p>div`, `p>p`). Only `div`-in-`button` (×17 swatch indicators) — invalid per spec but browsers don't reparent it, so not a hydration cause.
- **Next step:** Static + DOM analysis didn't pin it — needs the React component stack. Run the landing against a non-minified build (`next dev` or a non-prod-minified build) so the `react.dev/errors/418` decoder names the component, OR add a temporary `onRecoverableError` logger in the root layout to capture the component stack in prod. Likely a motion-driven conditional render or a third-party (UnicornScene / next-intl / framer) SSR/client divergence.
- **Risk if ignored:** Hydration mismatch forces a client re-render of the subtree (layout flash / wasted work) and can desync interactive state; also a soft SEO/perf signal. Cosmetic today but real.
- **Tags:** `#bug` `#perf` `#public`
