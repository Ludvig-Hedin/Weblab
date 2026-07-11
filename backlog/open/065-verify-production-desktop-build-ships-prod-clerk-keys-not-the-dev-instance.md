# Verify production desktop build ships prod Clerk keys (not the dev instance)

- **Discovered:** 2026-06-15 (user-reported "desktop app opens weblab.build in browser, not the app")
- **Where:** `apps/desktop/main.js` (`DEFAULT_LAUNCH_URL` → `weblab.build/sign-in`), `apps/web/client/.env.local:213` / root `.env` use `pk_test_…` + `full-redbird-32.clerk.accounts.dev`; prod expects `clerk.weblab.build` per `.env.prod.example`.
- **Symptom:** Desktop sign-in hands off to the system browser; if the round-trip back via `weblab://auth/handoff` fails, the user finishes signing in on weblab.build *in the browser* and never returns to the app. A dev Clerk key on a prod build makes the handshake/handoff flaky.
- **Root cause:** Browser-handoff auth (intended) + fragile `weblab://` return path. Code fallback added in `handoff-client.tsx` (stalled → Download / Continue-in-browser), but the env half can't be verified from the repo.
- **Next step:** Confirm Railway prod env for the web app and the packaged desktop build use `pk_live_*` + `CLERK_FRONTEND_API_URL=https://clerk.weblab.build`. Confirm the installed `.app`/`.exe` registers the `weblab://` protocol (macOS: app in /Applications, launched once). Close the `main.js:225` handoff-nonce CSRF TODO.
- **Risk if ignored:** Desktop users can't get into the app; stranded on the website after sign-in.
- **Tags:** `#bug` `#infra` `#auth`
