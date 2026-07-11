# ~~F-453 — Cookie consent read only at mount; no runtime re-init~~ FALSE ALARM (resolved 2026-05-28)

- **Resolved:** `apps/web/client/src/app/_components/cookie-consent.tsx:52-56` calls `window.location.reload()` inside `onAccept`. The next mount runs the init effect with the consent cookie present, so SDKs DO initialize on accept. No code change needed.
