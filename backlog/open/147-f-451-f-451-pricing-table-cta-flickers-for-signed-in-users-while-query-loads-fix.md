# ~~F-451 — Pricing table CTA flickers for signed-in users while query loads~~ FIXED (2026-05-28)

- **Resolved:** `pricing-table/index.tsx` now distinguishes `authResolving` (null cookie OR loading user) from `isUnauthenticated`. Passes `isAuthLoading` prop to FreeCard + ProCard. CTAs render a disabled loading spinner while auth is resolving so the signed-in visitor cannot accidentally trigger the auth modal during the flicker window.
