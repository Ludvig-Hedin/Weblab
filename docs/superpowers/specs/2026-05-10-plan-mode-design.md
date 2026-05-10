# Plan Mode Design

**Date:** 2026-05-10  
**Status:** Approved  
**Scope:** AI chat panel (project editor) + hero/new-project inputs  

## Context

Weblab's AI chat currently exposes two modes: **Ask** (read-only, question-answering) and **Build** (edit mode, makes code changes). Users and potential customers familiar with Claude Code, Codex, and OpenCode expect a **Plan mode** where the AI researches the codebase and proposes a structured plan before touching any files. This reduces risk on large refactors, improves trust, and supports an interactive clarification flow before execution.

Goals:
- Third mode: Ask / Build / **Plan**
- Plan mode: read-only exploration → structured AI questions → markdown plan → approval card
- Available in the project editor chat panel AND on the landing/new-project inputs
- New `/projects/plan` standalone page for pre-creation planning sessions

---

## Architecture

### 1. Type Layer

**File:** `packages/models/src/chat/type.ts`

```ts
export enum ChatType {
    ASK = 'ask',
    CREATE = 'create',
    EDIT = 'edit',
    FIX = 'fix',
    PLAN = 'plan',  // NEW
}
```

No new message types. Interactive behavior is handled entirely via two new tools.

---

### 2. AI Tools

Two new client-side tools added to `packages/ai/src/tools/classes/`:

#### `AskUserQuestionTool`
```ts
toolName = 'ask_user_question'
executionSite = 'client'
description = "Ask the user a clarifying question with structured options during planning. Use when you cannot write an accurate plan without user input."
parameters = z.object({
    question: z.string().describe("The question to ask"),
    options: z.array(z.object({
        label: z.string(),
        description: z.string().optional(),
    })).describe("Clickable option chips"),
    multiSelect: z.boolean().optional().default(false),
})
```

Client behavior: renders `PlanQuestionCard`. When the tool is invoked via `onToolCall`, do NOT return a result immediately — instead store the `toolCallId` in a ref and render the card. When user selects an option or submits custom text, call `addToolOutput({ toolCallId, output: { answer: selectedLabel } })` **without awaiting it** — awaiting inside `onToolCall` deadlocks when `sendAutomaticallyWhen` is configured. The AI SDK will then automatically continue the stream with the tool output. This requires using the `addToolOutput` function exposed by `useChat` from the Vercel AI SDK.

#### `PlanCompleteTool`
```ts
toolName = 'plan_complete'
executionSite = 'client'
description = "Signal that the plan is fully written and ready for user approval. Call this ONLY after writing the complete plan in your message."
parameters = z.object({
    summary: z.string().describe("1-2 sentence summary of what the plan will do — shown in the approval card header"),
})
```

Client behavior: renders `PlanApprovalCard` with approval actions. Returns `{ status: "awaiting_approval" }` immediately (non-blocking); actual approval is handled by UI button clicks. Using `{ approved: false }` was avoided because it creates semantic confusion — the AI would interpret the tool result as a rejection. `{ status: "awaiting_approval" }` is a neutral acknowledgment that keeps the AI in a waiting state.

#### Plan Tool Set (`packages/ai/src/tools/toolset.ts`)

```ts
const planToolClasses: ToolClass[] = [
    ...readOnlyToolClasses,
    AskUserQuestionTool,
    PlanCompleteTool,
];

// In getToolClassesFromType:
case ChatType.PLAN:
    return filterUnavailable(planToolClasses);
```

---

### 3. Plan Mode System Prompt

**File:** `packages/ai/src/prompt/plan.ts` (new)  
**Export from:** `packages/ai/src/prompt/index.ts`

The prompt is **conditional on whether `projectId` is defined**. Export two variants:

#### `getPlanModeSystemPrompt` (with project — codebase-aware)
Used when `projectId` is defined (project editor PLAN mode). Full codebase exploration.

```
You are in PLAN MODE. Your role is to research the codebase and write a comprehensive plan.

RULES — you MUST follow these without exception:
1. Never modify, create, or delete any file. Read-only tools only.
2. Research before writing. Use read_file, grep, glob, bash (read-only commands) to understand the codebase.
3. Ask before assuming. If you need a decision from the user to write an accurate plan, call ask_user_question. Keep questions focused — one topic per call.
4. Write a complete plan in your response. Use this structure:
   ## Overview — what you're building and why
   ## Files to Change — bullet list of each file with a one-line description of the change
   ## Step-by-Step Changes — ordered implementation steps with rationale
   ## Risks & Considerations — potential issues, breaking changes, test impact
5. Call plan_complete when your plan is fully written. Include a 1-2 sentence summary.

You are NOT in execution mode. Do not write code changes inline. The plan document is the deliverable.
```

#### `getPlanModeNoProjectSystemPrompt` (without project — requirements gathering)
Used when `projectId` is undefined (`/projects/plan` standalone page). No codebase to explore — focus on gathering requirements and producing a high-level plan.

```
You are in PLAN MODE. There is no existing codebase to explore. Your role is to gather requirements and write a high-level plan for a new project.

RULES — you MUST follow these without exception:
1. No read_file, grep, glob, or bash tools are available. Do not attempt to call them.
2. Ask clarifying questions using ask_user_question. Focus on: tech stack, key features, data model, integrations, constraints.
3. Write a complete high-level plan in your response. Use this structure:
   ## Overview — what you're building and why
   ## Tech Stack — recommended stack with brief rationale
   ## Key Features — prioritised feature list
   ## Data Model — core entities and relationships
   ## Implementation Phases — ordered milestones
   ## Risks & Considerations — unknowns and open questions
4. Call plan_complete when your plan is fully written. Include a 1-2 sentence summary.

You are NOT in execution mode. The plan document is the deliverable.
```

**`packages/ai/src/agents/root.ts` switch update:**
```ts
case ChatType.PLAN:
    return projectId
        ? getPlanModeSystemPrompt(memories, framework, skills)
        : getPlanModeNoProjectSystemPrompt(memories);
```

> **Note:** `createRootAgentStream` must accept `projectId: string | undefined` and forward it to the prompt selector above.

---

### 4. API Layer

**File:** `apps/web/client/src/app/api/chat/route.ts`

Changes:
- In the request body schema: make `projectId` optional (`z.string().uuid().optional()`) when `chatType === ChatType.PLAN`
- Project ownership DB query: skip entirely when `projectId` is undefined and `chatType === PLAN`; pass `projectId: undefined` to `createRootAgentStream` (update its signature to accept `string | undefined`)
- Read-only tools (`ReadFileTool`, `GrepTool`, etc.) use sandbox paths from the project — with no `projectId`, the file-system context will be empty. This is acceptable for the plan page since there is no project codebase to explore yet. The AI will write a high-level plan based on the user's description alone.
- No usage quota increment for PLAN mode (follows ASK behavior)

---

### 5. Client: UI Components

#### `PlanQuestionCard` 
**Path:** `apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-messages/message-content/plan-question-card.tsx`

- Question text (text-small, foreground-secondary)
- Clickable option chips (ghost Button, rounded-full, flex-wrap)
- "Or describe your answer…" textarea fallback
- On selection: call `onAnswer(label)` → parent sends user message

Props: `{ question: string, options: { label, description? }[], multiSelect: boolean, onAnswer: (answer: string) => void, answered: boolean }`

When `answered: true`, show the selected answer as a readonly pill (disabled state).

#### `PlanApprovalCard`
**Path:** `apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-messages/message-content/plan-approval-card.tsx`

- Header: small "Plan Ready" badge + `summary` text
- Three action buttons:
  - **Build Now** (primary) — behavior varies by context (see `context` prop below)
  - **Keep Refining** (ghost) → focuses the chat input (user types refinements in PLAN mode)  
  - **Edit Plan** (ghost) → toggles the preceding plan message text into an editable textarea; user can modify and save

Props: `{ summary: string, context: 'inEditor' | 'createProject', onBuildNow: () => void, onRefine: () => void, onEditPlan: () => void, approved: boolean }`

**`context` prop behavior:**
- `'inEditor'`: `onBuildNow` → `editorEngine.state.setChatMode(ChatType.EDIT)` + send follow-up `"Proceed with the plan above."` The plan context is already present in the conversation history.
- `'createProject'`: `onBuildNow` → sets `isCreating = true`, calls `createManager.startCreate(...)`, on success calls `router.push(Routes.Project(project.id))`. The plan text must be preserved — pass it via navigation state or pre-load it into the new project's initial chat history (via `createManager`) so it is visible when the user lands on the project editor.

When `approved: true`, show a "Building…" disabled state.

#### Message Content Integration

**File:** `apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-messages/message-content/index.tsx`

Add both tools to `ALWAYS_VISIBLE_TOOLS` so they render outside the collapsible "Worked for Xs" group:
```ts
const ALWAYS_VISIBLE_TOOLS = new Set([
    GenerateImageTool.toolName,
    EditImageTool.toolName,
    'ask_user_question',  // NEW
    'plan_complete',      // NEW
]);
```

Add branches in `ToolCallDisplay` to render `PlanQuestionCard` and `PlanApprovalCard` when `toolPart.toolName` matches.

---

### 6. Mode Toggle: Project Editor

**File:** `apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-input/chat-mode-toggle.tsx`

- Refactor `getCurrentModeIcon()` and `getCurrentModeLabel()` to full switch statement (not binary EDIT vs other — bug fix)
- Add Plan option: use `Icons.Map` or `Icons.FileText` — whichever exists in `@weblab/ui/icons` (check with grep before implementing) + "Plan" label
- Dropdown width: `w-48` (was `w-40`) to accommodate descriptions
- Add sub-description text per item (grey text-mini): Build → "Make changes", Ask → "Q&A only", Plan → "Research & plan"

---

### 7. Mode Toggle: Hero + New Project

**File:** `apps/web/client/src/app/_components/hero/create.tsx`

- Add local `createMode: 'build' | 'plan'` state (default: `'build'`)
- Render a segmented control (two-item pill toggle) above or within the composer
- On submit:
  - `build` mode: existing `createProject()` flow unchanged
  - `plan` mode: `router.push('/projects/plan?prompt=<encoded>&model=<model>')`

**File:** `apps/web/client/src/app/projects/new/page.tsx` — inherits via `Create` component (no change needed).

---

### 8. New Route: `/projects/plan`

**File:** `apps/web/client/src/app/projects/plan/page.tsx`

Standalone planning chat page. No canvas, no left panel. Full-height chat.

**Layout:**
- Top bar: "Planning" badge + model selector + back button
- Main: `ChatMessages` component (same as editor chat)
- Bottom: `ChatInput` component, PLAN mode locked (mode toggle disabled)

**Flow:**
1. Read `prompt` and `model` from `searchParams`
2. Generate a `conversationId` on mount (`useState(() => uuidv4())`)
3. Start `useChat` hook with `projectId: null` — API call uses plan-mode null-project path
4. On mount + prompt available: send initial message automatically (guard with ref to prevent double-send)
5. `PlanApprovalCard` "Build Now" handler:
   a. Sets `isCreating = true` (shows `ProjectCreationLoader` overlay)
   b. Calls `createManager.startCreate(userId, originalPrompt, images)`
   c. On success: `router.push(Routes.Project(project.id))`

**Route:** `apps/web/client/src/app/projects/plan/page.tsx` — add to `routes-reference.md`.

---

### 9. i18n Keys

Add to `apps/web/client/messages/en.json` (and other locale files):
```json
"chat.modes.plan": "Plan",
"chat.modes.plan.description": "Research & plan",
"chat.planQuestion.customAnswer": "Or describe your answer…",
"chat.planApproval.title": "Plan Ready",
"chat.planApproval.buildNow": "Build Now",
"chat.planApproval.refine": "Keep Refining",
"chat.planApproval.editPlan": "Edit Plan",
"projects.plan.badge": "Planning",
"projects.plan.backButton": "Back"
```

---

## UX Polish Bundled In

| Issue | File | Fix |
|-------|------|-----|
| `getCurrentModeIcon/Label` returns Ask for CREATE/FIX types | `chat-mode-toggle.tsx:28-32` | Full switch statement |
| Dropdown `w-40` clips third mode + descriptions | `chat-mode-toggle.tsx:69` | `w-48`, add description sub-text |
| No mode selector on landing/new-project | `create.tsx` | Build / Plan segmented control |

---

## Verification

1. `bun typecheck` — no new TS errors
2. `bun lint` — no warnings
3. Manual: open project editor → mode toggle shows Ask / Build / Plan
4. Manual: select Plan → send message → AI asks question via card → answer → AI writes plan → approval card appears
5. Manual: click "Build Now" on approval card → mode switches to Build, follow-up message sent
6. Manual: landing hero → select Plan → submit → navigates to `/projects/plan` → auto-sends prompt → full plan flow runs → "Build Now" creates project + redirects
7. Manual: `/projects/new` same as landing
8. `bun test` — existing tests pass
