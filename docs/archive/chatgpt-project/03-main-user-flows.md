# Weblab — Main User Flows

These are the core journeys a user takes through the product. Understand these before proposing UI or flow changes.

## 1. Create a project

**Entry points**: Homepage hero (`/`), Projects page (`/projects`), empty-projects state.

**Paths**:
- **AI prompt** — user types a description → AI generates a Next.js project in CodeSandbox
- **Template** — user picks a starter template
- **Import GitHub repo** — user connects GitHub, picks a repo → fork into sandbox
- **Open local folder** — desktop only, opens local Next.js project
- **Figma import** — Figma selection → code generation

**Flow**:
1. User hits create on homepage hero or projects page
2. `AiPromptComposer` (TipTap) shows — user types prompt or selects import method
3. Framework auto-detected or selected via `framework-select-dialog.tsx`
4. Project created in DB (`project.create` tRPC), branch initialized
5. CodeSandbox sandbox created for cloud mode (`sandbox` tRPC router)
6. User redirected to `/project/[id]`

**Key components**:
- `apps/web/client/src/app/_components/hero/` (create.tsx, import.tsx, start-blank.tsx)
- `apps/web/client/src/components/ai-prompt-composer/`
- `apps/web/client/src/components/store/create/`

---

## 2. Visual editing (core loop)

**Entry**: `/project/[id]`

**Flow**:
1. Editor loads → `EditorEngine` initializes with ~20 managers
2. Runtime provider connects (CodeSandbox for cloud)
3. User's project renders in an iframe canvas
4. User clicks element → selection overlay appears, element inspector opens in right panel
5. User drags to move, edits styles in the right panel, or types in the element
6. Changes write to files via AST (`@weblab/parser`) or file-system manager
7. Preview refreshes; layers re-map to source

**What can be edited visually**:
- Styles (layout, spacing, color, typography, border, shadow)
- Text content (inline edit)
- Component insertion (shadcn/Radix/custom from left panel)
- Page/route switching
- Responsive breakpoints (per-frame)
- Fonts and themes

**Key components**:
- `src/app/project/[id]/_components/canvas/` — frame rendering, overlays
- `src/app/project/[id]/_components/right-panel/style-tab-v2/` — style inspector
- `src/app/project/[id]/_components/left-panel/design-panel/` — component browser
- `src/app/project/[id]/_components/editor-bar/` — selected element info

---

## 3. AI chat (Ask vs Build)

**Entry**: Right panel chat tab or chat icon in toolbar.

**Modes**:
- **Ask mode** — AI answers questions about the codebase. No file edits.
- **Build mode** — AI generates/edits code, writes to project files. Streaming diff view.

**Flow**:
1. User types in TipTap composer (`AiPromptComposer`)
2. Optionally adds context pills (`@` mention files, canvas selection, screenshots)
3. Message sent → `chat.message.create` tRPC → streams via AI SDK (`@weblab/ai`)
4. Model routed through OpenRouter (default) or local CLI provider
5. Build mode: diffs streamed, files written via code manager + AST
6. Completion: suggestions generated (`chat.suggestion.*`)

**Context the AI gets**:
- Framework (Next.js, Vite, etc.) from `@weblab/framework`
- Selected element (selector, computed styles, file location)
- Mentioned files via `@` mentions
- Screenshots of canvas
- Active conversation history

**Key files**:
- `src/components/ai-prompt-composer/` — shared TipTap input
- `src/app/project/[id]/_components/right-panel/chat-tab/` — in-editor chat
- `src/components/store/editor/` → `chat` manager
- `src/server/api/routers/chat/` — tRPC chat router

---

## 4. Publish / deploy

**Entry**: Top bar → Publish button.

**Flow**:
1. User clicks Publish
2. `publish` tRPC router packages project files
3. Freestyle hosting receives the build
4. User gets a preview URL (auto-generated)
5. Optionally connects a custom domain via `domain` router
6. DNS verification → domain goes live

**Key files**:
- `src/server/api/routers/publish/`
- `src/server/api/routers/domain/`
- `src/app/project/[id]/_components/top-bar/`

---

## 5. Collaboration

**Entry**: Members button in top bar or project settings.

**Features**:
- Invite team members via email (`invitation` router)
- Real-time cursor and selection sharing (Supabase Realtime via `presence` manager)
- Canvas comments (thread + reply, pinned to X/Y or element selector)
- Branch-based work isolation

**Key files**:
- `src/server/api/routers/project/member.ts`
- `src/server/api/routers/project/invitation.ts`
- `src/server/api/routers/comment/`
- `src/components/store/editor/` → `comment`, `presence` managers

---

## 6. GitHub sync

**Entry**: Branch panel or project settings.

**Flow**:
1. User connects GitHub via OAuth (`provider` router)
2. Selects/creates repo
3. Changes auto-commit on file writes
4. User can pull upstream from GitHub without leaving editor

**Key files**:
- `src/server/api/routers/github.ts`
- `packages/github/`

---

## 7. CMS workspace (NEW)

**Entry**: CMS icon in editor left panel or canvas element context menu.

**Flow**:
1. User opens CMS workspace
2. Connects an external source (Payload CMS, Strapi, REST API) or uses built-in Weblab content
3. Creates a collection
4. Selects canvas element → binds it to a field in the collection
5. CMS pill appears on bound elements in canvas
6. Preview shows real content; switching items updates the preview

**Key files**:
- `src/server/api/routers/cms/`
- `src/app/project/[id]/_components/cms-workspace/`
- `packages/db/src/schema/` → `cms_*` tables

---

## 8. Marketing site flows (weblab.build)

Public pages a non-logged-in user sees:

- `/` — Hero, product features, create CTA
- `/features` — Feature deep-dives
- `/pricing` — Plan comparison, Stripe checkout
- `/blog` — MDX blog posts (`apps/web/client/content/blog/`)
- `/changelog` — Shipped features (`src/lib/changelog-entries.ts`)
- `/compare` — vs Framer, Webflow, v0, Bolt
- `/workflows` — Claude Code integration, vibe coding
- `/download` — Desktop app
- `/see-a-demo` — Demo booking
