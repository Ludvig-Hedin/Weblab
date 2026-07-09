# Editor Quality Audit — 2026-07-07

Comprehensive audit + fix pass of the Weblab editor (canvas, selection, style, text, drag/insert, breakpoints, undo/redo, persistence, panels, chat shell). Combines three static bug-hunt sweeps (interaction managers; style/history/code pipeline; UI chrome), seeded BACKLOG P1s, and a live Playwright walkthrough against `localhost:3000` + `@weblab/web-server` on `:8081`.

**Legend** — Status: `open` · `fixed` · `fixed-pending-validation` · `blocked(<reason>)` · `deferred` · `dup(<id>)`. Severity per repo convention (P0 data loss/crash/unusable → P3 polish). Paths relative to `apps/web/client/src/` unless noted.

**Validation environment**: Clerk dev test user (`+clerk_test` OTP, `scripts/qa/auth-setup.mjs`) + Playwright headless. The Claude preview browser cannot reach localhost (ERR_ABORTED — documented limitation), and `:8080` is occupied by an unrelated local app, so the sandbox tRPC server runs on `:8081` with `NEXT_PUBLIC_SANDBOX_SERVER_URL=ws://localhost:8081`.

> ⚠ A second agent session is committing to this tree concurrently (e.g. `556da09cf` Section move, `53a96aa8f`). Fixes here are deduped against its commits before landing.

---

## P1 — serious bugs / data loss / reliability

### D1. Sandbox-server WS auth race at editor boot — **fixed** (`e9d4077ff`)
- **Category**: reliability · **Flow**: editor boot (live-audit discovery)
- **Repro**: open editor cold — first sandbox WS connection can carry an empty token → `listFiles` fails `UNAUTHORIZED` during boot (server log: `[sandbox-auth] missing token`).
- **Root cause**: `SandboxServerAuthBridge` registered a `null` fetcher while Clerk was still loading, and `setSandboxServerAuthFetcher(null)` resolved the `waitForAuthReady` gate — the WS connected before any token existed.
- **Fix**: gate resolves only on a real fetcher; bridge ignores the not-yet-loaded state. `components/sandbox-server-auth-bridge.tsx`, `lib/sandbox-server-client.ts`.
- **Validation**: post-fix boots show no UNAUTHORIZED listFiles in three live runs.

### D2. Root error boundary crashed itself (`env.NODE_ENV` on client) — **fixed** (`e9d4077ff`)
- **Category**: crash · **Flow**: any error reaching the root boundary
- **Repro**: trigger any root-boundary error → console storm "Attempted to access a server-side environment variable on the client" from `RootErrorBoundary.useEffect`, re-thrown every boundary render.
- **Root cause**: `env.NODE_ENV` lives in the t3-env server schema; throws in the browser. `app/error.tsx:74`.
- **Fix**: `process.env.NODE_ENV` (statically inlined). **Validation**: live re-run shows a single clean "Root error boundary: …" log, no cascade.

### A1. `isChildTextEditable` stub lets inline edits corrupt JSX expressions — **fixed** (`acbd9b0df`)
- **Category**: data integrity · **Flow**: inline text editing
- **Repro**: double-click element whose child is `{expression}` → editor opens on rendered text → commit writes rendered value alongside the preserved expression (duplication), binding lost on next edit.
- **Root cause**: preload `isChildTextEditable` ported as hardcoded `return true` (`apps/web/preload/script/api/elements/text.ts:131`); DOM can't distinguish rendered expressions from static text anyway — check must be source-side.
- **Fix**: client-side AST gate `canEditJsxChildrenAsText` (new `components/store/editor/text/editable.ts`) via `codeEditor.getJsxElementMetadata(oid)` + `getAstFromCodeblock`; allows JSXText, `<br/>`, `{' '}` whitespace literals, `{/* comments */}`; HTML sources always editable. Wired into `TextEditingManager.start()` (+ new public `isChildTextEditable(el)`) and both `gesture.tsx` double-click call sites. Refusal now shows a toast instead of silent console error. Preload stub left in place (prod pin — jsDelivr SHA; removing methods breaks penpal).
- **Validation**: 16 unit tests (`text/editable.test.ts`) pass; typecheck clean. Live double-click walk pending.

### A2. Sandbox reclaim after "ready" fails silently forever — **fixed, live-validated** (`acbd9b0df`)
- **Category**: reliability · **Flow**: any session >30 min (Vercel sandbox TTL)
- **Repro**: idle 30+ min → edit → code writes/AI/terminal all fail, no toast, no recovery until manual reload.
- **Root cause**: all recovery surfaces gated on `!isFrameReady`, which never flips back after the bridge is up; `session.sandboxGone` (410) had no UI consumer post-ready.
- **Fix**: `app/project/[id]/_components/canvas/frame/index.tsx` — new `sandboxReclaimed = session.sandboxGone`; enables the liveness probe immediately and joins the boot overlay condition, so the existing `sandboxIsGone` → restore CTA + silent auto-restore flow re-engages.
- **Validation**: LIVE-CONFIRMED — two genuinely reclaimed projects observed the full chain: overlay → "Your preview was paused… Restoring…" → snapshot restore → reload → file tree + frames boot, no manual reload. Keepalive/extend remains open (see BACKLOG).

### A3. Escape in style-panel fields **commits** the abandoned edit instead of reverting — **fixed** (`68570acaf`)
- **Category**: data integrity · **Flow**: style panel v4 editing
- **Where**: `.../right-panel/style-tab-v4/controls/labeled-inputs.tsx:317,323` (`LabeledTextInput`, double-commits on Enter too), `:141/:183` (`LabeledNumberInput`), `pin-pad.tsx:196-216`, `shadow-field.tsx:171-181`, `chip-input.tsx:153,191`, `smart-link-input.tsx:253-268`
- **Root cause**: Escape sets draft back then blurs, but blur handler reads the edited DOM value and commits. Sibling controls (`TextField`, `NumberField`, `ModeNumberCell`, `IconNumberInput`) already carry `skipBlurCommitRef`+`userTouchedRef` guards; these six miss it.
- **Fix**: replicate the guard pattern in all six controls.

### A4. Slider drag: one undo entry + AST write per tick — **fixed** (batch 4: local drag state + Radix onValueCommit single commit)
- **Category**: perf/data · **Flow**: opacity/rotate/perspective sliders
- **Where**: `style-tab-v4/controls/slider-field.tsx:61` (used by styles.tsx:43, transforms.tsx:60,70)
- **Root cause**: Radix `Slider.onValueChange` calls `onCommit` every tick; no `onValueCommit`. (2026-07-04 transaction-wrapping reduced but did not eliminate the flood.)
- **Fix**: preview via `onValueChange` (no-history `updateStyleNoAction` path), commit once on `onValueCommit`.

### A5. Undo/redo never reaches the preview — stale injected CSS wins the cascade — **fixed** (batch 4: inverse/forward dispatched to frames with rebase suppressed + override-map sync)
- **Category**: correctness · **Flow**: undo/redo of style edits
- **Where**: `components/store/editor/action/index.ts:37-68`; preload `api/style/css-manager.ts:82` (`cssManager.clear()` has zero callers)
- **Repro**: set color red → Cmd+Z → source reverts, but preview + style panel stay red until iframe reload.
- **Root cause**: `undo()`/`redo()` only `code.write(inverse)`, never dispatch the inverse to frames; the optimistic edit lives in the injected `<style>` keyed by domId; StyleManager mirror + override map also never reverted.
- **Fix**: dispatch inverse action to frames on successful undo/redo (mirror into `updateStyleNoAction`/override map).

### A6. Partial multi-file write, then history drops the whole action — **fixed** (batch 5: all diffs validated — branch lookup + pipeline re-parse — before any file is written; all-or-nothing)
- **Where**: `components/store/editor/code/index.ts:153-197`; `history/index.ts:139-145`
- **Failure**: multi-select edit across two files; file 2 fails parse guard after file 1 wrote → file 1 landed but un-undoable, UI diverges from disk.
- **Fix**: validate all diffs for the group before writing any file (or restore `diff.original` of already-written files on mid-loop failure).

### A7. `commitTransaction` resets state before pushing — commits swallowed/raced — **fixed** (batch 4: commitPromise + pushDirect; undo/redo/startTransaction await in-flight commit; unit-tested)
- **Where**: `history/index.ts:102-106`; image-swap at `insert/index.ts:439-445` is the worst case (remove persists, insert swallowed)
- **Root cause detail**: state reset to NOT_IN_TRANSACTION before awaited pushes → a new gesture's `startTransaction()` captures the pending pushes; undo right after release races the in-flight commit and pops the *previous* action.
- **Fix**: keep an in-flight `commitPromise` awaited by `undo`/`redo`/`startTransaction`; commit pushes bypass the transaction check.

### A8. Drag-prepare RPC race: TypeError + iframe stuck in drag state — **fixed** (`68570acaf`)
- **Where**: `components/store/editor/move/index.ts:121-129`
- **Failure**: mouseup during awaited `startDrag` RPC → `clear()` nulls state → continuation writes `this.state.originalIndex` on null; `endAllDrag()` can complete before the in-flight `startDrag` resolves → element re-marked dragging with nobody to end it.
- **Fix**: after the await, re-check `this.state`; if null → `endAllDrag()` and bail.

### A9. Branch Delete has no confirmation — **fixed** (`68570acaf`)
- **Where**: `left-panel/design-panel/branches-tab/branch-management.tsx:88-139`
- **Failure**: single misclick permanently deletes a branch (destructive Convex `branches.remove`); every sibling delete flow confirms.
- **Fix**: wrap in the `AlertDialog` pattern from `page-tree-node.tsx:298`.

### A10. Editor-bar overflow budget uses stale static table — tail controls unreachable — **fixed** (batch 4: budget from caller-passed group keys + missing width entries + unknown-key fallback)
- **Where**: `editor-bar/hooks/use-measure-group.ts:40-54`
- **Failure**: at mid viewport widths, groups missing from `GROUP_WIDTHS` (`font`, `text-font`, `image`) are clipped by `overflow-hidden` AND absent from the "…" overflow menu.
- **Fix**: compute budget from the actually-rendered groups' measured widths.

---

## P2 — confusing behavior, silent failures, correctness edges

| ID | Where | Issue | Status |
|----|-------|-------|--------|
| B1 | `history/helpers.ts:28-36` + `style/index.ts:161-172` | Undo of a style-set writes computed fallback (`p-0`) instead of removing the added class — file after undo ≠ pre-edit file, classes accrete | open |
| B2 | `history/index.ts:128-146` | Undo during in-flight write: failed original write leaves never-landed action in redo; inverse still applies (delete case → duplicate element) | fixed batch-4 |
| B3 | `history/helpers.ts:244-293` | Redo of image insert drops `src`/`alt` (`getCleanedElement` whitelist) → broken `<img>` persisted | fixed batch-4 |
| B4 | `history/helpers.ts:231-242` | Transaction merge replaces same-type non-style actions wholesale (type-only match) — first element's write lost | fixed batch-4 |
| B5 | `components/store/editor/insert/index.ts:147-186` + `gesture.tsx` window mouseup | Insert draw never terminates on mouseup outside frame — ghost rubber-band resumes on re-entry | fixed `68570acaf` |
| B6 | `frames/manager.ts:148-156` + `use-start-project.tsx:364-397` | `applyFrames` clobbers in-flight local frame geometry (snap-back mid-drag); `userCanvas` has first-apply-only protection, frames don't | fixed batch-4 |
| B7 | `components/store/editor/text/index.ts` + `gesture.tsx:102-111` | Edit A → double-click B: `end()`'s `finally clean()` sees `targetDomEl === B`, closes the just-opened editor | fixed `a1d1a9f1d` (session snapshot in end/clean) |
| B8 | `overlay/index.ts:35-108` | Click-rect refresh: unguarded penpal await aborts whole refresh; no epoch token → late repaint of old selection | fixed batch-4 |
| B9 | `canvas/overlay/locked-resize-handles.tsx:47-76` | Window-listener leak on unmount mid-drag + no `buttons===0` bail (resize chases cursor with no button held) | fixed `a1d1a9f1d` (cleanup ref + buttons guard) |
| B10 | `pages/index.ts:250-289,642-713` | Rename/move of open page: iframe stays on old 404 URL; next `handleFrameUrlChange` re-corrupts active-route state | fixed `a1d1a9f1d` (navigateFrameToRenamedRoute) |
| B11 | `code/index.ts:87-104` | `write-code` + interaction writes bypass `pendingWrites` (beforeunload guard) and the re-parse corruption guard | fixed batch-4 |
| B12 | `pages/editor-settings.ts:67-139` | Page-settings JSON read-modify-write unserialized → last-write-wins drops concurrent op | fixed batch-5 (per-sandbox settings write chain) |
| B13 | `history/index.ts:58-72` | `hydrate()` replaces live stacks after await — actions pushed before IndexedDB resolves silently dropped | fixed batch-4 |
| B14 | `branches-tab/index.tsx:105` + `store/editor/branch/manager.ts:236-264` | Fork leaves "Forking branch…" loading toast stuck forever (no id, never dismissed) | fixed `68570acaf` |
| B15 | `brand-tab/index.tsx:129-134` | Brand tab flashes setup-CTA empty state until `tokens.scan()` resolves (no scanning flag; CTA clickable during flash) | fixed `68570acaf` |
| B16 | `brand-tab/setup-tokens-cta.tsx:22-25`, `token-context-menu.tsx:57-74`, `font-panel` | Token setup / token CRUD / font add-remove fail silently (no catch/toast); font Add double-submits; `window.prompt` off-pattern | fixed `68570acaf` |
| B17 | `branches-tab/index.tsx:252-293` | Branch rows are clickable divs (no keyboard); manage gear only rendered on hover | fixed `68570acaf` |
| B18 | `editor-bar/inputs/input-image.tsx:117-121` | Image-fill panel ignores `open===false` — Escape/outside-click can't dismiss | fixed batch-4 |
| B19 | `editor-bar/inputs/input-icon.tsx:64-66`, `input-range.tsx:164-166` | Default unit (`px`) renders as empty string → invisible zero-width dropdown trigger | fixed batch-4 |
| B20 | `editor-bar/inputs/input-radio.tsx:32-49`, `dropdowns/display/index.tsx:29-33` | Icon-only radios lack aria-labels; "Block" display rendered as ✕ icon | fixed batch-4 |
| B21 | `editor-bar/inputs/color-picker.tsx:397-407,535-626` | Brand-scan failure console-only (and mislabeled "fonts"); brand rows/swatches are divs — mouse-only | fixed batch-4 |
| B22 | `style-tab-v4/sections/element.tsx:149-153` + `text.tsx:244` | Tag/ID/class/href/text commits: unhandled rejection, no toast — silent revert | fixed `68570acaf` |
| B23 | `top-bar/project-breadcrumb.tsx:103-113` | Download Code silently no-ops when sandbox id missing | fixed `68570acaf` |
| B24 | `create-component-dialog.tsx:40-53,96-104` | Prop suggestions: no pending gate — Enter creates component with zero props; layout shift | open |
| B25 | `canvas/frame/index.tsx` failure surfaces + `project-load-error.tsx` | Entire recovery surface hardcoded English (~20 strings) | open |
| B26 | `style-tab-v4/controls/icon-number-input.tsx:349`, `mode-number-cell.tsx:261,279` | Unit/keyword popovers never close on selection | fixed `68570acaf` |
| B27 | `style-tab-v4/sections/size.tsx:353` | Mixed overflow-x/y renders blank select instead of "Mixed" | fixed `68570acaf` |
| B28 | `canvas/index.tsx:184-215` | Zoom-at-bounds drift: position delta uses unclamped scale | fixed `68570acaf` |
| B29 | `style/index.ts:69-75,226-241` | Latent: `updateCustom(domIds)` filter not applied to mirror/override recording (phantom overrides) | fixed batch-4 |

## P3 — polish, a11y, i18n, consistency (actionable subset)

| ID | Where | Issue | Status |
|----|-------|-------|--------|
| C1 | `move/index.ts:27,163,395-399` | `shouldSuppressNextClick` leaks across gestures — next real click swallowed | fixed `68570acaf` |
| C2 | `canvas/hotkeys/index.tsx:165-181` | Escape mid-drag clears selection but commits the move (should cancel) | fixed `68570acaf` |
| C3 | `canvas/index.tsx:315-359` | Middle-mouse pan release outside canvas → stuck in PAN mode | fixed `68570acaf` |
| C4 | `frames/manager.ts:288-293,390-413` | Frame delete leaves stale `elements.selected`/`hovered` for dead frame | fixed batch-4 |
| C5 | `frames/manager.ts:551-566` | Debounced frame-save timers survive teardown/deletion (post-teardown Convex mutations) | fixed batch-4 |
| C6 | `canvas/index.tsx:137-163,534-546` | Trailing throttled mousemove resurrects remote cursor after `clearCursor` | fixed `68570acaf` |
| C7 | `canvas/overlay/elements/text.tsx:86-106` | TextEditor seed dispatch fires `onChange` → spurious editText RPC + no-op history push | fixed batch-4 |
| C8 | `components-tab/component-card.tsx:9-25` | Component cards focusable buttons with no onClick (drag-only) — no keyboard insertion path | open |
| C9 | `page-modal.tsx:153` | "Failed to create page" copy even for folders; mixed t()/hardcoded | open |
| C10 | `terminal-area.tsx:71-81` | Branch switch from terminal tab: failure silent (sibling toasts it) | open |
| C11 | `terminal-panel.tsx:218-233`, `offline-banner.tsx:95-102` | 16px hover-only close targets; no focus-visible | open |
| C12 | `group-shell.tsx:86-97`, `component-instance.tsx:251` | Reset "X" invisible to keyboard focus (no focus-visible opacity) | fixed `68570acaf` |
| C13 | `shadow-field.tsx:383` | Shadow opacity commits per keystroke (siblings draft-and-commit) | fixed `68570acaf` |
| C14 | `padding.tsx:70-72` / `margin.tsx:80-82` | All/Individual tab never resyncs on selection change (border.tsx has the effect) | fixed batch-4 |
| C15 | `border-color.tsx:37-39` | BorderColor pops into toolbar mid-drag across width 0 (layout shift) | fixed batch-4 |
| C16 | i18n sweep | Hardcoded-English batches: element.tsx toasts, v4 option labels, left-panel tabs (search/insert/asset/branches/layers/windows), frame top-bar menu, errors-console, gesture toasts, comments-mode buttons | open |
| C17 | text-size sweep | 67 hardcoded `text-[11px]`/`text-[12px]` (enumerated in hunt-ui report; legacy v2/v3 rows skippable) | open |
| C18 | `img-fit.tsx:44-86` | `none`/`scale-down` mislabeled "Fill"; only trigger without tooltip | fixed batch-4 |
| C19 | `recenter-canvas-button.tsx:24-27` | Imports `Scan` from lucide-react directly (should use `@weblab/ui/icons`) | open |

## Known items owned elsewhere (not duplicated here)

- Responsive-rebase source-write corruption cluster — BACKLOG.md (P1, entangled; sub-fixes may land in this pass if cleanly separable).
- 100vh auto-height feedback loop (`frame/view.tsx:625`) — BACKLOG P2.
- buildLayerTree O(N²), unthrottled dragOver/mousemove penpal RPC, groupRequestByFile keying, undo code-fingerprint — BACKLOG P2 perf items (candidates for the performance pass).
- Gradient editor stub, CMS caps, route-group page CRUD — BACKLOG P2/P3.

## Live audit log

- Auth: Clerk test-user sign-in works headless (`+clerk_test` OTP). Dev-instance sessions get evicted quickly under repeated sign-ins (Clerk dev usage caps) — saved storageState bounces to `/sign-in` within ~15 min; scripts sign in inline per run. Dev-only, not a product bug. One SSR `ClerkAPIResponseError: Not Found` observed when a stale session id hits `SessionAPI` — lands in the root boundary cleanly post-D2.
- Editor boot (blank project): create → editor route → 3 breakpoint frames mount → "Almost ready / Loading the canvas tools…" → interactive. Clean console.
- Sandbox reclaim recovery (A2): validated live twice (see A2).
- Core flows validated live on a content-rich project: element click-select populates the full v4 style panel (Position/Layout/Padding/Margin/Size/Constraints/Text/Color/Font); double-click text edit; undo/redo hotkeys; H/V mode toggles; zoom in/fit — all with **zero console errors** post-fix.
- Env note for future audits: client appends `/trpc` to `NEXT_PUBLIC_SANDBOX_SERVER_URL` (bare origin, e.g. `ws://localhost:8081`); the `env.ts:211` comment saying `/api/trpc` is stale.

## Fix-loop progress

| Batch | Issues | Commit | Status |
|-------|--------|--------|--------|
| 1 | A1, A2 | `acbd9b0df` | fixed; A2 live-validated ×2 |
| 2 | A3 A8 A9 B5 B14 B15 B16 B17 B22 B23 B26 B27 B28 C1 C2 C3 C6 C12 C13 (+ fork/create toast dedupe, shadow-hex escape) | `68570acaf` | fixed, typecheck clean |
| 3 | D1, D2 (live-audit discoveries) | `e9d4077ff` | fixed, live-validated |
| 4 (in flight) | A4 A5 A7 A10 B2 B3 B4 B6 B8 B11 B13 B18 B19 B20 B21 B29 C4 C5 C7 C14 C15 C18 | — | fixer agents running |
| 5 | A6, B7, B9, B10 (B7/B9/B10 landed via concurrent-session commit `a1d1a9f1d` together with its work), B12, dragOver throttle | `4ced4771d`, `a1d1a9f1d`, `b54e5d649` | fixed |
| deferred | C16/B25 i18n sweep, C17 text-size sweep | — | deferred: en.json typegen staleness trap + active collision risk with concurrent session editing messages/*; filed in BACKLOG.md |

## Performance pass (evidence + honest scope)

- **Fixed by construction (measurable by definition):** A4 — slider drag went from one undo entry + one AST write per tick (dozens per gesture) to exactly one per gesture. dragOver hover-tracking went from one penpal `getElementAtLoc` RPC per native dragover event (fires faster than once per frame) to the same 16 ms throttle the mousemove path uses.
- **Reliability-perf:** B8 (one penpal rejection no longer aborts the whole overlay refresh), C5/C6 (leaked timers + trailing throttled broadcasts cancelled), B6 (no redundant geometry churn from refetch clobbers).
- **Profiling limitation, documented:** an attempt to measure penpal message rate via window `message` events returned 0 — penpal switches to MessagePort after the handshake, so wire-rate profiling needs preload-side instrumentation.
- **Deferred with reason:** buildLayerTree O(N²) per MutationObserver and other preload-side items require rebuilding + committing `public/weblab-preload-script.js` AND bumping the prod jsDelivr SHA pin — a release step, not an in-audit change. Remain in BACKLOG with next steps.

## UX simplification pass (delivered within fixes)

Destructive safety (branch delete confirm), mistake recovery (Escape-revert everywhere, Escape cancels drag), immediate feedback (silent failures → toasts across brand/token/element/download/terminal flows), fewer stuck states (fork toast, image-panel dismissal, popovers close on pick), keyboard access (branch rows, swatches, focus-visible reveals), less layout shift (BorderColor slot, brand-tab CTA flash). Terminology and step-count review found no removable steps in core flows this pass; the biggest remaining friction is the deferred i18n/text-size debt and the gradient-editor stub (owned in BACKLOG).

## Final gates (2026-07-09)

- `bun typecheck` — **clean** (a mid-audit failure in `api/transcribe/route.ts` was the concurrent session's in-flight Convex codegen; it resolved it in `a1d1a9f1d`).
- `bun lint` — **exit 0**.
- `bun test` (web-client) — 562 pass / **1 pre-existing fail**: `test/frame/preload-script.test.ts` fails only when run with the other `test/frame` files (test-isolation leak; passes standalone). Pre-dates this audit: at pre-audit commit `6ea3d868d` the same group fails 3/12. Not introduced here.
- Live regression (Playwright, content project): boot → reclaim-restore → select → style panel → commit → **undo restores both source and panel** → Escape-revert holds. No editor console errors.
