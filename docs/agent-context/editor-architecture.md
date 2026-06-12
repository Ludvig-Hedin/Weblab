# Editor Architecture

The editor is the core product surface. Read this before touching project
editor UI, canvas behavior, iframe communication, code editing, sandbox startup,
or AI-chat context.

## Entry Points

- Project editor route: `apps/web/client/src/app/project/[id]/**`
- Main project editor component:
  `apps/web/client/src/app/project/[id]/_components/main.tsx`
- Editor store provider:
  `apps/web/client/src/components/store/editor/index.tsx`
- Engine root: `apps/web/client/src/components/store/editor/engine.ts`

`EditorEngineProvider` creates one `EditorEngine` per project with
`useState(() => new EditorEngine(...))`, stores the active engine in a ref, and
clears it asynchronously on project changes/unmount. Preserve this pattern; do
not replace it with `useMemo`.

## Engine Managers

`EditorEngine` composes focused managers:

- `branches` - active branch, runtime, history, and provider selection.
- `canvas` and `frames` - frame layout, selected frame, dimensions, navigation,
  and iframe views.
- `frameEvent` - bridge between iframe/preload events and editor state.
- `elements`, `overlay`, `move`, `insert`, `snap`, `group`, `copy` - visual
  editing interactions.
- `ast`, `style`, `text`, `code`, `pages`, `font`, `theme`, `image` - code and
  asset manipulation.
- `chat` - conversations, AI context, queued messages, suggestions, and code
  edit requests.
- `comment` and `presence` - collaboration/commenting state.
- `screenshot` - preview image capture/update state.
- `api`, `ide`, `action`, `state` - API coordination, code panel state,
  serialized actions, and UI state.

When adding behavior, put it in the narrow manager that owns the concept. Avoid
threading unrelated state through the route component.

## Canvas And Preview Loop

High-level flow:

1. A branch starts a runtime provider.
2. The runtime serves the project.
3. The editor creates iframe frames for the preview URL.
4. The preload/frame bridge annotates DOM elements with source metadata.
5. Overlay managers render selection/hover/insert UI over the iframe.
6. Edits update immediate preview state and then persist to files through AST or
   file-system managers.
7. Frame processing refreshes layers and source mappings.

Changing canvas behavior usually requires checking:

- frame components in `src/app/project/[id]/_components/canvas/**`
- overlay components in `canvas/overlay/**`
- frame managers in `src/components/store/editor/frames/**`
- frame events in `src/components/store/editor/frame-events/**`
- preload script files under `apps/web/client/public` and `apps/web/preload`

## Sandbox And Runtime Providers

Cloud mode currently uses CodeSandbox-backed behavior. Local mode is plumbing
for desktop-first editing and must receive root path, dev command, and port
metadata when available.

Important rules:

- Do not mark an editor session ready until the runtime provider is connected
  and preview startup has succeeded.
- Sandbox restart should clear loading/error states on failure and attempt
  provider reconnection when missing.
- Local/hybrid modes must never overwrite a user's local repo changes without
  explicit user action.

Read `docs/notes/2026-05-06-project-runtime-modes.md` before changing runtime logic.

## AI Chat In The Editor

Canvas chat is not only UI. It coordinates:

- active conversation state
- queued messages and streaming state
- model selector and provider routing
- context pills, screenshots, image uploads, paste/drag-and-drop handling
- suggestions generated from completed conversation turns
- Ask/Build mode behavior

The chat input on every surface (homepage, create, in-canvas) shares a single
**TipTap-based composer** at `apps/web/client/src/components/ai-prompt-composer/`
with `@` mention popup and `/` slash command palette. **Read
`ai-chat-architecture.md` before changing chat input behavior or AI provider
routing.**

Preserve the no-layout-shift focus behavior described in
`docs/notes/2026-05-06-ai-chat-input-unification.md`.

## CMS Workspace

The editor now includes a CMS workspace (`_components/cms-workspace/`) that
binds canvas elements to external content sources, with a `cms-pill` indicator
and `block-preview` rendering. The `cms` tRPC router exposes the data model.
**Read `cms-architecture.md` before changing CMS bindings, the workspace UI,
or the `cms` router.**

## Responsive Frame Breakpoints

Frames now carry breakpoint metadata (migration `0029_frame_breakpoints.sql`)
and the parser includes a responsive class rebase step. **Read
`breakpoints-architecture.md` before changing frame dimensions, the parser
rebase logic, or breakpoint UI.**

## Component System (Master/Instance)

Code is the source of truth — see ADR 2026-06-12 and catalog F-788/F-789.

- **Discovery**: `discoverComponentsInAst` (`packages/parser/src/component/discover.ts`) runs inside `CodeFileSystem`'s per-write parse pass and on `rebuildIndex`; definitions land in a per-branch component index (`.weblab/cache/components.json`) exposed via `listComponents` / `onComponentsChanged`. HTML partials under `weblab/components/` are discovered via their in-file JSON manifest (`parseComponentManifest`) and carry a content hash (`ComponentDef.version`) used to detect master edits.
- **Identity**: an element's `instanceId` (`data-oiid`, resolved by `AstManager.findNodeInstance`) exists only on the instance *boundary* and points at the usage-site oid (`<Card data-oid=…>`). Elements inside the master share oids across all rendered instances; structural edits on them ARE master edits.
- **`ComponentsManager`** (`store/editor/components/`): definitions list, in-context edit session (`editing`), scope checks (`isInEditScope`), prop reads/writes, create-from-selection, unlink, variants, HTML re-stamp orchestration. Master editing is a **sub-state of DESIGN mode** — gesture double-click enters it, ESC/click-outside/banner-Done exit, and `ElementsManager.mouseover/click` enforce the scope.
- **Per-instance props** are plain JSX attributes at the usage site, written through the existing `CodeDiffRequest` pipeline; `updateNodeProp` understands `{ __remove }` (reset to default) and `{ __jsx }` (expression values).
- **HTML stamping** (`packages/parser/src/component/html/stamp.ts`): instances are stamped with marker attrs on the root and `${masterOid}~${instanceId}` oids (stable across re-stamps, reversible). Master writes trigger `restampPage` across all pages (idempotent, diff-skipped). The client edit pipeline (`code/requests.ts`) routes per-pipeline — parse5 for `.html`, Babel for JSX.
- **Canvas language**: purple = components (outline, chip, banner), green = property connections (dots, dotted outlines), blue = plain elements.

## Common Risks

- Missing `use client` on observer/event-driven components.
- Creating MobX stores with `useMemo`.
- Clearing an engine synchronously during route transitions.
- Starting UI before sandbox/provider connection is valid.
- Updating preview-only state without writing to code.
- Writing to code without refreshing frame/layer mappings.
- Treating local-mode metadata as fully functional desktop local editing before
  the provider is complete.
