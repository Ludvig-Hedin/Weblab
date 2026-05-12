# AI Tool System — Audit & Implementation Note

Prerequisite for the AI tool system rollout (registry, image gen/edit, server-side web tools, Agent Skills, project-settings tool, image tool-use UI). This note captures what already exists, what is missing, what we will reuse, and what we will not touch — so the implementation phases can act without re-auditing.

## What exists

### Provider routing & models

- `packages/ai/src/chat/providers.ts:14-79` — `initModel()` switches OpenRouter (`@openrouter/ai-sdk-provider`) vs Ollama (`ollama-ai-provider-v2`) by model-id prefix.
- `packages/models/src/llm/index.ts` — `OPENROUTER_MODELS` enum, `LLMProvider` enum, `MODEL_MAX_TOKENS` map, `getProviderFromModel()` helper.
- A separate UI/CLI manifest exists at `packages/ai/src/providers/manifest.ts` — drives the CLI provider picker only; not the chat routing.
- AI SDK version: `ai@5.0.60` (`packages/ai/package.json`). `@ai-sdk/openai` is **not** installed; `openai@^4.103.0` is installed but only as a transitive helper.
- Image generation: **none anywhere**. No `experimental_generateImage` usage.

### Tool abstractions

- `packages/ai/src/tools/models/base.ts:9-31` — `BaseTool` with static `toolName, description, parameters: z.ZodSchema, icon`. `getAITool()` wraps as AI SDK `tool({ description, inputSchema })`. `getLabel(input)` for UI.
- `packages/ai/src/tools/models/client.ts` — `ClientTool extends BaseTool` adds an `async handle(args, editorEngine)` contract for browser-side execution via the editor engine.
- `packages/ai/src/tools/toolset.ts` — registers 21 tool classes; builds `readOnlyToolset`, `allToolset`, `TOOLS_MAP`, `getToolSetFromType(chatType)`.
- 21 tool classes at `packages/ai/src/tools/classes/index.ts`: `BashEditTool, BashReadTool, CheckErrorsTool, FuzzyEditFileTool, GlobTool, GrepTool, ListBranchesTool, ListFilesTool, ReadFileTool, ReadStyleGuideTool, SandboxTool, ScrapeUrlTool, SearchReplaceEditTool, SearchReplaceMultiEditFileTool, TerminalCommandTool, TypecheckTool, UploadImageTool, WeblabInstructionsTool, WebSearchTool, WriteFileTool` (+ 1 more).
- All tools currently execute **client-side** via `EditorEngine`. There is no `ServerTool` abstraction.

### Streaming & agent loop

- `packages/ai/src/agents/root.ts:25-80` — `createRootAgentStream()` calls `streamText` with `tools, system, stopWhen: stepCountIs(8), experimental_repairToolCall, experimental_transform: smoothStream(), experimental_telemetry`. Tool-call repair uses Claude Haiku via OpenRouter; skipped for Ollama.
- `packages/ai/src/stream/converter.ts` — `convertToStreamMessages()` hydrates and stubs incomplete tool-call states.

### Chat HTTP route

- `apps/web/client/src/app/api/chat/route.ts` — already authenticates via `getSupabaseUser(req)`, imports `api` from `@/trpc/server` (line 15), passes everything to `streamResponse` and on into `createRootAgentStream`. Persists messages via `replaceConversationMessages` in `onFinish`.

### Image flow (chat upload only)

- `packages/ai/src/contexts/classes/image.ts` — `ImageContext` class wraps user-uploaded images as AI SDK file UI parts.
- `apps/web/client/src/components/ai-prompt-composer/index.tsx` — composer exposes `onImageFiles` callback; images ride along as message context, not via tRPC upload.
- `packages/ai/src/tools/classes/upload-image.ts` — `UploadImageTool` (the existing class) reads from `ImageMessageContext` in conversation history and writes the file to the sandbox under `public/`. The `uploadImageToSandbox` helper at lines 103–122 is the canonical write path.
- `packages/image-server/src/compress.ts` — `compressImageServer()` is reused by the project router and is the standard pre-write pass.

### Web tools

- `packages/ai/package.json` — has `@mendable/firecrawl-js@^1.29.1` and `exa-js@^1.8.26` deps.
- `WebSearchTool` exists and is wired (Exa-shaped result type `WebSearchResult` in `@weblab/models`).
- `ScrapeUrlTool` exists and delegates to `editorEngine.api.scrapeUrl()`.
- **Important correction during implementation**: both tools dispatch to tRPC mutations `code.scrapeUrl` and `code.webSearch` (see `apps/web/client/src/server/api/routers/code.ts:56,162`) which call Firecrawl / Exa **server-side**. The "client" label refers to dispatch path, not execution site. No duplicate ServerTool variants are needed — the existing tools already execute server-side via tRPC. Phase 4's deliverable is just the metadata (category `'web'`, provider `'exa'`/`'firecrawl'`, `requiresNetwork: true`) added in Phase 1.

### Mem0

- `packages/ai/src/memory/client.ts:1-18` — lazy singleton, `MEM0_API_KEY` env.
- `packages/ai/src/memory/operations.ts:27-69` — `searchMemories`, `addMemoriesFromConversation`. User-wide scope (cross-project).
- `packages/ai/src/prompt/provider.ts` — formats results into the system prompt as `<user-memories>`. No tool wrapper today.

### Chat UI

- `apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-messages/message-content/tool-call-display.tsx:22-220` — dispatcher by tool name with custom renderers for `TerminalCommandTool, WebSearchTool, WriteFileTool, FuzzyEditFileTool, SearchReplaceEditTool, SearchReplaceMultiEditFileTool, TypecheckTool`. Fallback to `ToolCallSimple`.
- `tool-call-simple.tsx` — uses `Tool, ToolHeader, ToolContent, ToolInput, ToolOutput` from `@weblab/ui/ai-elements`. Drives `loading` from `ToolUIPart.state`.
- `actions-group.tsx:36-144` — collapsible "Working — Xs / Worked for Ys" wrapper; auto-expand while streaming, auto-collapse when done.
- Image attachments rendered as pills via `context-pills/image-pill.tsx`.
- Build vs Ask mode toggle at `chat-input/chat-mode-toggle.tsx:17-94` (drives `ChatType.EDIT` vs `ChatType.ASK`).

### Settings & related routers

- `apps/web/client/src/server/api/routers/project/settings.ts` — `get`, `upsert`, `delete`. `protectedProcedure` enforces auth via `ctx.user.id` and `verifyProjectAccess`. **Not exposed as an AI tool.**
- `apps/web/client/src/server/api/routers/image.ts` — DEAD. `export {}`. Intentionally not registered in `root.ts`.

### MCP server

- `packages/mcp/src/server.ts:1-135` — exposes 8 tools (`read_file, list_files, grep, glob, typecheck, write_file, search_replace, bash`) for **external CLI clients only** (Claude Code, etc.). Not consumed by the in-app chat.

### Agent Skills

- **`skills/` directory now exists at the repo root** with starter skills: seo, frontend-design, accessibility, performance.
- **Production loading is zero-config**: a build-time codegen (`bun run generate:skills` from `packages/ai`) scans `skills/*/SKILL.md` and emits `packages/ai/src/skills/embedded.ts`. Wired into `apps/web/client`'s `prebuild` script so Railway picks it up automatically.
- **Dev hot-iteration**: `loadSkills()` first walks up from cwd looking for a `skills/` dir (catches edits without regen); falls through to `EMBEDDED_SKILLS` when nothing is found.
- **No env vars** required to enable Agent Skills.
- Reference impl: `docs/archive/t3code/apps/server/src/skills/SkillService.ts` (uses the Effect runtime — adapt parser/discovery, do not copy).

## What is missing

- Typed central registry with per-tool metadata (`category, provider, requiresProject, requiresAuth, requiresNetwork, visibleToUser, executionSite`).
- `ServerTool` abstraction and chat-route plumbing for server-side execution.
- Image generation / editing tools and model registry entries (`nano-banana`, `gpt-image-2` — placeholders, real provider TODO).
- Tool flows for: add generated image to project, replace selected element's image.
- Server-side Firecrawl scrape and Exa search tools.
- `update_project_settings` / `get_project_settings` AI tools.
- Agent Skills loader, `list_skills` / `read_skill` tools, system-prompt skill index.
- Image-result UI renderer in chat (inline `<img>` + "Add to project" / "Replace selected" actions).

## What we will reuse (do not rebuild)

- `BaseTool` static metadata pattern → extend, do not replace (`packages/ai/src/tools/models/base.ts`).
- `TOOLS_MAP` and `getToolSetFromType` → extend for server-context binding (`packages/ai/src/tools/toolset.ts:65`).
- `UploadImageTool.uploadImageToSandbox` → reused for both "add generated image to project" and "replace image in element" (`packages/ai/src/tools/classes/upload-image.ts:103`).
- Conversation-message lookup pattern at `upload-image.ts:53-73` → reused to resolve generated images by `toolCallId`.
- `compressImageServer` → reused as the pre-write pass for all image writes (`packages/image-server/src/compress.ts`).
- `ImageContext` → reused as the source for `edit_image` when input is an uploaded chat image (`packages/ai/src/contexts/classes/image.ts`).
- `getSupabaseUser` + `api` server caller → reused to build `ServerToolContext` (`apps/web/client/src/app/api/chat/route.ts:15,55`).
- `settingsRouter.upsert` (with `verifyProjectAccess`) → reused unchanged from the new server tool (`apps/web/client/src/server/api/routers/project/settings.ts`).
- `Tool, ToolHeader, ToolContent, ToolOutput` from `@weblab/ui/ai-elements` → reused for the new image-result renderer.
- `ActionsGroup` collapsible wrapper → reused.
- `tool-call-display.tsx` dispatcher → extended (new branch for image-gen/edit), not replaced.
- SkillService parser regex + discovery from `docs/archive/t3code/apps/server/src/skills/SkillService.ts` → ported, not copied (rewrite as plain async TS).

## What we will not touch

- MCP server at `packages/mcp/src/server.ts` — external CLI only. Mirroring the new tools there is a future follow-up.
- Dead `apps/web/client/src/server/api/routers/image.ts` — leave as `export {}`. We do not register it.
- The existing 21 tools' behavior. Phase 1 only adds opt-in `category`/`provider` metadata on a handful where the default is wrong — no schema, handler, or class-shape changes.
- The existing client-side `ScrapeUrlTool` and `WebSearchTool`. Phase 4 keeps both as fallbacks; gating chooses server variants when env keys exist.
- Mem0 system-prompt injection. We do not wrap memory as a tool in this rollout.
- AI SDK migration to v6 / `@ai-sdk/react`. We stay on `ai@5.0.60`.
- Settings UI for image-gen model selection. Out of scope for this rollout.
- Skill creation / edit / delete UI (the `save`/`remove` parts of the t3code reference). Read-only discovery only.

## Risks / open items (resolve at implementation time)

- `nano-banana` provider — no first-party AI SDK provider. Ship a placeholder model entry and a runtime error until a provider is wired.
- `gpt-image-2` exact ID — verify the current OpenAI image model ID against `node_modules/@ai-sdk/openai/docs/` before committing the call site.
- `experimental_generateImage` shape — verify export and signature against `node_modules/ai/src/`.
- `EditorEngine` method to set an element's `src` attribute — confirm exact API (likely `editorEngine.elements` or `editorEngine.style`).
- `ServerToolContext` lifetime inside `streamText`'s `tool({ execute })` closure — expected safe; if not, construct the per-request tRPC caller fresh inside `execute`.

## Phase index

The full plan lives at `/Users/ludvighedin/.claude/plans/you-are-a-senior-streamed-cherny.md`. Phases:

1. Registry foundation (BaseTool metadata, `ServerTool`, `registry.ts`).
2. Server-executable tool plumbing in the chat route + agent.
3. Image generation/edit tools + model registry placeholders + add/replace flows.
4. Server-side Firecrawl + Exa web tools.
5. Project settings as AI tool.
6. Agent Skills support.
7. Tool-use UI for image results.
