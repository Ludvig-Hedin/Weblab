# Confirm Railway `NEXT_PUBLIC_CONVEX_URL` = prod Convex (`rapid-crab-113`)

> **RESOLVED 2026-06-06** — Railway Source variables now confirm
> `NEXT_PUBLIC_CONVEX_URL=https://rapid-crab-113.convex.cloud` and
> `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_*`. The audit found two adjacent
> production config bugs instead: `CLERK_FRONTEND_API_URL` still pointed at the
> dev Clerk frontend (`full-redbird-32.clerk.accounts.dev`), and
> `CONVEX_DEPLOYMENT` still pointed at the dev deployment selector. Both were
> corrected in Railway production (`CLERK_FRONTEND_API_URL=https://clerk.weblab.build`,
> `CONVEX_DEPLOYMENT=prod:rapid-crab-113`) and a Source redeploy was triggered.

- **Discovered:** 2026-05-28 (prod Google-login crash investigation)
- **Where:** Railway web-client service build vars (Dockerfile ARG `NEXT_PUBLIC_CONVEX_URL`)
- **Symptom:** Could not verify which Convex deployment the live bundle targets — Railway login token expired (`railway login` needed) and the URL sits in a lazy-loaded JS chunk the sandbox probe couldn't reach.
- **Root cause:** n/a (verification gap). Diagnosis strongly implies prod points at `rapid-crab-113` (only an empty deployment produces *both* console errors, and dev `avid-gnat-539` is not empty), but it is unconfirmed.
- **Next step:** `railway login`, then read the web-client service var. Must equal `https://rapid-crab-113.convex.cloud`. If it's the dev URL (`avid-gnat-539`), that's a second bug — repoint it and redeploy. While there, sanity-check `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is the `pk_live_*` prod key.
- **Risk if ignored:** If prod actually points at dev Convex, login still fails after the prod deploy (prod Clerk token rejected by dev's issuer).
- **Tags:** `#infra` `#auth` `#convex`
