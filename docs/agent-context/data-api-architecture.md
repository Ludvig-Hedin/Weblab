# Data, API, Auth Architecture

Last refreshed: 2026-05-27.

> **Big picture:** Weblab is on **Clerk** (auth) + **Convex** (data + functions).
> Legacy Supabase + tRPC are mostly gone. Two tiny tRPC routers remain at
> `apps/web/server/src/router/` (`sandbox`, `components`) for the editor →
> Fastify sandbox lifecycle — do not extend them.

## Convex (primary backend)

Location: [`apps/web/client/convex/`](../../apps/web/client/convex/).

- Functions are exported per-domain module as `query` / `mutation` / `action`.
  Examples: `projects.ts`, `chatActions.ts`, `cmsBindings.ts`,
  `branchActions.ts`, `layoutGuideStyles.ts`.
- Schema source of truth: [`convex/schema.ts`](../../apps/web/client/convex/schema.ts).
- Generated client: `convex/_generated/api.d.ts` (do not edit by hand).
- **Always read [`convex/_generated/ai/guidelines.md`](../../apps/web/client/convex/_generated/ai/guidelines.md)
  before writing Convex code.** Overrides anything the model learned from
  training data about Convex API shapes.
- Install Convex agent skills (one-off): `npx convex ai-files install`.

### Rules

- Use `v` validators (`convex/values`) for every argument shape.
- Add `requireCap` / `requireProjectCreateCap` / `requireProjectUpdateCap` /
  `getUserByClerkIdSafe` from `convex/lib/permissions.ts` **before** any
  side effect or paid external call. Never gate after the fact.
- `requireUserJIT` is the canonical user resolver; do not call
  `.unique()` on `users by_clerk_user_id` directly (the Clerk webhook can
  race; use `.collect()` + dedupe or the shared helper).
- HTTP webhooks live in `convex/http.ts`. Clerk + Stripe handlers route here.
  See `convex/lib/stripeWebhook.ts` for the Stripe-specific handler.
- Cron jobs: `convex/crons.ts`.
- Internal-only helpers and cascades: `convex/internal/` and
  `convex/lib/`.

### Calling Convex from Next.js

Two clients:

| From | Use |
|---|---|
| Server components / route handlers / actions | `apps/web/client/src/lib/sandbox-server-client.ts` and similar server clients import from `convex/_generated/api` |
| Browser / client components | `@/components/clerk-convex-providers` wires `ConvexProviderWithClerk` so React hooks (`useQuery`, `useMutation`, `useAction`) carry the Clerk token automatically |

Never call a Convex mutation from a Next.js webhook directly — use Convex's
own HTTP actions (`convex/http.ts`).

## Clerk (auth)

- Convex side: [`convex/auth.config.ts`](../../apps/web/client/convex/auth.config.ts)
  wires Convex identity verification to Clerk's JWT template named `convex`.
  The deployment env var `CLERK_JWT_ISSUER_DOMAIN` must be set:
  `bunx convex env set CLERK_JWT_ISSUER_DOMAIN <issuer-url>`.
  The module **fails loud** if missing — Convex otherwise silently rejects
  every JWT thereafter (invisible misconfig).
- Next.js side: `@clerk/nextjs` middleware in `src/middleware.ts`; provider
  in `src/components/clerk-convex-providers.tsx`; custom sign-in at
  `src/app/sign-in/[[...rest]]/page.tsx` (custom UI replacing the prebuilt
  component); SSO callback at `src/app/sign-in/sso-callback/page.tsx`.
- Clerk → app user bridge: `src/utils/auth/clerk-bridge.ts` produces a
  `BridgedUser` (local interface, not a `@supabase/supabase-js` import).
  Logs loudly when Clerk's `convex` JWT template is misconfigured (silent
  null was the prior failure mode that caused infinite sign-in loops).
- Clerk → Convex webhook: `convex/http.ts` routes `clerkWebhooks.upsertUser`
  / `deleteUser`. Both use `.collect() + dedupe` on `by_clerk_user_id` to
  survive duplicate-user races during onboarding.

## Supabase (vestigial)

- `src/utils/supabase/*` exist as **stub clients** kept type-only so legacy
  callers compile. The legacy storage path emits a `warn-once` telemetry
  log.
- `apps/backend/supabase/` is a **read-only archive** of legacy migrations.
  Do not add new SQL there.
- `SUPABASE_*` env vars are all optional. If you remove the last Supabase
  client call from a file, also delete the import.

## REST route handlers

Location: [`apps/web/client/src/app/api/`](../../apps/web/client/src/app/api/).

| Route | Purpose |
|---|---|
| `/api/health` | Liveness check (used by Railway healthcheck) |
| `/api/chat` (+ `/api/chat-images`) | Streaming AI chat. Builds a request via `packages/ai/src/chat/request-builder.ts`, routes the model via `model-router.ts`, applies cache blocks (`prompt/cache-blocks.ts`), emits observability events (`observability/index.ts`), and updates Convex usage records. Passes `req.signal` through `streamText` so navigations cancel LLM calls. |
| `/api/ai/inline-edit` | Inline AST edit agent (Babel edits via `@weblab/parser`). |
| `/api/ai/tab-complete` | Tab-completion agent. Requires `projectId` ownership check. |
| `/api/models` | Available model catalog for the model picker. |
| `/api/transcribe` | Speech-to-text. |
| `/api/email-capture` | Newsletter / marketing email capture. |
| `/api/promo-resume` | Promo signup resume helper. |

Each handler validates input with Zod, delegates to Convex (or directly to
`@weblab/ai`) and returns plain JSON or streaming responses. Cost-amplifying
LLM endpoints (`applyDiff`, `generateTitle`, `generateSuggestions`, screenshot
capture) gate on `requireProjectCreateCap` / `requireProjectUpdateCap` before
external spend.

## tRPC (vestigial)

Only two routers remain at [`apps/web/server/src/router/`](../../apps/web/server/src/router/):

- `sandbox` — editor → Fastify sandbox lifecycle.
- `components` — shadcn block / component metadata.

The Fastify server runs separately (`apps/web/server`). The client uses
`src/trpc/client.ts` to reach it. **Do not** add new routers — anything new
goes into Convex.

The historical [`trpc-routers-reference.md`](./trpc-routers-reference.md) is
retained for archaeology but is stale.

## Shared models

`packages/models/src/**` — TypeScript types shared across the app, Convex
schema, AI pipeline, editor stores, and parser. When a persisted shape
changes, usually update all of these together:

- Convex schema (`apps/web/client/convex/schema.ts`)
- shared model type (`packages/models/src/**`)
- Convex query/mutation/action input/output behavior
- UI consumers
- docs (`docs/feature-catalog.md` + this file when architecture shifts)

`packages/db/*` (Drizzle) lingers for legacy types and migration archaeology;
new fields go on Convex tables, not Drizzle.

## External integrations

| Integration | Where |
|---|---|
| Vercel Sandbox | `packages/code-provider/src/providers/vercel-sandbox/index.ts` (project runtime) |
| Stripe | `@weblab/stripe`, `convex/subscriptionActions.ts`, `convex/lib/stripeWebhook.ts` |
| OpenRouter / OpenAI / Anthropic | `@weblab/ai/src/chat/providers.ts` + `model-router.ts` |
| Morph / Relace | `@weblab/ai` (fast apply) |
| Firecrawl | `@weblab/ai` (web tools) + screenshot capture |
| Exa | `@weblab/ai` (web search) |
| Mem0 | `@weblab/ai` (memory) |
| Freestyle | hosting publish helpers (`convex/lib/publishHelpers.ts`) |
| GitHub | `@weblab/github`, `convex/githubActions.ts` |
| Figma | `@weblab/figma`, `convex/figmaActions.ts`, `@weblab/figma-plugin` |
| PostHog / Gleap / Langfuse / n8n | analytics / feedback / observability / outbound workflows |
| Mem0 / Sentry | optional |

Integration env keys are optional in development. Route behavior should fail
clearly when a required key for the requested feature is missing.

## Migration discipline

- Convex schema changes ship with the code; no migration file needed for
  additive fields with defaults. Destructive changes (drop / rename) need
  a deliberate cutover plan written into the relevant Convex module.
- The Convex CLI applies schema changes automatically on `bunx convex dev`.
- Do **not** add SQL migrations under `apps/backend/supabase/`. That tree
  is archived.
- If a change requires running `bunx convex deploy` in production, document
  it in a `⚠️ MANUAL STEP REQUIRED` block at the end of your response.

## Security gates (canonical pattern)

```ts
// convex/<module>.ts
import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { requireProjectUpdateCap } from './lib/permissions';

export const updateFoo = mutation({
  args: { projectId: v.id('projects'), value: v.string() },
  handler: async (ctx, args) => {
    await requireProjectUpdateCap(ctx, args.projectId); // ← gate FIRST
    return await ctx.db.patch(args.projectId, { foo: args.value });
  },
});
```

Every audit pass (see `docs/agent-memory/backend-migration-audit.md`)
has closed a CRITICAL IDOR caused by a missing gate. Treat
`requireCap` as non-negotiable.
