# Agent Context Pack

This folder gives coding agents optional, high-signal context before they edit
Weblab. Root `AGENTS.md` and `CLAUDE.md` contain the mandatory rules. These
files are supporting references that can be read when a task touches the related
area.

Read order for most tasks:

1. `current-progress.md` - what is currently in-flight and what assumptions are
   safe.
2. `repo-map.md` - where major systems live and how they connect.
3. `development-setup.md` - local commands, validation, migrations, and env.

Deep dives:

- `editor-architecture.md` - editor canvas, iframe, MobX engine, sandbox, and
  code-write flow.
- `data-api-architecture.md` - Supabase, Drizzle, tRPC, migrations, auth, and
  integrations.
- `design-product-context.md` - product positioning, brand, UI expectations, and
  design-system rules.

These docs are intentionally concise and should be updated when an agent learns
new durable context about architecture, setup, or current progress.
