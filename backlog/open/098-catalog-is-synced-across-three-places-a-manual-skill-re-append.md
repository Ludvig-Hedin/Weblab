# Catalog is synced across three places + a manual skill re-append

- **Discovered:** 2026-06-05 (component-registry session)
- **Where:** `component-registry/manifest.json` (generated), `packages/constants/src/component-registry.ts` (`COMPONENT_REGISTRY`, hand-mirrored CORE set), and `skills/shadcn/SKILL.md` (catalog appended from `skill-catalog.md`, then `generate:skills`)
- **Symptom:** rebuilding the catalog requires: run fetcher → re-append `skill-catalog.md` into `SKILL.md` (replacing the old Catalog section) → `bun run generate:skills`. The constants CORE list is also hand-maintained. Easy to drift.
- **Next step:** codegen `COMPONENT_REGISTRY` (core) and the `SKILL.md` catalog section from `manifest.json` so the manifest is the single source.
- **Risk if ignored:** catalog drift between the folder, the prompt CORE set, and the skill body.
- **Tags:** `#tech-debt`
