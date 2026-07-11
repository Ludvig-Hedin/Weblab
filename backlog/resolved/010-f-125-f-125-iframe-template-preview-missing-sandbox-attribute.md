# F-125 — `<iframe>` template preview missing `sandbox` attribute

- **Discovered:** 2026-05-28 (bug-hunt F-120..F-135)
- **Resolved:** 2026-07-07 — added `sandbox="allow-scripts allow-same-origin allow-forms"` to the preview iframe. All `previewUrl` values are third-party `*.vercel.app` demo apps (confirmed via `template-data.ts`), so `allow-same-origin` grants the framed page access only to its own origin, not the parent — the classic sandbox-escape risk doesn't apply here.
- **Tags:** `#security` `#defense-in-depth` `#auth-gated`
