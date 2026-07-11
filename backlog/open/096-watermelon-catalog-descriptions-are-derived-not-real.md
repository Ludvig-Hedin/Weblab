# Watermelon catalog descriptions are derived, not real

- **Discovered:** 2026-06-05 (full-catalog session)
- **Where:** `component-registry/scripts/fetch-components.mjs` (`deriveDescription` / `STEM_DESC`); 964 Watermelon entries in `manifest.json`
- **Symptom:** Watermelon registry items carry no title/description, so descriptions are derived from the name stem ("Accordion: collapsible disclosure rows (variant 03)"). A few are awkward (e.g. "aave swap component component"). shadcnblocks descriptions are real; Watermelon's are best-effort.
- **Next step:** optionally fetch each Watermelon item and summarize its source for a real description, or expand `STEM_DESC`. Low priority — names are already descriptive.
- **Risk if ignored:** slightly weaker block descriptions for one source.
- **Tags:** `#enhancement`
