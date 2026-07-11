# Orphaned Convex `uiDensity` field after Density control removal

- **Discovered:** 2026-06-02 (settings-modal polish session)
- **Where:** `apps/web/client/convex/schema.ts` (userSettings `uiDensity`), `convex/users.ts` (`updateSettings`/`getMappedSettings` still map it)
- **Symptom:** The Density appearance control was removed because `--spacing-unit` (set by `[data-density]`) was consumed nowhere — the toggle did nothing. The Convex `uiDensity` field is now write-dead.
- **Root cause:** Density was never wired to real spacing; removing the UI is correct, but the schema field was left to avoid a migration.
- **Next step:** Either drop `uiDensity` from the userSettings schema + mapper in a dedicated additive→narrow migration, OR re-implement density for real (multiply component padding by `--spacing-unit`). Low priority.
- **Risk if ignored:** Harmless dead field; minor schema clutter.
- **Tags:** `#tech-debt` `#convex`
