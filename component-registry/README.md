# Weblab component registry

The fixed, described catalog the Weblab AI agent builds from. Instead of inventing
markup, colors, and fonts, the agent picks from vetted components and one design-token
palette — so generated sites stay consistent and on-brand.

## Catalog-first model

There are ~4,500 free components/blocks across the upstream registries. Vendoring
them all would bloat the repo, so the registry is **catalog-first**:

- **Catalogued (not vendored):** every free shadcn/ui, shadcnblocks, and Watermelon
  UI item — name, description, and install URL only. The agent installs them on
  demand into the user's project with `bunx --bun shadcn@latest add "<installUrl>"`.
- **Vendored (real source in this folder):** the local **pro** blocks (no install
  URL exists for them) and a small **core** set of shadcn/ui primitives.

Nothing free is left behind — every item is in `manifest.json` with a description
and an install URL (or vendored source).

## What the agent uses

1. **Default stack** for new sites: Next.js + React + Tailwind + shadcn/ui.
2. **The `shadcn` skill** (`skills/shadcn/SKILL.md`, embedded into the agent) — the
   agent calls `read_skill("shadcn")` to get the design foundations + the full
   catalog index + install commands.
3. **Tokens only** for color/radius (`theme/tokens.css`); **approved fonts only**
   (`theme/fonts.md`). Never a hardcoded hex or a new font.
4. New blank Next.js projects ship these tokens automatically — they're baked into
   `scaffoldNextProject`'s `globals.css` (`packages/code-provider/src/providers/vercel-sandbox/index.ts`),
   so a site is on-brand before the AI touches it. Keep that copy in sync with
   `theme/tokens.css`.

## Layout

```
component-registry/
  manifest.json            # generated full catalog (every item + description + install URL)
  CATALOG.md               # generated human-browsable catalog, grouped by source/category
  skill-catalog.md         # generated index fragment appended into skills/shadcn/SKILL.md
  registry.config.ts       # central config: enabled libs, default stack/direction, token paths
  components.json          # shadcn CLI config (style, aliases) for installs
  theme/
    tokens.css             # THE color + radius source of truth (shadcn CSS-var contract)
    fonts.md               # THE approved typefaces (Direction A / B)
  lib/utils.ts             # cn() helper every component imports
  shadcn/*.tsx             # vendored CORE shadcn/ui primitives
  watermelon/*.tsx         # a few vendored Watermelon reference components
  pro/<category>/*.tsx     # vendored local pro blocks (198, no upstream URL)
  blocks/*.tsx             # composed, anti-slop section exemplars (hero, feature-list, cta)
  templates/*.tsx          # full-page exemplars (landing-page)
  scripts/fetch-components.mjs   # the catalog builder — run to refresh/extend
```

## Sources + install patterns

| Source | Install URL pattern |
|---|---|
| shadcn/ui | `https://ui.shadcn.com/r/styles/new-york/<name>.json` |
| shadcnblocks (free) | `https://www.shadcnblocks.com/r/<name>.json` |
| Watermelon UI | `https://raw.githubusercontent.com/WatermelonCorp/watermellon-registry/main/public/r/<name>.json` |
| Local pro | copy `component-registry/pro/<category>/<name>.tsx` into the project |

## Rebuild / extend the catalog

```bash
# Full rebuild (probes shadcnblocks for the free set — takes a minute):
bun run component-registry/scripts/fetch-components.mjs

# Reuse the cached shadcnblocks free list (faster):
bun run component-registry/scripts/fetch-components.mjs --skip-shadcnblocks-probe
```

After rebuilding, re-sync the agent skill so it sees the new catalog:

```bash
# 1) append the regenerated index into the skill body
cat component-registry/skill-catalog.md >> skills/shadcn/SKILL.md   # (replace the old Catalog section)
# 2) regenerate embedded skills
cd packages/ai && bun run generate:skills
```

## Tweak the look

- Colors / radius → `theme/tokens.css` **and** the baked copy in `scaffoldNextProject`.
- Fonts → `theme/fonts.md`.
- Defaults (stack, direction, enabled libs) → `registry.config.ts`.
