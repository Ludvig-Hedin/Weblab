# AI Chat Optimization — Design

**Date:** 2026-05-24
**Owner:** Ludvig Hedin
**Status:** In implementation

---

## Goal

Make the Weblab AI chat as fast, cheap, smart, and robust as Claude Code, Cursor, and Lovable. Cut cost by maximizing prompt cache hits, reducing duplicated tokens, and routing each task to the right model. Cut latency by surfacing first token sooner and removing duplicate DB reads. Add observability that lets us see cost and cache hit rate per request.

---

## Architecture

Seven independent units, each one job:

```
packages/ai/src/
  observability/index.ts          ← trackAIUsage, estimateLLMCost, measureStreamTiming
  chat/
    providers.ts                  ← direct @ai-sdk/anthropic + OpenRouter fallback
    model-router.ts               ← MODEL_ROUTER_CONFIG + resolveAutoModel
    request-builder.ts            ← buildChatRequest orchestrator
    summarizer.ts                 ← shouldSummarize + summarizeConversation
  prompt/
    provider.ts                   ← split into stable + volatile
    cache-blocks.ts               ← getCachedSystemBlocks (memoized)

apps/web/client/
  src/app/api/chat/route.ts                       ← slimmer, delegates to buildChatRequest
  src/app/api/chat/summarize/route.ts             ← NEW background summary endpoint
  src/app/project/[id]/_hooks/use-chat/
    use-summarizer.ts                             ← NEW client trigger
  src/app/admin/usage/page.tsx                    ← NEW dashboard
  convex/aiUsageEvents.ts                         ← NEW table + queries
  convex/schema.ts                                ← add aiUsageEvents table
```

---

## Unit-by-unit

### 1. `observability/index.ts`

- `estimateLLMCost(model, { inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens })` → USD
- `trackAIUsage(event)` → fire-and-forget structured log + Convex insert
- `measureStreamTiming()` → returns `{ start, firstToken, end, ttfMs, totalMs }`
- Pricing table per model (USD / 1M tokens) — easy to edit

### 2. `chat/providers.ts` (extended)

- When `ANTHROPIC_API_KEY` is set AND model is Anthropic → use `@ai-sdk/anthropic` direct
- Otherwise → OpenRouter (existing behaviour)
- Direct path emits `system` and `messages` with explicit `cache_control: { type: 'ephemeral' }` markers on stable blocks
- OpenRouter path keeps the global `providerOptions.anthropic.cacheControl` fallback

### 3. `chat/model-router.ts`

```ts
type Tier = 'free' | 'free-heavy' | 'pro' | 'pro-heavy';
type SizeBucket = 'small' | 'medium' | 'large';

// Easy to edit, single source of truth
export const MODEL_ROUTER_CONFIG = {
  defaults: { /* per chat type */ },
  byTier: { /* overrides per tier */ },
  blockedOnAuto: [OPUS_4_7, GPT_5_5],  // unless tier=pro AND size=small
} as const;

export function resolveAutoModel({ chatType, tier, estimatedInputTokens }): ChatModel;
```

Routing rules:
- Default: Kimi K2.6
- CREATE (UI work): Gemini 3.1 Pro
- FIX/EDIT (backend / bug): GPT-5.4-mini
- ASK: Kimi K2.6
- PLAN: Gemini 3.1 Pro
- Free-heavy users: forced to DeepSeek V4 Flash
- Pro + small request: may use Sonnet 4.6
- Opus 4.7 / GPT-5.5 only on pro + small
- Title/summary/repair: Claude Haiku 3.5 (always)

Sync function, no DB call, no awaiting.

### 4. `prompt/cache-blocks.ts` + `prompt/provider.ts` split

`getCachedSystemBlocks(framework, memories, skills)` returns:
```ts
{
  stable: string,    // role + shadcn catalog + shell  (cacheable)
  volatile: string,  // memories + skills              (not cacheable)
}
```

Shadcn catalog string built once at module load (memoized). Stable block hashed for cache-hit telemetry.

### 5. `chat/request-builder.ts`

`buildChatRequest()` is the single entry point. Takes:
- `chatType`, `messages`, `model` (or 'auto'), `userId`, `projectId`, `conversationId`, `reasoningEffort`, `convexToken`, `tier`, `req.signal`

Returns:
- `{ stream, traceId, usageRecord, onFinish, onError }` ready for the route to return

Internals:
1. Resolve model (auto → concrete via `resolveAutoModel`)
2. **One** `projects.get` call → reuse for access check + framework
3. Parallel: memories + skills (framework already resolved above)
4. Build system blocks via `getCachedSystemBlocks`
5. Apply pre-built summary from Convex if message-budget exceeded (read-only check)
6. Construct `streamText` payload via `createRootAgentStream`
7. Wire `onFinish` to `trackAIUsage` + persist message
8. Wire `onError` to refund usage

### 6. `chat/summarizer.ts`

- `shouldSummarize(messages, model)` → boolean (true if tokens > 50% of model's context window)
- `summarizeConversation(messages)` → calls Claude Haiku via `generateText` with a tight summary prompt, returns a single synthesized assistant message stored as `<conversation-summary>` block
- Server-side helper — invoked from the new summarize route

### 7. Background summary flow

```
client                              server                       convex
  │  /api/chat (POST main turn)
  │ ─────────────────────────────────►
  │
  │  while typing or AI streaming:
  │  useConversationSummarizer
  │   - measure tokens
  │   - if > 50% window AND
  │     no summary cached:
  │  /api/chat/summarize (POST)
  │ ─────────────────────────────────►  summarizeConversation
  │                                     ─────────────────────────►  conversations.setSummary
  │                                                                  (stores summary text +
  │                                                                   summarizedUpToMessageId)
  │
  │  next /api/chat turn:
  │  reads conversation.summary
  │  prepends as <conversation-summary>
  │  drops messages older than
  │  summarizedUpToMessageId
```

### 8. `convex/aiUsageEvents.ts` + schema patch

New table:
```ts
aiUsageEvents: defineTable({
  userId: v.id('users'),
  conversationId: v.optional(v.id('conversations')),
  projectId: v.optional(v.id('projects')),
  messageId: v.optional(v.id('messages')),
  provider: v.string(),                  // 'anthropic-direct' | 'openrouter' | 'ollama'
  model: v.string(),
  chatType: v.string(),
  resolvedFromAuto: v.boolean(),
  inputTokens: v.number(),
  outputTokens: v.number(),
  cacheCreationTokens: v.number(),
  cacheReadTokens: v.number(),
  estimatedCostUsd: v.number(),
  ttfMs: v.optional(v.number()),
  totalMs: v.optional(v.number()),
  toolCallCount: v.optional(v.number()),
  errorType: v.optional(v.string()),
  createdAt: v.number(),
})
  .index('by_user_createdAt', ['userId', 'createdAt'])
  .index('by_conversation', ['conversationId'])
  .index('by_model', ['model'])
```

Also store `usage` + `estimatedCostUsd` on `ChatMetadata` per message so the client can render per-message cost.

### 9. `app/api/chat/route.ts` (refactored)

Becomes: auth → usage gate → `buildChatRequest()` → return its stream. ~60 lines instead of ~250.

### 10. Auto model option

- Add `'auto'` as a special model id (sentinel string, not in OPENROUTER_MODELS enum)
- UI selector shows 'Auto' at top with sparkle icon
- Route detects `'auto'`, calls `resolveAutoModel`
- Resolved model id reported back via `usage` metadata so user sees what ran

### 11. Admin dashboard

`/admin/usage` — table + chart of `aiUsageEvents` with filters: user, model, conversation, date range. Shows totals: spend, cache hit rate, avg TTF, top users by cost.

Access-controlled to admins only (existing `requireAdmin` Convex helper if available, else gated by `userSettings.isAdmin`).

---

## Data flow per request

```
POST /api/chat
  │
  ├─ auth (Clerk)                       50ms
  ├─ checkMessageLimit                   30ms  (parallel-safe)
  │
  ├─ buildChatRequest:                   
  │   ├─ resolveAutoModel                <1ms  (pure)
  │   ├─ ONE projects.get                30ms  (was 2x)
  │   ├─ parallel:
  │   │   ├─ memories (Mem0)             ~200ms
  │   │   ├─ skills.list                 ~30ms
  │   │   ├─ conversation.summary read   ~20ms
  │   └─ getCachedSystemBlocks           <1ms  (memoized)
  │
  ├─ usage increment (only for EDIT)     50ms
  │
  └─ stream.toUIMessageStreamResponse
      ├─ first token                     400-800ms with cache hit
      └─ onFinish:
          ├─ replaceConversationMessages
          ├─ addMemoriesFromConversation (fire-and-forget)
          └─ trackAIUsage                (fire-and-forget)
```

Expected TTF improvement: ~30% on warm Anthropic calls due to cache hits + dedup.

---

## Error handling

- Direct Anthropic 5xx → fall through to OpenRouter automatically (provider returns `null`, caller picks fallback). No user-visible disruption.
- Summarizer failure → log + skip, request proceeds with full history. Never blocks main chat.
- `aiUsageEvents` insert failure → log only. Never blocks response.
- Auto routing fallback → if no rule matches, return `DEFAULT_CHAT_MODEL`. Never throws.

---

## Testing

- `model-router.test.ts` — rule coverage per (chatType × tier × size)
- `cache-blocks.test.ts` — stable block hash stability when memories/skills change
- `summarizer.test.ts` — `shouldSummarize` threshold + idempotency
- `observability.test.ts` — cost estimation for known token counts
- `request-builder.test.ts` — dedup of projects.get, parallel context fetch

---

## Out of scope

- Streaming UI virtualization (separate concern, big change)
- Tool output size limits beyond what each tool already enforces
- RAG pipeline (not in current system)
- Multi-region routing
