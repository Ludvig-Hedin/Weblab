# Weblab Figma Export Plugin

Converts selected Figma frames into React TSX or HTML code you can paste directly into a Weblab project.

## Install (development)

1. `cd packages/figma-plugin && bun run build`
2. In Figma: **Plugins → Development → Import plugin from manifest** → select `manifest.json`

## Usage

1. Select one or more frames in Figma
2. Open **Plugins → Development → Weblab Export**
3. Choose framework (React / HTML) and style (Tailwind / Inline / CSS Modules)
4. Click **Copy code** and paste into your project

## Development

```bash
bun run dev       # Watch mode — rebuilds plugin + UI on save
bun test          # Run codegen unit tests (25 assertions)
bun run typecheck # TypeScript check
```

## Phase C: Auto-import to Weblab (future)

Extend `manifest.json` `networkAccess.allowedDomains` to `["weblab.build"]` and add a
"Send to Weblab" button that calls the Weblab API to create a project directly.
