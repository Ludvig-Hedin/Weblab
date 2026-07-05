# Editor Stability, Performance & UX Audit — 2026-07-04

Scope: the core visual-editor loop (open project → connect runtime → iframe
preview → select/hover → edit text/style → drag/move/insert/delete → undo/redo →
switch page/breakpoint → refresh/restart → persist to source → recover
selection/overlays). Evidence-based: every finding cites real code.

## Method

- **Discovery**: a 10-dimension parallel audit (lifecycle, frame-events,
  overlay/selection, pointer/drag perf, style-write ordering, text/AST integrity,
  undo/redo, runtime readiness, canvas/frame cost, inspector UX) surfaced 56 raw
  findings → 48 after dedup → 36 P0–P2 candidates + 12 P3.
- **Verification**: each candidate went through a 2-lens adversarial pass
  (a *refute* lens + a *does-it-reproduce* lens). Findings #1–#10 completed the
  adversarial pass (both lenses = real). #11–#36 were then **hand-verified
  against the actual source** by the implementing engineer (the verify agents
  hit an API session limit mid-run; each was re-read and confirmed or
  reclassified by direct code inspection before any fix).
- **No P0** (data-loss-on-disk / crash / corrupted code with no recovery) was
  found. The worst confirmed issues are P1: a blank-project boot dead-end, an
  engine-teardown resource leak, and a cluster of responsive-style source-write
  corruption bugs.

Severity: **P0** data loss / crash / corrupted code / editor unusable ·
**P1** core editing regularly breaks/freezes/incorrect state ·
**P2** recoverable but confusing/slow · **P3** polish.

---

## Fixed this pass

Each entry: severity, user impact, root cause, files, and how it was verified.

### F1 — Blank project stranded on "Setting up your workspace" (P1)
- **Impact**: essentially every "Start blank" project (the primary create path)
  could open onto a frame stuck forever with no recovery CTA.
- **Root cause**: `effectiveBootstrap = initialBootstrap ?? bootstrap` pinned the
  editor to the pre-provisioning SSR snapshot (empty frame URLs). The live
  Convex query — subscribed *specifically* for the frames-pending case — was
  discarded, so `applyFrames` never saw a real URL, `frame.url` never flipped,
  and the reload-on-URL effect (`canvas/frame/index.tsx:185`) never fired.
- **Fix**: prefer the live bootstrap once resolved in the pending-sandbox case.
- **Files**: `_hooks/use-start-project.tsx`.
- **Verified**: traced the full apply→reload chain in code; the reload effect
  keys on `frame.url` transitioning from `''`.

### F2 — Engine teardown leaked a zombie sandbox stack (P1)
- **Impact**: navigating away while a project is still loading (the normal state
  under dev StrictMode) leaked a live provider + refcounted `CodeProviderSync`
  (file pull/watch) + MobX reactions per attempt, retaining the disposed engine
  graph. Reopening reused the leaked keyed sync instance.
- **Root cause**: `SandboxManager.init()` runs from `BranchManager.init`'s
  `Promise.all` *after* an `await codeEditor.initialize()`, so a `clear()` can
  land before init even runs; the continuation then registered a
  `fireImmediately` provider reaction + sync engine that nothing disposed.
  `SessionManager.start()`'s retry loop had the same gap.
- **Fix**: per-branch `disposed` latch on `SandboxManager` and `SessionManager`
  (safe because both are recreated fresh on re-init — never reused after
  `clear()`, so no StrictMode brick). `init()` bails if disposed; the provider
  reaction releases the sync engine if `disposed` flipped during its await;
  `start()` tears down a provider/terminals created after a `clear()` and bails
  after the retry sleep.
- **Files**: `store/editor/sandbox/index.ts`, `store/editor/sandbox/session.ts`.
- **Verified**: confirmed `session.clear()` is only reachable from
  `SandboxManager.clear()` (teardown) — reconnect/restart/swapToOnline call
  `start()` but never `clear()`, so the latch can't break live reconnects.
- **Note**: the engine-level (non-per-branch) disposed guard was deliberately
  *not* implemented as a latch — see F2-blocked below.

### F3 — Safe-fallback penpal proxy contributed zero methods (P1)
- **Impact**: on a still-booting frame or after an in-place iframe reload, a
  registered frame view had no bridge methods; `refreshLayers()` threw
  `processDom is not a function`, aborting overlay refresh + selection
  validation for *all* frames.
- **Root cause**: `createSafeFallbackMethods()` returned a get-only `Proxy` over
  an empty target; `Object.assign(iframe, { ...remoteMethods })` enumerates own
  keys → the spread copied nothing.
- **Fix**: fallback is now a plain object with real own-enumerable function
  properties built from a `PENPAL_METHOD_NAMES` list; `refreshLayers` guards
  each frame with a `typeof … === 'function'` + try/catch so one booting frame
  can't abort the sweep.
- **Files**: `canvas/frame/view.tsx`, `store/editor/engine.ts`.

### F4 — Canvas wheel zoom/pan dropped input from stale closures (P1)
- **Impact**: pan and pinch-zoom (the most-used gestures) dropped deltas
  whenever >1 wheel event landed per React commit — sluggish/jumpy fast scroll,
  zoom-to-cursor drift.
- **Root cause**: `handleZoom`/`handlePan` read `scale`/`position` from
  render-time closures refreshed only on commit; trackpads emit 2+ events/frame.
  The file's own locked-canvas branch already documents and fixes this for
  itself.
- **Fix**: read `editorEngine.canvas.scale/position` fresh at event time; drop
  them from the `useCallback` deps (also stabilises the wheel listener).
- **Files**: `canvas/index.tsx`.

### F5 — Style slider committed a full undoable AST write per drag tick (P1)
- **Impact**: dragging opacity/blur enqueued dozens of sequential whole-file
  read→parse→regenerate→write cycles; the undo stack flooded (one entry per
  pixel); the sandbox kept writing seconds after release.
- **Root cause**: `SliderField` fired `onCommit` on every Radix `onValueChange`
  with no drag state and no `onValueCommit`.
- **Fix**: wrap the drag in a history transaction (live preview per tick via the
  existing dispatch; one source write + one undo entry on `onValueCommit`);
  commit on unmount so an interrupted drag can't leave the transaction open.
- **Files**: `right-panel/style-tab-v2/controls/slider-field.tsx`.

### F6 — `updateStyleNoAction` wrote to the wrong object level (P1)
- **Impact**: the optimistic style mirror was invisible to every consumer
  (`useStyleValue`, editor-bar hooks) until the debounced re-click refreshed
  selection; within that window a quick A→B→A revert was silently dropped
  (`useStyleSetter`'s same-value short-circuit compared against a never-updated
  `defined`) — source kept the intermediate value while the panel showed the
  revert.
- **Root cause**: it spread flat CSS props at the top level of
  `SelectedStyle.styles` instead of into the nested `{ defined, computed }`
  sub-maps (stale since the `DomElementStyles` shape changed).
- **Fix**: merge into both `defined` and `computed`; coerce nullish to `''`.
- **Files**: `store/editor/style/index.ts`.
- **Test**: `style/update-style-no-action.test.ts`.

### F7 — `flushPendingRebases` didn't flush (P2, part of the undo/rebase cluster)
- **Impact**: reloading within ~1.2s of a breakpoint-scoped edit silently
  dropped the responsive source write; the `beforeunload` guard never warned.
- **Root cause**: the flush routed through the *debounced* `writeResponsiveStyle`
  (a `keyedDebounce`), which merely armed another 600ms timer that never fired
  before unload.
- **Fix**: added `CodeManager.writeResponsiveStyleNow` (immediate variant);
  `runSourceRebase`/`flushPendingRebases` use it. Also `ActionManager.clear`
  now cancels the trailing `refreshDomElement` debounce.
- **Files**: `store/editor/code/index.ts`, `store/editor/action/index.ts`.

### F8 — Persisted undo history wiped on every in-app navigation (P1-adjacent)
- **Impact**: routing away and back lost the undo stack (persistence was
  effectively dead) because teardown ran the destructive `clear()`.
- **Root cause**: `BranchManager.initBranches`/`clear` (engine teardown) called
  `HistoryManager.clear()`, which deletes IndexedDB history.
- **Fix**: split teardown from destruction — `dispose()` flushes the pending
  persist and drops the in-memory stacks but keeps IndexedDB; `clear()` (branch
  delete only) still wipes. Engine teardown now calls `dispose()`.
- **Files**: `store/editor/history/index.ts`, `store/editor/branch/manager.ts`.
- **Test**: `history/dispose.test.ts`.

### F9 — Canvas hotkeys hijacked text editing in inspector inputs (P1)
- **Impact**: while typing in a style input, Cmd+X deleted the selected canvas
  element (and wrote the removal to source), Cmd+C/V copied/pasted the element,
  Shift+Arrow reordered it — because inspector inputs exist *only when an element
  is selected*, so the "is anything selected?" gate never fired.
- **Fix**: `isEditableTarget()` guard (focus in input/textarea/select/
  contentEditable) at the top of COPY/PASTE/CUT/DUPLICATE/COPY_STYLES/
  PASTE_STYLES/MOVE_LAYER_UP/MOVE_LAYER_DOWN.
- **Files**: `canvas/hotkeys/index.tsx`.

### F10 — Numeric inputs reset the draft while typing (P1)
- **Impact**: typing a multi-digit value with a >500ms pause in width/height/
  spacing inputs yanked the field back to the last committed value mid-typing,
  committing wrong numbers.
- **Root cause**: `useInputControl`'s sync effect had no focus guard (every other
  draft-syncing input in the codebase has one).
- **Fix**: hook owns an `inputRef`; the sync effect skips while focused;
  consumers attach the ref.
- **Files**: `editor-bar/hooks/use-input-control.ts`, `inputs/input-dropdown.tsx`,
  `inputs/input-icon.tsx`.

### F11 — Opacity input force-committed 0 on clear + per-keystroke writes (P2)
- **Impact**: clearing the field to retype instantly made the element fully
  transparent (opacity 0 to source) and snapped the field to "0"; typing "75"
  committed 7% then 75% (two undo entries).
- **Fix**: local draft; commit on blur/Enter/preset only; empty/NaN reverts
  instead of coercing to 0; one clamped commit.
- **Files**: `editor-bar/dropdowns/opacity.tsx`.

### F12 — Adding a custom CSS property via Tab was impossible (P2)
- **Impact**: click "+ Add" → type name → Tab made the row vanish with nothing
  saved (empty value = delete in the style pipeline; draft closed on any commit).
- **Fix**: draft `onCommit` requires both name and value; the name field's blur
  requires a non-empty value.
- **Files**: `right-panel/style-tab-v2/sections/custom-properties.tsx`.

### F13 — Text-content commit ignored write-failure contract (P2)
- **Impact**: if the source write failed, canvas + panel showed the new text
  while the file was untouched, and the equality guard blocked retrying the same
  text — the edit evaporated on reload.
- **Fix**: check `history.push`'s boolean; on failure revert the optimistic
  iframe edit and leave the panel baseline unchanged so a retry works.
- **Files**: `right-panel/style-tab-v4/sections/text.tsx`,
  `right-panel/style-tab-v3/sections/text.tsx`.

### F14 — Text-edit start failure left the element invisible (P2)
- **Impact**: if `getComputedStyleByDomId` failed after `startEditingText`
  succeeded, the element stayed `opacity: 0` with no editor and no recovery short
  of an iframe reload — it looked deleted.
- **Fix**: `start()`'s catch best-effort calls `stopEditingText` (clears the
  editing attribute) and removes the text-editor overlay.
- **Files**: `store/editor/text/index.ts`.

### F15 — `validateAndCleanSelections` repainted stale rects (P2)
- **Impact**: after a mutation removed one of several selected elements, the
  remaining selection rects jumped to pre-mutation positions, undoing the
  overlay refresh that just ran.
- **Fix**: fetch fresh (`getElementByDomId(id, true)`) and return the merged
  fresh element, not the stale click-time snapshot.
- **Files**: `store/editor/frame-events/index.ts`.

### F16 — Resize-drag overlay feedback was dead (P2)
- **Impact**: resizing didn't move the selection rect via the intended 60fps
  path — it only jumped when the heavier penpal fallback landed.
- **Root cause**: `updateClickedRects` mutated rects in place (`Object.assign`),
  invisible to the canvas overlay's memo keyed on the array reference.
- **Fix**: replace the array with fresh objects.
- **Files**: `store/editor/overlay/state.ts`.
- **Test**: `overlay/state.test.ts`.

### F17 — Overlay buttons went permanently invisible after a hide/show cycle (P2)
- **Impact**: after mini-chat streaming (or any `shouldHideButton` toggle) with
  the same element selected, the mini-chat/Figma/open-code buttons never
  reappeared and left an invisible click dead-zone.
- **Root cause**: the reveal was an imperative `classList` mutation keyed on
  `[domId]`; a hide→show with unchanged `domId` recreated the node in its hidden
  state with no reveal path.
- **Fix**: declarative `entered` state driven by `[shouldHideButton, domId]`.
- **Files**: `canvas/overlay/elements/buttons/index.tsx`.

### F18 — Comment poller leaked on teardown-during-boot (P2)
- **Impact**: exiting a project during the comments bootstrap window left a
  permanent 30s Convex poll + visibilitychange listener for the abandoned
  project, retaining the disposed engine.
- **Fix**: `disposed` flag reset at `init()` top, set in `clear()`, checked
  before `startPolling` and after the `loadComments` await.
- **Files**: `store/editor/comment/index.ts`.

### F19 — Session start survived clear() (P2)
- Covered by F2's `SessionManager` disposed latch (start's success/retry paths).

### F20 — Font change reloaded every frame across all branches (P2)
- **Impact**: changing a font blanked the entire canvas behind boot overlays for
  seconds per frame; other branches (different sandboxes) reloaded for no reason.
- **Fix**: `FramesManager.reloadByBranchId(branchId)`; the font handler reloads
  only the edited element's branch.
- **Files**: `store/editor/frames/manager.ts`, `editor-bar/hooks/use-text-control.ts`.

### F21 — Branch-switch page-scan race (P2)
- **Impact**: after a fast branch switch the Pages panel could show the previous
  branch's route tree; create/rename/delete's own re-scan could no-op.
- **Root cause**: `scanPages` silently dropped a re-entrant request and had no
  staleness check.
- **Fix**: latest-wins — snapshot the branch at scan start and discard a result
  whose branch changed mid-scan; coalesce concurrent requests into one trailing
  re-scan.
- **Files**: `store/editor/pages/index.ts`.

### F22 — Preload: duplicate observers + broken cold-boot self-heal (P2/P3)
- **Impact**: `handleBodyReady` runs twice per document (local body-poll + parent
  penpal call); `listenForDomChanges` wasn't idempotent, so every DOM mutation
  was processed twice and resize/content-resize fired twice per frame. Separately
  `keepDomUpdated` checked the *debounced* `processDom`'s stale return and cleared
  its own interval on tick one, killing the child-side layer-tree self-heal.
- **Fix**: `domChangeListenersInstalled` guard; `keepDomUpdated` calls the
  immediate `processDomNow`.
- **Files**: `apps/web/preload/script/api/events/index.ts`,
  `apps/web/preload/script/api/ready.ts`.

### F23 — MobX debounce `.cancel` footgun (P3, three instances)
- The known repo trap (`makeAutoObservable` wraps a function-valued lodash
  debounce as an action and strips `.cancel`/`.flush`). Fixed for:
  `ScreenshotManager.captureScreenshot`, `StateManager.resetCanvasScrollingDebounced`
  (whose `clear()` would have thrown `TypeError`), `FrameEventManager`'s two
  handlers, and `OverlayManager.refresh` — each excluded and cancelled on
  teardown. Also wired the never-called `state.clear()` and `screenshot.clear()`
  into `EditorEngine.clear()`.
- **Files**: `store/editor/screenshot/index.tsx`, `store/editor/state/index.ts`,
  `store/editor/frame-events/index.ts`, `store/editor/overlay/index.ts`,
  `store/editor/engine.ts`.

### Minor cleanup
- Removed a dead duplicate `if (!isReady) return null` block in
  `store/editor/index.tsx`.

---

## Confirmed but NOT fixed this pass — blocked or deliberately deferred

These are real (evidence below) but carry a regression risk I cannot validate in
this environment (no live sandbox / responsive-frame browser session), or need a
larger design change. Each has an exact next action; all are logged in
`BACKLOG.md`.

### B1 — Responsive-rebase source-write corruption cluster (P1) — #4/#6/#7/#9
- **Evidence**:
  - `code/tailwind.ts:85` hardcodes `type: StyleChangeType.Value`, losing the
    `Custom` provenance `updateCustom` records — theme/named colors (`blue-500`)
    are re-emitted as plain CSS the translator can't convert, and stale computed
    values clobber the correct class via twMerge-last (#4).
  - `style/index.ts` seeds the override map with camelCase computed keys while
    the v2 panel commits kebab-case, so panel edits get an override map with no
    sibling context and the source write degenerates to an unprefixed class (#6).
  - `breakpointMapFor` hands the *seeded* browser-computed values to the durable
    source write, materialising resolved `rgb(...)`/`px` as arbitrary-value
    classes and emitting a broken `font-Inter, sans-serif` token (#7).
  - the debounced rebase pipeline is invisible to `HistoryManager`: undo/redo
    neither cancel pending `rebaseTimers` nor revert the override map, so an edit
    undone within ~1.2s is rewritten into source (#9).
- **Why deferred**: the four are one entangled system. Every proposed fix
  (add type provenance; normalize keys; write only authored entries) risks a
  *different* regression — e.g. writing only `{desktop: newValue}` makes
  `rebaseToMobileFirst` emit an unprefixed base that rewrites all viewports,
  contradicting the (correctly breakpoint-scoped) live preview. This needs the
  override map to carry per-entry `{ type, provenance }` and a coordinated
  change across `recordOverrides` / `seedOverridesFromSiblings` /
  `breakpointMapFor` / `isOverriddenAt` / `clearBreakpointOverride` /
  `tailwind.ts`, validated against a live multi-breakpoint frame group (edit at
  largest / smallest / single breakpoint; undo; clear-override).
- **Partial mitigation shipped**: F7 (flush) removes the reload-window write
  loss; `ActionManager.clear` cancels stale timers on teardown.
- **Next action**: implement the typed override-map refactor behind targeted
  responsive-frame tests. Owner-gated on a live editor validation pass.

### B2 — `isChildTextEditable` is a stub returning `true` (P1) — #10
- **Evidence**: `apps/web/preload/script/api/elements/text.ts:131` is
  `return true;` — the source-AST plain-text check every caller gates on never
  runs, so double-clicking an element with a `{expression}` child opens the
  inline editor and the commit writes wrong source; undo bakes the rendered value
  in as a literal.
- **Why deferred**: a real AST check risks over-blocking legitimate edits
  (Prettier-inserted `{' '}` string-literal children are extremely common), which
  would regress a working core flow. Needs the client-side metadata parse +
  whitelist for trivial string-literal containers, validated on real JSX.
- **Next action**: implement in `TextEditingManager.start()` via the branch
  `codeEditor.getJsxElementMetadata` + element-snippet parse; whitelist
  `{'…'}`/whitespace expression containers; keep the parser's child-preserving
  merge (already landed in the in-flight `packages/parser/.../text.ts`) as
  defense in depth.

### B3 — Sandbox reclaim after "ready" has no recovery surface (P1) — #12
- **Evidence**: `canvas/frame/index.tsx:299` gates liveness on `!isFrameReady`,
  and the Restore panel renders only under `(!isFrameReady || !frame.url)`.
  `isFrameReady` stays true after connect, but Vercel sandboxes have a hard
  30-min lifetime (`convex/projectActions.ts` `timeout: 1_800_000`) with no
  keepalive, so after the VM dies all code writes/AI/terminal/git fail with every
  error deliberately suppressed and no toast/CTA. No `.tsx` outside the sandbox
  store reads `session.sandboxGone`.
- **Why deferred**: needs a live 30-min sandbox to validate the recovery path and
  a keepalive/`sandbox.extend()` design decision.
- **Next action**: surface `session.sandboxGone` in the overlay/panel condition
  (or force `isFrameReady=false`/`immediateReload()` when it flips) to re-enter
  the existing restore flow; add a periodic keepalive while the editor is active.

### B4 — Auto-height feedback loop on vh pages (P1, medium confidence) — #13
- **Evidence**: `canvas/frame/view.tsx:625` sets iframe height to child-reported
  `scrollHeight` with no fixed-point guard; since the iframe height *is* the vh
  viewport, a `100vh` section + extra content diverges toward the 50,000px cap.
- **Why deferred**: needs live reproduction to confirm the loop actually diverges
  vs. converges (browsers may stabilise) and to tune the mitigation.
- **Next action**: measure content height against a fixed layout viewport, or in
  `setContentHeight` freeze on a monotone roughly-constant-delta growth sequence.

### B5 — Engine-level disposed guard (part of #1)
- The per-branch `SandboxManager`/`SessionManager`/`CommentManager` leaks are
  fixed (F2/F18/F19). A *global* engine-level disposed latch was deliberately
  **not** added: the same `EditorEngine` instance is reused across React
  StrictMode's dev double-mount, and a one-way latch set in `clear()` would brick
  the dev editor (the deferred `setTimeout(clear)` from the simulated unmount
  fires after the remount's init started). A correct global guard must be
  generation/epoch-based and reset at init start — a larger change than this
  stability pass, tracked for follow-up.

### B6 — Other confirmed P2s deferred to backlog (evidence in BACKLOG.md)
- #19 per-mutation O(N²) `buildLayerTree` rebuild (preload) — payload is
  discarded by the parent; needs the incremental-map contract or a
  once-per-batch build.
- #23/#24 unthrottled `dragover` / breakpoint-resize penpal RPC storms — route
  through the existing 16ms throttle / rAF-coalesce; moderate change.
- #26 source-write paths bypassing `writeChain` (write-code, interactions,
  component prop, font) — expose `CodeManager.runExclusive`.
- #29 `groupRequestByFile` keys by path only (cross-branch merge) — key by
  `${branchId}::${path}`; touches the `FileToRequests` contract + parser.
- #30 `commitTransaction` not atomic (image-swap partial apply) — check
  `push`'s boolean; composite undo entry.
- #31 persisted undo history has no code-state fingerprint — discard on
  branch-SHA/content-hash mismatch, mirroring the git-restore clear.
- #32 one mutation triggers all-frames `processDom` + uncached Babel re-parse —
  scope `onWindowMutated` to the originating frame; memoize
  `getTemplateNodeChild`.

---

## Baseline / measurement

This environment has no live editor session (no `:8080` sandbox server, MCP
preview can't reach localhost — see `docs/agent-memory` local-verification note),
so runtime counters (frame passes per edit, bridge-message rate) could not be
captured live. Measurements are therefore **static, code-derived** and stated as
such — no invented numbers:

| Fix | Before (per code path) | After |
|---|---|---|
| F5 slider drag | 1 undoable action + 1 full-file AST write **per pointer tick** (dozens/drag) | 1 write + 1 undo entry **per drag** (on release) |
| F22 duplicate observers | 2× MutationObserver / resize / ResizeObserver per frame document | 1× (idempotent install guard) |
| F20 font change | `reloadAllViews()` — every frame in every branch re-boots | only the edited branch's frames |
| F4 wheel gesture | deltas dropped when >1 event/commit; listener re-attached per commit | fresh reads accumulate every delta; stable listener |
| F16 resize overlay | in-place mutation → 0 reactive updates (dead 60fps path) | array replace → reactive |

The confirmed but unfixed perf items (#19, #23, #24, #32) are where the largest
*measured* wins remain; they need a live session to quantify and are logged in
B6.

---

## Validation

- `bun --filter @weblab/web-client typecheck` → exit 0.
- `bun lint` (changed files) → 0 errors (warnings only, all pre-existing or
  a11y `autoFocus`/`unsafe-any` in untouched code).
- `bun test apps/web/client packages/parser packages/code-provider` → **817
  pass, 0 fail**.
- New regression tests: `overlay/state.test.ts`,
  `style/update-style-no-action.test.ts`, `history/dispose.test.ts` (9 cases).

## Remaining risks / manual checks still required

- **Live-browser verification** of F1 (blank create no longer strands), F5
  (slider drag = one undo entry), F9 (hotkeys yield to inputs), F16/F17 (overlay
  feedback) — none are click-tested here; a signed-in editor session on a real
  Vercel sandbox is needed.
- The responsive-rebase cluster (B1) and text-editability (B2) are the highest
  remaining data-integrity risks; do not ship a partial fix without live
  multi-breakpoint validation.
- `bun build` was not run (no bundling/preload-output change requires it beyond
  the preload edits, which are source-side and picked up by the normal build).
