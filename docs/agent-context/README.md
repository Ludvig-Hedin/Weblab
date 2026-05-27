# Agent Context Pack

This folder gives coding agents optional, high-signal context before they
edit Weblab. Root [`AGENTS.md`](../../AGENTS.md) and [`CLAUDE.md`](../../CLAUDE.md)
contain the mandatory rules. These files are supporting references — read
the ones for the area you're touching.

> **Source of truth on conflict:** [`../feature-catalog.md`](../feature-catalog.md)
> always wins. The reference docs in this folder describe the shape of the
> codebase; the catalog enumerates every individual feature, Convex module,
> package, and webhook.

> **Persistent agent memory** lives in [`../agent-memory/`](../agent-memory/).
> Read [`../agent-memory/user-preferences.md`](../agent-memory/user-preferences.md)
> at the start of every session.

## 5-minute onboarding

If you don't know where to start, read [`agents-onboarding.md`](./agents-onboarding.md)
first — it's the "everything you need in 5 minutes" digest. Then dive into
the area-specific docs below.

## Read order for most tasks

1. [`current-progress.md`](./current-progress.md) — what's in-flight and what
   assumptions are safe right now.
2. [`repo-map.md`](./repo-map.md) — where major systems live and how they
   connect.
3. [`development-setup.md`](./development-setup.md) — local commands,
   validation, migrations, env.

## Reference docs (read for the area you're touching)

- [`packages-reference.md`](./packages-reference.md) — every package in
  `packages/*` (26 total).
- [`routes-reference.md`](./routes-reference.md) — every top-level Next.js
  App Router route.
- [`trpc-routers-reference.md`](./trpc-routers-reference.md) — **stale**
  post-Convex migration; retained for history only. Use
  [`../feature-catalog.md`](../feature-catalog.md) sections 22–26 instead.

## Design system enforcement

Read before touching any UI affordance:

- [`button-enforcement.md`](./button-enforcement.md) — when (and when not)
  to use `<Button>`, allowed overrides, adding new variants without
  breaking the system.
- [`audit-dropdowns-popovers-menus.md`](./audit-dropdowns-popovers-menus.md)
  — canonical primitives + ready-to-paste audit prompt.
- [`audit-inputs-forms.md`](./audit-inputs-forms.md) — canonical primitives
  + ready-to-paste audit prompt.

## Deep dives

- [`editor-architecture.md`](./editor-architecture.md) — editor canvas,
  iframe, MobX engine, sandbox session, code-write flow.
- [`data-api-architecture.md`](./data-api-architecture.md) — Clerk + Convex,
  vestigial tRPC, REST handlers, migration discipline, security gates.
- [`ai-chat-architecture.md`](./ai-chat-architecture.md) — TipTap composer,
  mention/slash commands, model router, cache blocks, summarizer pipeline,
  observability.
- [`cms-architecture.md`](./cms-architecture.md) — CMS workspace, bindings,
  preview integration.
- [`breakpoints-architecture.md`](./breakpoints-architecture.md) — responsive
  frame breakpoints, parser rebase, DB shape (now Convex).
- [`design-product-context.md`](./design-product-context.md) — brand,
  product positioning, UI/design expectations.

## Audits + inventories

- [`style-panel-v2-inventory.md`](./style-panel-v2-inventory.md) — style
  panel structure.
- [`qa-prod-bug-report.md`](./qa-prod-bug-report.md) — point-in-time
  production QA snapshot.
- [`workspaces-rollout.md`](./workspaces-rollout.md) — multi-tenant
  workspaces rollout notes.

## Persistent memory (separate folder)

- [`../agent-memory/user-preferences.md`](../agent-memory/user-preferences.md)
  — read every session.
- [`../agent-memory/feature-log.md`](../agent-memory/feature-log.md) —
  append on significant ships.
- [`../agent-memory/architecture-decisions.md`](../agent-memory/architecture-decisions.md)
  — append on architectural choices worth remembering.
- [`../agent-memory/backend-migration-audit.md`](../agent-memory/backend-migration-audit.md)
  — 3-pass Clerk + Convex hardening audit (CRITICAL IDORs, races, SSRF,
  cost amplification). Read before touching `convex/lib/permissions.ts`,
  any `*Actions.ts`, or a new endpoint that hits paid externals.
- [`../agent-memory/performance-audit.md`](../agent-memory/performance-audit.md) /
  [`../agent-memory/tool-system-audit.md`](../agent-memory/tool-system-audit.md)
  — point-in-time audits.

## Convex AI guidelines (mandatory)

When writing Convex code, **read [`apps/web/client/convex/_generated/ai/guidelines.md`](../../apps/web/client/convex/_generated/ai/guidelines.md) first.**
It overrides model training data on Convex APIs and patterns. Convex agent
skills install with `npx convex ai-files install`.

## Working notes — `../notes/` 🤖

Dated journal of in-flight work. Naming: `YYYY-MM-DD-<kebab-topic>.md`. See
[`../notes/README.md`](../notes/README.md). Link to relevant ones from
[`current-progress.md`](./current-progress.md).

## Maintenance Rules

- Update these docs when an agent learns new durable context about
  architecture, setup, or current progress.
- New top-level route / package / Convex module / webhook → update the
  matching reference doc **and** [`../feature-catalog.md`](../feature-catalog.md)
  + [`../test-plan.md`](../test-plan.md).
- Major feature → append to [`../agent-memory/feature-log.md`](../agent-memory/feature-log.md);
  if architectural, also to [`../agent-memory/architecture-decisions.md`](../agent-memory/architecture-decisions.md).
- Keep timestamped working notes in
  [`../notes/YYYY-MM-DD-<topic>.md`](../notes/).
