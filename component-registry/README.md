# Weblab component registry

The fixed, tweakable catalog the Weblab AI agent builds from. Instead of inventing
markup, colors, and fonts, the agent draws from these vetted components and the
single design-token source — so generated sites stay consistent and on-brand.

## Why this exists

LLMs regress to the mean of their training data: shadcn-on-slate, indigo
gradients, three identical feature cards. This registry + the system-prompt rules
that point at it constrain the agent to a curated set of components and **one**
palette, killing the "AI slop" default. See the field guide at
[`docs/agent-context/ai-slop-field-guide.md`](../docs/agent-context/ai-slop-field-guide.md).

## Layout

```
component-registry/
  manifest.json            # generated catalog (name, lib, deps, install URL) — do not hand-edit
  registry.config.ts       # central config: enabled libs, default stack/direction, token paths
  components.json          # shadcn CLI config (style, aliases) for installs
  theme/
    tokens.css             # THE color + radius source of truth (shadcn CSS-var contract)
    fonts.md               # THE approved typefaces (Direction A / B)
  lib/utils.ts             # cn() helper every component imports
  shadcn/*.tsx             # fetched shadcn/ui primitives (new-york)
  watermelon/*.tsx         # fetched Watermelon UI components
  blocks/*.tsx             # composed, anti-slop section exemplars (hero, feature-list, cta)
  templates/*.tsx          # full-page exemplars (landing-page)
  scripts/fetch-components.mjs   # the fetcher — run to add more
```

## How the agent uses it

1. **Default stack** for a new site: Next.js + React + Tailwind + shadcn/ui.
2. **Components**: only those in `manifest.json`. To use one, install it into the
   user project with the manifest `installUrl`, e.g.
   `bunx --bun shadcn@latest add "https://ui.shadcn.com/r/styles/new-york/button.json"`.
3. **Color + radius**: only `theme/tokens.css`. Never a hardcoded hex. New site →
   copy tokens into `app/globals.css`. Existing site → use that project's tokens.
4. **Fonts**: only those in `theme/fonts.md`. Existing site → keep its fonts.
5. **Blocks/templates**: copy from `blocks/` and `templates/` as starting points,
   then adapt copy and data to the user's product.

When adding to an **existing** repo, the agent matches that repo's stack, tokens,
and components — it does not introduce new colors, fonts, or libraries.

## Extend the catalog (finish the MVP)

This is an MVP subset. To add more components:

1. Append entries to `CURATED` in [`scripts/fetch-components.mjs`](scripts/fetch-components.mjs).
   Browse names at <https://ui.shadcn.com/docs/components> and <https://ui.watermelon.sh>.
2. Run the fetcher (registries are outside the sandbox allowlist — disable the
   sandbox if a fetch times out):

   ```bash
   bun run component-registry/scripts/fetch-components.mjs
   ```

3. Mirror new entries into the prompt catalog at
   [`packages/constants/src/component-registry.ts`](../packages/constants/src/component-registry.ts)
   so the agent is told they exist. (Future: generate that file from `manifest.json`.)

## Tweak the look

- Colors / radius → edit `theme/tokens.css`.
- Fonts → edit `theme/fonts.md`.
- Defaults (stack, direction, enabled libs) → edit `registry.config.ts`.
