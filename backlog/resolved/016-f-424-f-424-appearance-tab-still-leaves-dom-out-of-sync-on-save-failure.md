# F-424 — Appearance-tab still leaves DOM out of sync on save failure

- **Discovered:** 2026-05-28 (validate-feature F-420..F-439 run)
- **Resolved:** 2026-07-07 — `appearance-tab.tsx`: snapshots `data-accent`/`data-font-size`/`data-font-family` before the optimistic mutation and restores them in the `catch` block, so a failed save no longer leaves the DOM showing an unpersisted change.
- **Tags:** `#flag` `#ux`
