# AI Chat Architecture

The AI chat surface is the primary user-AI interaction in Weblab. It exists in
multiple places (homepage, create-project flow, empty-projects state, in-canvas
chat) but is built on a **shared composer** with a TipTap rich-text editor and a
common router/state pipeline.

Read this before changing chat input behavior, mention/slash commands, AI
provider routing, or chat suggestions.

## Surfaces

| Surface | Location | Purpose |
|---------|----------|---------|
| Homepage hero | `src/app/_components/hero/` | Cold-start prompt → project creation |
| Create-project dialog | shares `AiPromptComposer` | Same flow as hero, modal context |
| Empty-projects state | `src/app/projects/` | Returning user, no projects yet |
| In-canvas chat | `src/app/project/[id]/_components/right-panel/chat-tab/` | Iterative editing on an existing project |

All four surfaces use the **shared `AiPromptComposer`** at:

`apps/web/client/src/components/ai-prompt-composer/`

Legacy snapshots remain beside the previous create/editor implementations
(`hero/create.legacy.tsx`, etc.) — do not delete them without confirming no
fallback path depends on them.

## TipTap Editor

The composer uses a **TipTap rich-text editor** with custom extensions. This
replaces the previous `<textarea>` and brings inline mentions, slash commands,
and structured context.

### Key Extensions

- **Mention extension** — `@` triggers a popup that searches files, folders,
  and components in the current project. Selected items are inserted as
  styled chips with structured payload (path, type).
- **Slash command extension** — `/` triggers a command palette for:
  - Mode switching (Ask vs Build)
  - Conversation management (new, clear, export)
  - Quick context insertion
- **Image attachment** — drag/drop, paste, file picker. Images are uploaded and
  inserted as inline pills with previews.
- **Context pill nodes** — non-editable chip nodes for `@mentions`, files,
  selected elements, screenshots.

### Why TipTap

- Inline structured context (mentions, pills) without parsing string syntax.
- No layout shift on focus — preserves border/size from
  `docs/ai-chat-input-unification-2026-05-06.md`.
- Same editor on every surface → consistent shortcuts and accessibility.

### Common Files

- `components/ai-prompt-composer/index.tsx` — composer entry
- `components/ai-prompt-composer/extensions/` — TipTap extensions
- `components/ai-prompt-composer/popups/` — mention + slash popups
- `components/ai-prompt-composer/types.ts` — payload contracts

## Pipeline

1. User types in composer → TipTap content (JSON + plain text + structured
   pills).
2. On submit, the composer serializes pills into a typed `ChatContext[]`
   (file refs, screenshots, selected elements).
3. Hits `chat.message.create` (tRPC) which:
   - Validates project membership
   - Resolves the active conversation (creating one if missing)
   - Persists the user message
   - Triggers the AI streaming pipeline via `@weblab/ai`
4. AI response streams back via tRPC subscription / SSE.
5. The editor's `chat` manager appends streamed deltas to the active
   conversation in MobX state.
6. After the turn completes, `chat.suggestion.*` may be invoked to generate
   follow-up suggestion chips.

## Engine Coordination (in-canvas only)

For the in-editor chat, the `chat` manager on `EditorEngine` coordinates:

- Active conversation state and queued messages
- Streaming state (in-flight tokens, cancellation)
- Model selector and provider routing (via `@weblab/ai`)
- Context: pills, screenshots, current canvas selection, image uploads,
  paste/drag-drop
- Suggestions generated from completed turns
- **Ask vs Build mode** — Ask answers without code edits; Build runs the
  AI-driven file editor pipeline and writes to project files via the AST/code
  managers

## Framework-Aware System Prompts

The AI system prompt is now framework-aware (`@weblab/framework` detects
Next.js, Vite, Remix, Astro, TanStack Start, static HTML). The prompt is
templated with the detected framework so model output uses the right APIs and
file conventions.

When you change framework detection or system-prompt templates, also update
relevant fixtures in `packages/parser/test/data/` if AST behavior depends on
them.

## Chat API Reliability

Recent work hardened chat API behavior:

- Provider failover (OpenRouter → OpenAI fallback) for transient errors
- Chat error dedupe so failed retries don't create duplicate user messages
- Telemetry warning suppression for missing optional API keys

When adding a new provider, route through `@weblab/ai` — never instantiate
provider SDKs directly inside an app or router.

## Common Pitfalls

- Bypassing the shared composer and reintroducing a `<textarea>` (breaks
  mentions, slash, accessibility, no-layout-shift focus).
- Inserting raw text instead of structured pills for mentions — downstream
  context resolution fails.
- Forgetting to wire a new extension into the TipTap config.
- Calling provider SDKs directly instead of going through `@weblab/ai`.
- Allowing the in-canvas chat to start before the editor sandbox is ready
  (Build mode will write to nothing).

## Related Notes

- `docs/ai-chat-input-unification-2026-05-06.md` — initial unification work
- `docs/agent-context/editor-architecture.md` — `chat` manager context
