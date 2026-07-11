# 2026-06-05 — Component registry extended to full catalog + on-brand scaffold

Resolved by the full-catalog session (F-785).

- Catalog grew from the 21-component MVP to **1533** items: all free shadcn/ui
  (78), shadcnblocks free (293, probe-classified), Watermelon UI (964), and the
  198 local pro blocks vendored from `reference/shadcn-pro-blocks`. Catalog-first:
  registry blocks carry name + description + install URL (installed on demand);
  only pro + a core set are vendored. `manifest.json` + `CATALOG.md` describe all.
- Blank Next.js scaffolds now ship the Weblab tokens — `NEXTJS_GLOBALS_CSS` baked
  into `scaffoldNextProject`'s `globals.css`, so sites are on-brand pre-AI.
- New `shadcn` agent skill (`skills/shadcn/SKILL.md`, embedded via `generate:skills`)
  carries the design foundations + the full catalog index; the prompt points the
  agent at `read_skill("shadcn")`.
- Follow-ups opened above: derived Watermelon descriptions, probe-classified free
  set, three-place catalog sync, and duplicated scaffold tokens.
