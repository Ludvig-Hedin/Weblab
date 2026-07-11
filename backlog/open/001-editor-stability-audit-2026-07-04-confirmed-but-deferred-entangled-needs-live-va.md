# Editor stability audit 2026-07-04 — confirmed-but-deferred (entangled / needs live validation)

> Full context + fixed items: [`docs/editor-stability-audit-2026-07-04.md`](docs/editor-stability-audit-2026-07-04.md). 23 issues fixed this pass; the items below are confirmed real but carry a regression risk that can't be validated without a live sandbox / responsive-frame browser session, or need a larger design change.

#### Responsive-rebase source-write corruption cluster (P1)

- **Discovered:** 2026-07-04 (editor stability audit)
- **Where:** `apps/web/client/src/components/store/editor/code/tailwind.ts:85`; `apps/web/client/src/components/store/editor/style/index.ts` (override map: `recordOverrides`, `seedOverridesFromSiblings`, `breakpointMapFor`, `isOverriddenAt`, `clearBreakpointOverride`); `apps/web/client/src/components/store/editor/action/index.ts` (rebase timers vs undo)
- **Symptom:** (a) picking a theme/named color at a breakpoint is silently reverted in source ~1.2s later and re-emitted as `bg-[rgb(...)]`; (b) panel edits at a non-base breakpoint persist unscoped (apply at all breakpoints after reload); (c) any editor-bar color/text edit in a responsive group rewrites token classes to hardcoded resolved values and emits a broken `font-Inter, sans-serif`; (d) editing then Cmd+Z within ~1.2s lets the pending rebase rewrite the just-undone value into source.
- **Root cause:** the override map conflates authored-vs-seeded and Value-vs-Custom, uses camelCase seeds vs kebab-case panel keys, feeds seeded browser-computed values to the durable write, and the debounced rebase pipeline is invisible to `HistoryManager`.
- **Next step:** give the override map per-entry `{ type, provenance }`, normalize keys to one canonical form, have `breakpointMapFor` (source write) return only authored entries while the badge UI keeps the merged view, and cancel/revert pending rebases on undo/redo. Validate against a live multi-breakpoint frame group (edit at largest/smallest/single breakpoint; undo; clear-override).
- **Risk if ignored:** theme colors can never be persisted on responsive elements; breakpoint-scoped edits corrupt on reload; quick undo is unreliable.
- **Tags:** `#bug` `#editor` `#responsive` `#data-integrity`

#### `isChildTextEditable` is a stub returning `true` (P1)

- **Discovered:** 2026-07-04 (editor stability audit)
- **Where:** `apps/web/preload/script/api/elements/text.ts:131`
- **Symptom:** double-clicking any element with a `{expression}` child opens the inline editor with no warning; committing writes wrong source (duplicated content next to the preserved expression) and undo bakes the rendered value in as a static literal.
- **Root cause:** the source-AST plain-text check all callers gate on was ported as a hardcoded `return true`.
- **Next step:** implement in `TextEditingManager.start()` via `codeEditor.getJsxElementMetadata` + element-snippet parse; return true only when all children are JSXText/`<br/>`, whitelisting trivial string-literal containers (`{' '}`) to avoid over-blocking. The parser-side child-preserving merge (in-flight `packages/parser/src/code-edit/text.ts`) stays as defense in depth.
- **Risk if ignored:** silent JSX corruption + unrecoverable loss of dynamic bindings on a very common element shape.
- **Tags:** `#bug` `#editor` `#text` `#data-integrity`

#### Sandbox reclaim after "ready" has no recovery surface (P1)

- **Discovered:** 2026-07-04 (editor stability audit)
- **Where:** `apps/web/client/src/app/project/[id]/_components/canvas/frame/index.tsx:299` (liveness gated on `!isFrameReady`; restore panel on `!isFrameReady || !frame.url`)
- **Symptom:** any session outliving the 30-min Vercel sandbox lifetime silently breaks — canvas edits still render (penpal DOM ops) but all code writes/AI/terminal/git/preview fail with zero error, toast, or restore prompt until a full reload.
- **Root cause:** the sandbox-gone design assumes the 410 only happens during boot; every recovery surface is gated on `!isFrameReady`, which never flips back. No keepalive/`sandbox.extend()` exists.
- **Next step:** include `session.sandboxGone` in the overlay/panel condition (or force `isFrameReady=false`/`immediateReload()` when it flips) to re-enter the existing restore flow; add a periodic keepalive while the editor is active.
- **Risk if ignored:** every >30-min editing session degrades invisibly.
- **Tags:** `#bug` `#editor` `#sandbox`

#### Auto-height feedback loop on vh pages (P1, medium confidence)

- **Discovered:** 2026-07-04 (editor stability audit)
- **Where:** `apps/web/client/src/app/project/[id]/_components/canvas/frame/view.tsx:625`
- **Symptom:** frames for ordinary hero+sections landing pages may balloon to the 50,000px cap; canvas becomes unusable, churns ResizeObserver→penpal→MobX cycles.
- **Root cause:** iframe height := child `scrollHeight` with no fixed-point guard; the iframe height IS the vh viewport, so `100vh` + extra content is positive feedback.
- **Next step:** measure content height against a fixed layout viewport, or freeze on a monotone roughly-constant-delta growth sequence in `setContentHeight`. Confirm the loop diverges vs converges in a real browser first.
- **Risk if ignored:** unusable canvas on common layouts.
- **Tags:** `#bug` `#editor` `#perf`

#### Engine-level generation guard for init-during-teardown (P1, follow-up to per-branch fix)

- **Discovered:** 2026-07-04 (editor stability audit)
- **Where:** `apps/web/client/src/components/store/editor/index.tsx` + `engine.ts`
- **Symptom:** the per-branch `SandboxManager`/`SessionManager`/`CommentManager` leaks are fixed; a residual global concern remains for any future engine-level long-lived resource registered during an in-flight `init()` that races `clear()`.
- **Root cause:** the same `EditorEngine` instance is reused across React StrictMode's dev double-mount, so a one-way engine-level `disposed` latch would brick the dev editor.
- **Next step:** if an engine-level guard is needed, use a generation/epoch token captured at init start and compared after awaits (NOT a permanent latch).
- **Risk if ignored:** low today (per-branch leaks are fixed); revisit before adding engine-scoped async registration.
- **Tags:** `#tech-debt` `#editor` `#lifecycle`

#### Deferred perf/serialization P2s (evidence in audit doc)

- **Discovered:** 2026-07-04 (editor stability audit)
- **Where / Symptom / Next step:**
  - `apps/web/preload/script/api/events/dom.ts:27` — per-mutated-node full-subtree `buildLayerTree` (O(N²) getComputedStyle) whose payload the parent discards. Build once per MutationObserver batch; the parent ignores the payload so send an empty notification (or consume it incrementally and skip the full `refreshLayers`).
  - `apps/web/client/src/app/project/[id]/_components/canvas/frame/gesture.tsx:432` — `handleDragOver` fires an unthrottled `getElementAtLoc` penpal RPC per dragover. Route through the existing 16ms throttle + in-flight/sequence guard.
  - `apps/web/client/src/app/project/[id]/_components/canvas/frame/resize-handles.tsx:34` (+ `overlay/locked-resize-handles.tsx`) — unthrottled window mousemove → async `undebouncedRefresh` (penpal RPCs) + observable frame-map writes per raw event. rAF-coalesce; use the debounced refresh or a reentrancy guard.
  - `apps/web/client/src/components/store/editor/code/index.ts:97` — write-code / interactions ix-id / component createProp / restampHtmlMaster / font layout writes bypass `writeChain`. Expose `CodeManager.runExclusive(fn)` and route them through it.
  - `apps/web/client/src/components/store/editor/code/index.ts:234` — `groupRequestByFile` keys by path only; cross-branch requests sharing a path merge into one group written to the first branch. Key by `${branchId}::${path}` (touches the `FileToRequests` contract + parser).
  - `apps/web/client/src/components/store/editor/history/index.ts:104` — `commitTransaction` isn't atomic (image-swap can partially apply) and splits one gesture into multiple undo entries. Check `push`'s boolean; push a composite/batch undo entry.
  - `apps/web/client/src/components/store/editor/history/storage.ts:15` — persisted undo history has no code-state fingerprint; undo after reload can write stale values when code changed externally. Persist a branch-SHA/content-hash and discard on mismatch, mirroring the git-restore clear.
  - `apps/web/client/src/components/store/editor/frame-events/index.ts:34` — one mutation triggers all-frames `processDom` + uncached Babel re-parse in `getTemplateNodeChild`. Scope `onWindowMutated` to the originating frame; memoize the parse.
- **Risk if ignored:** editing gets progressively laggier as frame/tree count grows; rare cross-branch/undo-after-external-change corruption.
- **Tags:** `#perf` `#editor` `#tech-debt`
