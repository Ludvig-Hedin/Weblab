# `/sign-in` React #418 from SSR/client auth-provider divergence

- **Discovered:** 2026-06-23 (post-deploy production browser validation after service-worker v4)
- **Resolved:** 2026-06-23 (`clerk-auth-form` treats blank `NEXT_PUBLIC_AUTH_PROVIDERS` as the documented default)
- **Where:** `apps/web/client/src/app/sign-in/_components/clerk-auth-form.tsx`.
- **Root cause:** Production SSR saw a blank `NEXT_PUBLIC_AUTH_PROVIDERS` value and rendered only the always-on Vercel button, while the browser bundle fell back to the default GitHub/Google provider list and hydrated three OAuth buttons. React regenerated the sign-in subtree and logged minified error #418.
- **Fix:** Normalize `NEXT_PUBLIC_AUTH_PROVIDERS` before parsing so `undefined`, empty, and whitespace-only values all use the documented `github,google` default on both server render and browser hydration.
- **Validation:** Production no-JS vs hydrated comparison identified the exact button-list mismatch. Local production server with `NEXT_PUBLIC_AUTH_PROVIDERS=''` rendered the same Google/GitHub/Vercel button list in server HTML and hydrated DOM, with one viewport tag and 0 browser errors.
- **Tags:** `#bug` `#auth` `#frontend`
