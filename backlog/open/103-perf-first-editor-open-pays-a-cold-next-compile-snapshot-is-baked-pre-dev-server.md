# Perf: first editor open pays a cold Next compile (snapshot is baked pre-dev-server)

- **Discovered:** 2026-06-05 (bug-hunt). The blank snapshot (`scripts/create-vercel-template.mjs`) is taken *after* `npm install` but *before* the dev server starts, so resume is fast (~13s) but the first preview pays a 30-90s cold Turbopack compile (`server/src/sandbox/index.ts` `setup()` polls up to 90s). No double-boot — the editor reuses the live sandbox by id (`Sandbox.get`), confirmed.
- **Fix (in progress this turn):** warm the dev server (with `--hostname 0.0.0.0`) before snapshotting so the snapshot carries a hot `.next` build cache → first open recompiles in seconds. Bake script updated + re-baked; `VERCEL_BLANK_SNAPSHOT_ID` rotated. An in-action pre-warm was rejected — the scaffolded `package.json` dev script lacks `--hostname`, so pre-warming with the wrong command would make `setup()` skip its correct spawn and 502 the preview.
- **Tags:** `#perf` `#sandbox`
