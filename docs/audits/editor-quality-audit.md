# Editor Quality Audit — 2026-07-07

Comprehensive audit + fix pass of the Weblab editor (canvas, selection, style, text, drag/insert, breakpoints, undo/redo, persistence, panels, chat shell). Combines three static bug-hunt sweeps (interaction managers; style/history/code pipeline; UI chrome), seeded BACKLOG P1s, and a live Playwright walkthrough against `localhost:3000` + `@weblab/web-server` on `:8081`.

**Legend** — Status: `open` · `fixed` · `fixed-pending-validation` · `blocked(<reason>)` · `deferred` · `dup(<id>)`. Severity per repo convention (P0 data loss/crash/unusable → P3 polish). Paths relative to `apps/web/client/src/` unless noted.

**Validation environment**: Clerk dev test user (`+clerk_test` OTP, `scripts/qa/auth-setup.mjs`) + Playwright headless. The Claude preview browser cannot reach localhost (ERR_ABORTED — documented limitation), and `:8080` is occupied by an unrelated local app, so the sandbox tRPC server runs on `:8081` with `NEXT_PUBLIC_SANDBOX_SERVER_URL=ws://localhost:8081`.

> ⚠ A second agent session is committing to this tree concurrently (e.g. `556da09cf` Section move, `53a96aa8f`). Fixes here are deduped against its commits before landing.

---

## P1 — serious bugs / data loss / reliability

### A1. `isChildTextEditable` stub lets inline edits corrupt JSX expressions — **fixed**
- **Category**: data integrity · **Flow**: inline text editing
- **Repro**: double-click element whose child is `{expression}` → editor opens on rendered text → commit writes rendered value alongside the preserved expression (duplication), binding lost on next edit.
- **Root cause**: preload `isChildTextEditable` ported as hardcoded `return true` (`apps/web/preload/script/api/elements/text.ts:131`); DOM can't distinguish rendered expressions from static text anyway — check must be source-side.
- **Fix**: client-side AST gate `canEditJsxChildrenAsText` (new `components/store/editor/text/editable.ts`) via `codeEditor.getJsxElementMetadata(oid)` + `getAstFromCodeblock`; allows JSXText, `<br/>`, `{' '}` whitespace literals, `{/* comments */}`; HTML sources always editable. Wired into `TextEditingManager.start()` (+ new public `isChildTextEditable(el)`) and both `gesture.tsx` double-click call sites. Refusal now shows a toast instead of silent console error. Preload stub left in place (prod pin — jsDelivr SHA; removing methods breaks penpal).
- **Validation**: 16 unit tests (`text/editable.test.ts`) pass; typecheck clean. Live double-click walk pending.

### A2. Sandbox reclaim after "ready" fails silently forever — **fixed-pending-validation**
- **Category**: reliability · **Flow**: any session >30 min (Vercel sandbox TTL)
- **Repro**: idle 30+ min → edit → code writes/AI/terminal all fail, no toast, no recovery until manual reload.
- **Root cause**: all recovery surfaces gated on `!isFrameReady`, which never flips back after the bridge is up; `session.sandboxGone` (410) had no UI consumer post-ready.
- **Fix**: `app/project/[id]/_components/canvas/frame/index.tsx` — new `sandboxReclaimed = session.sandboxGone`; enables the liveness probe immediately and joins the boot overlay condition, so the existing `sandboxIsGone` → restore CTA + silent auto-restore flow re-engages.
- **Validation**: cannot simulate a real 30-min TTL reclaim in-session; logic verified by code-trace (probe → `'gone'` → CTA + auto-restore → reload). Keepalive/extend remains open (see BACKLOG).

### A3. Escape in style-panel fields **commits** the abandoned edit instead of reverting — **open**
- **Category**: data integrity · **Flow**: style panel v4 editing
- **Where**: `.../right-panel/style-tab-v4/controls/labeled-inputs.tsx:317,323` (`LabeledTextInput`, double-commits on Enter too), `:141/:183` (`LabeledNumberInput`), `pin-pad.tsx:196-216`, `shadow-field.tsx:171-181`, `chip-input.tsx:153,191`, `smart-link-input.tsx:253-268`
- **Root cause**: Escape sets draft back then blurs, but blur handler reads the edited DOM value and commits. Sibling controls (`TextField`, `NumberField`, `ModeNumberCell`, `IconNumberInput`) already carry `skipBlurCommitRef`+`userTouchedRef` guards; these six miss it.
- **Fix**: replicate the guard pattern in all six controls.

### A4. Slider drag: one undo entry + AST write per tick — **open**
- **Category**: perf/data · **Flow**: opacity/rotate/perspective sliders
- **Where**: `style-tab-v4/controls/slider-field.tsx:61` (used by styles.tsx:43, transforms.tsx:60,70)
- **Root cause**: Radix `Slider.onValueChange` calls `onCommit` every tick; no `onValueCommit`. (2026-07-04 transaction-wrapping reduced but did not eliminate the flood.)
- **Fix**: preview via `onValueChange` (no-history `updateStyleNoAction` path), commit once on `onValueCommit`.

### A5. Undo/redo never reaches the preview — stale injected CSS wins the cascade — **open**
- **Category**: correctness · **Flow**: undo/redo of style edits
- **Where**: `components/store/editor/action/index.ts:37-68`; preload `api/style/css-manager.ts:82` (`cssManager.clear()` has zero callers)
- **Repro**: set color red → Cmd+Z → source reverts, but preview + style panel stay red until iframe reload.
- **Root cause**: `undo()`/`redo()` only `code.write(inverse)`, never dispatch the inverse to frames; the optimistic edit lives in the injected `<style>` keyed by domId; StyleManager mirror + override map also never reverted.
- **Fix**: dispatch inverse action to frames on successful undo/redo (mirror into `updateStyleNoAction`/override map).

### A6. Partial multi-file write, then history drops the whole action — **open**
- **Where**: `components/store/editor/code/index.ts:153-197`; `history/index.ts:139-145`
- **Failure**: multi-select edit across two files; file 2 fails parse guard after file 1 wrote → file 1 landed but un-undoable, UI diverges from disk.
- **Fix**: validate all diffs for the group before writing any file (or restore `diff.original` of already-written files on mid-loop failure).

### A7. `commitTransaction` resets state before pushing — commits swallowed/raced — **open**
- **Where**: `history/index.ts:102-106`; image-swap at `insert/index.ts:439-445` is the worst case (remove persists, insert swallowed)
- **Root cause detail**: state reset to NOT_IN_TRANSACTION before awaited pushes → a new gesture's `startTransaction()` captures the pending pushes; undo right after release races the in-flight commit and pops the *previous* action.
- **Fix**: keep an in-flight `commitPromise` awaited by `undo`/`redo`/`startTransaction`; commit pushes bypass the transaction check.

### A8. Drag-prepare RPC race: TypeError + iframe stuck in drag state — **open**
- **Where**: `components/store/editor/move/index.ts:121-129`
- **Failure**: mouseup during awaited `startDrag` RPC → `clear()` nulls state → continuation writes `this.state.originalIndex` on null; `endAllDrag()` can complete before the in-flight `startDrag` resolves → element re-marked dragging with nobody to end it.
- **Fix**: after the await, re-check `this.state`; if null → `endAllDrag()` and bail.

### A9. Branch Delete has no confirmation — **open**
- **Where**: `left-panel/design-panel/branches-tab/branch-management.tsx:88-139`
- **Failure**: single misclick permanently deletes a branch (destructive Convex `branches.remove`); every sibling delete flow confirms.
- **Fix**: wrap in the `AlertDialog` pattern from `page-tree-node.tsx:298`.

### A10. Editor-bar overflow budget uses stale static table — tail controls unreachable — **open**
- **Where**: `editor-bar/hooks/use-measure-group.ts:40-54`
- **Failure**: at mid viewport widths, groups missing from `GROUP_WIDTHS` (`font`, `text-font`, `image`) are clipped by `overflow-hidden` AND absent from the "…" overflow menu.
- **Fix**: compute budget from the actually-rendered groups' measured widths.

---

## P2 — confusing behavior, silent failures, correctness edges

| ID | Where | Issue | Status |
|----|-------|-------|--------|
| B1 | `history/helpers.ts:28-36` + `style/index.ts:161-172` | Undo of a style-set writes computed fallback (`p-0`) instead of removing the added class — file after undo ≠ pre-edit file, classes accrete | open |
| B2 | `history/index.ts:128-146` | Undo during in-flight write: failed original write leaves never-landed action in redo; inverse still applies (delete case → duplicate element) | open |
| B3 | `history/helpers.ts:244-293` | Redo of image insert drops `src`/`alt` (`getCleanedElement` whitelist) → broken `<img>` persisted | open |
| B4 | `history/helpers.ts:231-242` | Transaction merge replaces same-type non-style actions wholesale (type-only match) — first element's write lost | open |
| B5 | `components/store/editor/insert/index.ts:147-186` + `gesture.tsx` window mouseup | Insert draw never terminates on mouseup outside frame — ghost rubber-band resumes on re-entry | open |
| B6 | `frames/manager.ts:148-156` + `use-start-project.tsx:364-397` | `applyFrames` clobbers in-flight local frame geometry (snap-back mid-drag); `userCanvas` has first-apply-only protection, frames don't | open |
| B7 | `components/store/editor/text/index.ts` + `gesture.tsx:102-111` | Edit A → double-click B: `end()`'s `finally clean()` sees `targetDomEl === B`, closes the just-opened editor | open |
| B8 | `overlay/index.ts:35-108` | Click-rect refresh: unguarded penpal await aborts whole refresh; no epoch token → late repaint of old selection | open |
| B9 | `canvas/overlay/locked-resize-handles.tsx:47-76` | Window-listener leak on unmount mid-drag + no `buttons===0` bail (resize chases cursor with no button held) | open |
| B10 | `pages/index.ts:250-289,642-713` | Rename/move of open page: iframe stays on old 404 URL; next `handleFrameUrlChange` re-corrupts active-route state | open |
| B11 | `code/index.ts:87-104` | `write-code` + interaction writes bypass `pendingWrites` (beforeunload guard) and the re-parse corruption guard | open |
| B12 | `pages/editor-settings.ts:67-139` | Page-settings JSON read-modify-write unserialized → last-write-wins drops concurrent op | open |
| B13 | `history/index.ts:58-72` | `hydrate()` replaces live stacks after await — actions pushed before IndexedDB resolves silently dropped | open |
| B14 | `branches-tab/index.tsx:105` + `store/editor/branch/manager.ts:236-264` | Fork leaves "Forking branch…" loading toast stuck forever (no id, never dismissed) | open |
| B15 | `brand-tab/index.tsx:129-134` | Brand tab flashes setup-CTA empty state until `tokens.scan()` resolves (no scanning flag; CTA clickable during flash) | open |
| B16 | `brand-tab/setup-tokens-cta.tsx:22-25`, `token-context-menu.tsx:57-74`, `font-panel` | Token setup / token CRUD / font add-remove fail silently (no catch/toast); font Add double-submits; `window.prompt` off-pattern | open |
| B17 | `branches-tab/index.tsx:252-293` | Branch rows are clickable divs (no keyboard); manage gear only rendered on hover | open |
| B18 | `editor-bar/inputs/input-image.tsx:117-121` | Image-fill panel ignores `open===false` — Escape/outside-click can't dismiss | open |
| B19 | `editor-bar/inputs/input-icon.tsx:64-66`, `input-range.tsx:164-166` | Default unit (`px`) renders as empty string → invisible zero-width dropdown trigger | open |
| B20 | `editor-bar/inputs/input-radio.tsx:32-49`, `dropdowns/display/index.tsx:29-33` | Icon-only radios lack aria-labels; "Block" display rendered as ✕ icon | open |
| B21 | `editor-bar/inputs/color-picker.tsx:397-407,535-626` | Brand-scan failure console-only (and mislabeled "fonts"); brand rows/swatches are divs — mouse-only | open |
| B22 | `style-tab-v4/sections/element.tsx:149-153` + `text.tsx:244` | Tag/ID/class/href/text commits: unhandled rejection, no toast — silent revert | open |
| B23 | `top-bar/project-breadcrumb.tsx:103-113` | Download Code silently no-ops when sandbox id missing | open |
| B24 | `create-component-dialog.tsx:40-53,96-104` | Prop suggestions: no pending gate — Enter creates component with zero props; layout shift | open |
| B25 | `canvas/frame/index.tsx` failure surfaces + `project-load-error.tsx` | Entire recovery surface hardcoded English (~20 strings) | open |
| B26 | `style-tab-v4/controls/icon-number-input.tsx:349`, `mode-number-cell.tsx:261,279` | Unit/keyword popovers never close on selection | open |
| B27 | `style-tab-v4/sections/size.tsx:353` | Mixed overflow-x/y renders blank select instead of "Mixed" | open |
| B28 | `canvas/index.tsx:184-215` | Zoom-at-bounds drift: position delta uses unclamped scale | open |
| B29 | `style/index.ts:69-75,226-241` | Latent: `updateCustom(domIds)` filter not applied to mirror/override recording (phantom overrides) | open |

## P3 — polish, a11y, i18n, consistency (actionable subset)

| ID | Where | Issue | Status |
|----|-------|-------|--------|
| C1 | `move/index.ts:27,163,395-399` | `shouldSuppressNextClick` leaks across gestures — next real click swallowed | open |
| C2 | `canvas/hotkeys/index.tsx:165-181` | Escape mid-drag clears selection but commits the move (should cancel) | open |
| C3 | `canvas/index.tsx:315-359` | Middle-mouse pan release outside canvas → stuck in PAN mode | open |
| C4 | `frames/manager.ts:288-293,390-413` | Frame delete leaves stale `elements.selected`/`hovered` for dead frame | open |
| C5 | `frames/manager.ts:551-566` | Debounced frame-save timers survive teardown/deletion (post-teardown Convex mutations) | open |
| C6 | `canvas/index.tsx:137-163,534-546` | Trailing throttled mousemove resurrects remote cursor after `clearCursor` | open |
| C7 | `canvas/overlay/elements/text.tsx:86-106` | TextEditor seed dispatch fires `onChange` → spurious editText RPC + no-op history push | open |
| C8 | `components-tab/component-card.tsx:9-25` | Component cards focusable buttons with no onClick (drag-only) — no keyboard insertion path | open |
| C9 | `page-modal.tsx:153` | "Failed to create page" copy even for folders; mixed t()/hardcoded | open |
| C10 | `terminal-area.tsx:71-81` | Branch switch from terminal tab: failure silent (sibling toasts it) | open |
| C11 | `terminal-panel.tsx:218-233`, `offline-banner.tsx:95-102` | 16px hover-only close targets; no focus-visible | open |
| C12 | `group-shell.tsx:86-97`, `component-instance.tsx:251` | Reset "X" invisible to keyboard focus (no focus-visible opacity) | open |
| C13 | `shadow-field.tsx:383` | Shadow opacity commits per keystroke (siblings draft-and-commit) | open |
| C14 | `padding.tsx:70-72` / `margin.tsx:80-82` | All/Individual tab never resyncs on selection change (border.tsx has the effect) | open |
| C15 | `border-color.tsx:37-39` | BorderColor pops into toolbar mid-drag across width 0 (layout shift) | open |
| C16 | i18n sweep | Hardcoded-English batches: element.tsx toasts, v4 option labels, left-panel tabs (search/insert/asset/branches/layers/windows), frame top-bar menu, errors-console, gesture toasts, comments-mode buttons | open |
| C17 | text-size sweep | 67 hardcoded `text-[11px]`/`text-[12px]` (enumerated in hunt-ui report; legacy v2/v3 rows skippable) | open |
| C18 | `img-fit.tsx:44-86` | `none`/`scale-down` mislabeled "Fill"; only trigger without tooltip | open |
| C19 | `recenter-canvas-button.tsx:24-27` | Imports `Scan` from lucide-react directly (should use `@weblab/ui/icons`) | open |

## Known items owned elsewhere (not duplicated here)

- Responsive-rebase source-write corruption cluster — BACKLOG.md (P1, entangled; sub-fixes may land in this pass if cleanly separable).
- 100vh auto-height feedback loop (`frame/view.tsx:625`) — BACKLOG P2.
- buildLayerTree O(N²), unthrottled dragOver/mousemove penpal RPC, groupRequestByFile keying, undo code-fingerprint — BACKLOG P2 perf items (candidates for the performance pass).
- Gradient editor stub, CMS caps, route-group page CRUD — BACKLOG P2/P3.

## Live audit log

- Auth: Clerk test-user sign-in works headless (auth-setup.mjs). Session cookie appears short-lived — a state file saved ~20 min earlier bounced to `/sign-in` (re-auth per run required). *(possible finding — TBD whether dev-only)*
- Editor boot: blank-project create → editor route loads, iframe mounts. First run blocked by wrong `NEXT_PUBLIC_SANDBOX_SERVER_URL` shape (client appends `/trpc`; `env.ts:211` comment says `/api/trpc` — stale, minor doc bug) and a transient mid-commit compile from the concurrent session.
- Sandbox: seeded QA project's sandbox returned 410 during boot walk (expected for stale fixture) — auto-restore flow to be observed in next run.

## Fix-loop progress

| Batch | Issues | Status |
|-------|--------|--------|
| 1 | A1 (text editability gate) | fixed — tests green, typecheck clean |
| 2 | A2 (sandbox reclaim surface) | fixed — pending live validation |
| next | A3-A10, B-cluster | queued |
