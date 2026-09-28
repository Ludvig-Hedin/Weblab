# Move weblab-local into this repo as apps/desktop-local

- **Discovered:** 2026-09-28 (local-app mode launch, owner request)
- **Where:** `~/Programming/personal/AB/weblab-local` (GitHub `Ludvig-Hedin/airship`), target `apps/desktop-local/`
- **Symptom:** The Mac app that weblab.build now promotes lives in a separate repo named "airship". Site GitHub links still point at `Ludvig-Hedin/Weblab`, and the download comes from airship releases.
- **Root cause:** The local app was built as a fork of Airship outside this monorepo.
- **Next step:** When no other agents are mid-work, import it (keep history, e.g. `git subtree add`) as `apps/desktop-local`, make it the desktop app, and clearly mark `apps/desktop` as paused in its README and `docs/feature-catalog.md`. Then move releases to this repo and update `NEXT_PUBLIC_LOCAL_APP_DOWNLOAD_URL`. See `docs/guides/local-app-mode.md`.
- **Risk if ignored:** Two desktop apps and two repos confuse contributors; "open source" links show the paused cloud app, not what people download.
- **Resolved:** 2026-09-28. Imported with history via `git subtree add --prefix=apps/desktop-local` (branch `weblab`, incl. merged `feat/components` and `feat/image-swap`). `apps/desktop` marked paused; releases now in `Ludvig-Hedin/Weblab` as `desktop-local-v*`.
- **Tags:** `#tech-debt` `#infra`

---
