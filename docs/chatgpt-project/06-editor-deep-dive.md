# Weblab — Editor Architecture Deep Dive

For prompts touching the project editor (`/project/[id]`).

## Entry points

| Thing | Path |
|-------|------|
| Route | `apps/web/client/src/app/project/[id]/` |
| Main component | `_components/main.tsx` |
| Engine provider | `src/components/store/editor/index.tsx` |
| Engine root | `src/components/store/editor/engine.ts` |

`EditorEngineProvider` uses `useState(() => new EditorEngine(...))`. The engine lives in a `useRef`. Never replace with `useMemo`.

## The 20 managers

`EditorEngine` is a composition of focused managers. When adding editor behavior, add it to the narrowest relevant manager — don't thread unrelated state through the route component.

| Manager | Owns |
|---------|------|
| `branches` | Active branch, runtime, history, provider selection |
| `canvas` | Frame layout, selected frame, dimensions, navigation |
| `frames` | Individual iframe views |
| `frameEvent` | iframe/preload event bridge |
| `elements` | Element selection, hover |
| `overlay` | Selection/hover/insert chrome rendered over iframe |
| `move` | Drag-to-move |
| `insert` | Element insertion |
| `snap` | Snap-to-grid/element snapping |
| `group` | Group/ungroup operations |
| `copy` | Copy/paste |
| `ast` | Code AST manipulation (via `@weblab/parser`) |
| `style` | Style edits → AST |
| `text` | Inline text editing |
| `code` | Code panel state, file writes |
| `pages` | Page/route switching |
| `font` | Font picker |
| `theme` | Theme/color-mode |
| `image` | Image insertion/replacement |
| `chat` | AI conversations, streaming, model routing, context |
| `comment` | Canvas annotation threads |
| `presence` | Multi-user cursor/selection state |
| `screenshot` | Preview capture |
| `api` | API coordination |
| `ide` | Code panel view state |
| `action` | Serialized undo/redo actions |
| `state` | General UI state |

## Canvas / preview loop

1. Branch starts runtime provider (CodeSandbox for cloud).
2. Runtime serves the project.
3. Editor creates iframe frames → preview URL loads.
4. Preload/frame bridge annotates DOM elements with source metadata.
5. Overlay managers render chrome over iframes.
6. Edits write to files via AST or file-system manager.
7. Frame processing refreshes layers and source mappings.

**When changing canvas behavior, check**:
- `_components/canvas/**` — frame rendering
- `canvas/overlay/**` — selection/hover/insert chrome
- `src/components/store/editor/frames/**` — frame managers
- `src/components/store/editor/frame-events/**` — event bridge
- `apps/web/preload/` and `apps/web/client/public/` — preload scripts

## AI chat in the editor

The `chat` manager on `EditorEngine` coordinates:

- Active conversation (one per project/branch)
- Queued messages and streaming delta state
- Model selector + provider routing (`@weblab/ai`)
- Context: pills, screenshots, canvas selection, image attachments
- Ask vs Build mode:
  - **Ask** → answers only, no file writes
  - **Build** → code generation, writes via code/AST managers

All 4 chat surfaces (homepage, create, empty-projects, in-canvas) use the same `AiPromptComposer` component. Never bypass it with a raw `<textarea>`.

**TipTap extensions in the composer**:
- `@` → mention popup (files, folders, components)
- `/` → slash command palette (mode switch, conversation management)
- Image: drag/drop, paste, file picker
- Pills: non-editable chip nodes for mentions, file refs, selected elements

## Sandbox & runtime

- **Cloud mode**: CodeSandbox. Production path.
- **Local mode**: Desktop-first. Needs file IO, watcher, terminal, git from desktop provider.
- **Hybrid**: Planned. Must never silently overwrite local repo changes.

Rules:
- Don't mark editor ready until provider connected AND preview started.
- Sandbox restart → clear error/loading state → attempt provider reconnect.
- Local/hybrid → always require explicit user action before overwriting local files.

Read `docs/project-runtime-modes.md` before changing runtime logic.

## CMS workspace (NEW)

New panel in `_components/cms-workspace/` for binding canvas elements to content sources. The `cms` tRPC router exposes: source management, collection/item browsing, binding upsert/remove, snapshot for preview. Credentials for external sources encrypted AES-256-GCM via `CMS_SOURCE_ENCRYPTION_KEY`.

CMS binding mutations do NOT participate in editor Cmd-Z undo (intentional — see `docs/agent-context/cms-architecture.md`).

## Breakpoints (NEW)

`frames` table has breakpoint metadata (migration `0029`). Editor manager in `store/editor/breakpoints/`. Parser rebase handles Tailwind responsive class updating (`md:`, `lg:`).

## Common risks when touching the editor

- Missing `use client` on observer/event-driven components.
- `useMemo` for a MobX store (data loss risk).
- Synchronous engine cleanup during route transitions (race condition).
- Starting UI before sandbox connection is valid.
- Writing to preview state without also writing to source code.
- Writing to source code without refreshing frame/layer mappings.
- Treating local-mode metadata as fully functional (desktop provider isn't complete yet).

## Key files to check before editor changes

```
src/app/project/[id]/_components/
├── canvas/          # iframes, frame chrome, overlays, hotkeys
├── left-panel/      # code panel, design panel (components, assets)
├── right-panel/     # chat tab (AI), style tab v2 (inspector)
├── top-bar/         # toolbar, branch, publish
├── bottom-bar/      # terminal, status
├── editor-bar/      # element info bar
├── cms-workspace/   # CMS panel (new)
├── members/         # presence, invites
└── branch/          # branch switcher UI
```
