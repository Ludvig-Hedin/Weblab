# Agent Context Pack

This folder gives coding agents optional, high-signal context before they edit
Weblab. Root `AGENTS.md` and `CLAUDE.md` contain the mandatory rules. These
files are supporting references that should be read when a task touches the
related area.

> **Persistent agent memory** lives in [`docs/agent-memory/`](../agent-memory/).
> Read `agent-memory/user-preferences.md` at the start of every session.

## Read order for most tasks

1. `current-progress.md` — what is currently in-flight and what assumptions
   are safe.
2. `repo-map.md` — where major systems live and how they connect.
3. `development-setup.md` — local commands, validation, migrations, and env.

## Reference docs (read for the area you're touching)

- `packages-reference.md` — every package in `packages/*` and what it does.
- `trpc-routers-reference.md` — every tRPC router and its purpose.
- `routes-reference.md` — every top-level Next.js App Router route.

## Design system enforcement

Read before touching any UI affordance:

- `button-enforcement.md` — when (and when not) to use `<Button>`, allowed
  overrides, how to add new variants without breaking the system.
- `audit-dropdowns-popovers-menus.md` — canonical primitives + ready-to-paste
  audit prompt for dropdown / popover / menu drift.
- `audit-inputs-forms.md` — canonical primitives + ready-to-paste audit prompt
  for input / search / form drift.

## Deep dives

- `editor-architecture.md` — editor canvas, iframe, MobX engine, sandbox, and
  code-write flow.
- `data-api-architecture.md` — Supabase, Drizzle, tRPC, migrations, auth, and
  integrations.
- `design-product-context.md` — product positioning, brand, UI expectations,
  and design-system rules.
- `ai-chat-architecture.md` — TipTap composer, mention/slash commands,
  surface coordination, AI provider routing.
- `cms-architecture.md` — CMS workspace, bindings, preview integration.
- `breakpoints-architecture.md` — responsive frame breakpoints, parser
  rebase, and DB shape.

## Persistent memory (separate folder)

- [`../agent-memory/user-preferences.md`](../agent-memory/user-preferences.md)
  — read every session.
- [`../agent-memory/feature-log.md`](../agent-memory/feature-log.md) — append
  on significant ships.
- [`../agent-memory/architecture-decisions.md`](../agent-memory/architecture-decisions.md)
  — append on architectural choices worth remembering.

## Maintenance Rules

- These docs are intentionally concise. Update them when an agent learns new
  durable context about architecture, setup, or current progress.
- When you ship a new package, router, or top-level route, also update the
  matching reference doc (`packages-reference.md`, etc.).
- When you ship a major feature, add an entry to
  `agent-memory/feature-log.md` and (if architectural) to
  `agent-memory/architecture-decisions.md`.
- Keep timestamped working notes in `docs/notes/YYYY-MM-DD-<topic>.md`
  (see [`../notes/README.md`](../notes/README.md)). Link to them from
  `current-progress.md` when relevant.
