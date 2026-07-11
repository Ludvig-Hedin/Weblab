# shadcnblocks free set is probe-classified (293/3365) — may miss rate-limited items

- **Discovered:** 2026-06-05 (full-catalog session)
- **Where:** `component-registry/scripts/fetch-components.mjs` (`catalogShadcnblocksFree`); cache `component-registry/.cache/shadcnblocks-free.json`
- **Symptom:** free vs pro is detected by probing each `/r/<name>.json` (pro → "Authentication failed"). A rate-limited/transient failure during the run would mis-mark a free block as pro and drop it. Current run found 293 free.
- **Next step:** re-run with `--skip-shadcnblocks-probe` off periodically; consider ret/backoff on non-200s to avoid false negatives. Cache makes re-runs cheap.
- **Risk if ignored:** a handful of free shadcnblocks could be missing from the catalog.
- **Tags:** `#tech-debt`
