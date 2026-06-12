# Feature Log

Append-only log of significant features, fixes, and edits agents have shipped.
**Newest entries on top.** See `README.md` for what qualifies.

Format:

```
## YYYY-MM-DD — Short Title
Author: <agent / user>
Area: <package / route / system>
Summary: 1-3 sentences on what changed and why.
Files: key paths
Links: changelog / blog / migration / docs
```

---

## 2026-06-12 — Agent API: API-first QA, live wiring, reusable fixtures + harness
Author: Claude (Opus 4.8)
Area: `apps/web/client/convex` (new `agentTestSeed.ts`), `@weblab/mcp` (new `agent/qa-runner.ts`), docs
Summary: QA'd the v1 agent API end-to-end with NO browser — only connector/MCP tool output. Found + fixed a CRITICAL setup gap: the v1 commit ran `convex codegen` (types only) but never **pushed** the functions, so `/agent/*` returned `404 No matching routes` on the dev deployment and both env vars were unset — the surface was entirely unreachable (the prior log entry's "codegen also pushed them" was inaccurate; codegen ≠ deploy). Fixed via `bunx convex dev --once` + `convex env set WEBLAB_AGENT_API_TOKEN` / `WEBLAB_AGENT_USER_ID`. Added a dedicated synthetic agent account (`clerkUserId = user_agent_qa_fixture`, no real Clerk login — the read API only string-matches the id, guaranteeing test-data isolation), an idempotent Convex seed module `agentTestSeed.ts` (seed/reset/info/foreignProjectIdForQa) creating 3 fixtures covering ready/pending/failed provisioning states with no live sandbox, and a runnable harness `qa-runner.ts` (15 checks: onboarding/health, returning-user list, read state, status states, NOT_FOUND/INVALID_INPUT/PERMISSION_DENIED IDOR guard, AUTH_FAILED, BACKEND_UNAVAILABLE, write-gate + logs UNSUPPORTED). Result: 15/15 pass against live dev; MCP `server.ts` also smoke-tested over stdio (tools/list + 2 calls). Zero code defects in `agentApi.ts`/connector. Prod still unconfigured (documented). Report: [api-agent-qa-report.md](api-agent-qa-report.md).
Files: `apps/web/client/convex/agentTestSeed.ts` (new, internal-only), `packages/mcp/src/agent/qa-runner.ts` (new), `docs/agent-memory/api-agent-qa-report.md` (new), `docs/test-plan.md` (T-503), `.mcp.json` (new, git-ignored), `.gitignore`
Links: report [api-agent-qa-report.md](api-agent-qa-report.md); setup [weblab-mcp-setup.md](../agent-context/weblab-mcp-setup.md); test T-503; catalog F-482 + F-693

## 2026-06-12 — Agent API + MCP server v1 (read-first, token-auth, scoped to a test account)
Author: Claude (Opus 4.8)
Area: `apps/web/client/convex` (agent httpActions), `@weblab/mcp` (new `agent/` server), `@weblab/constants` (subpath export)
Summary: Shipped the minimal-safe v1 from [weblab-agent-api-map.md](../agent-context/weblab-agent-api-map.md): external AI agents (Claude Code) can inspect Weblab with no browser. New Convex HTTP surface at `<deployment>.convex.site/agent/*` (`agentApi.ts`, routes in `http.ts`) — Bearer-token auth (`WEBLAB_AGENT_API_TOKEN`, constant-time compare, closed by default) with all data scoped to ONE dedicated agent account (`WEBLAB_AGENT_USER_ID`), so it only ever sees projects it created (test data only, never prod users). Endpoints: `/agent/health`, `/agent/projects`, `/agent/project`, `/agent/project/status` → internal queries (owner-scoped, discriminated not_found/forbidden results). New stdio MCP server `weblab-agent-mcp` (`packages/mcp/src/agent/`): typed connector (injectable fetch), zod tool-input + response validators, six tools — `weblab_health_check`, `weblab_list_projects`, `weblab_get_project`, `weblab_get_project_status` (read), plus honest UNSUPPORTED stubs for `weblab_create_test_project` (write, confirm-gated; real creation needs the authenticated sandbox-provisioning action) and `weblab_read_logs` (needs a per-session sandbox token). Stable error codes: AUTH_FAILED / PERMISSION_DENIED / NOT_FOUND / INVALID_INPUT / BACKEND_UNAVAILABLE / UNSUPPORTED / CONFIG_MISSING. 32 unit tests (schemas, auth/error mapping, happy paths, unsupported stubs). Note: importing the `@weblab/constants` barrel into a leaf process drags `@weblab/models → @weblab/ai` (editor/JSX graph) and breaks a standalone tsc — added a `./editor` subpath export to constants and import `APP_NAME` from `@weblab/constants/editor`. Browser flows untouched (additive HTTP routes, no `auth.config.ts`/middleware change). Convex functions validated by `convex codegen` (which also pushed them to the dev deployment — inert until the two agent env vars are set).
Files: `apps/web/client/convex/{agentApi.ts,http.ts}`, `apps/web/client/convex/_generated/api.d.ts` (regenerated), `packages/mcp/src/agent/{config,errors,schemas,connector,tools,server}.ts` + `*.test.ts`, `packages/mcp/package.json` (bin `weblab-agent-mcp`, test script, `@weblab/constants` dep), `packages/constants/package.json` (`./editor` export)
Links: docs [weblab-mcp-setup.md](../agent-context/weblab-mcp-setup.md), [weblab-agent-api-map.md](../agent-context/weblab-agent-api-map.md); catalog F-482 (agent HTTP API) + F-693 (agent MCP server, extends `@weblab/mcp`), test T-502

## 2026-06-12 — Webflow-style component system (master/instance, properties, variants, slots)
Author: Claude (Fable 5)
Area: `@weblab/parser` (`src/component/`), `@weblab/file-system`, editor stores + canvas + right panel
Summary: Full master/instance component system, code-is-truth. Discovery: AST scan of exported PascalCase JSX components (props from TS types/destructuring, bindings, plain-map + cva variants) runs inside the same `CodeFileSystem` pass as the oid index → per-branch component index (`.weblab/cache/components.json`), so imported projects' components appear automatically and external git edits re-derive everything. UX: double-click an instance enters in-context master editing (scoped selection/hover, canvas dim, "applies to N instances" banner, back crumb, layered ESC); instance Properties section (typed fields, variant dropdown, per-prop reset; overrides = JSX attrs at the usage site, default ⇒ attr removed); master Properties section (create prop from element with the literal hoisted as default, green binding dots + dotted outlines); create component from selection (⌘⌥K, suggested-props review, closure-capture hard-fails with names); variants (module-scope class map + `cn(base, map[variant])`); unlink (⌘⇧U, master inlined with values/variant/children resolved). Static HTML: partials in `weblab/components/*.html` (in-file manifest, `{{prop}}`/`{{variant:class}}`/`data-wb-if`/`<slot>`), instances stamped with `${masterOid}~${instanceId}` oids, master edits re-stamp all pages idempotently; the client edit pipeline now routes per-pipeline (parse5 vs Babel) which also makes plain `.html` canvas edits work for the first time. Colors: purple = components (existing), green = property connections (real green token scale added). Deleted the dead tRPC regex scanner. 40 new parser unit tests.
Files: `packages/parser/src/component/{discover,props,extract,variants,detach,html/stamp}.ts`, `packages/file-system/src/{code-fs.ts,component-index.ts}`, `packages/models/src/element/component.ts`, `apps/web/client/src/components/store/editor/components/`, `canvas/overlay/{edit-mode-dim,component-edit-banner,elements/component-chip,elements/rect/prop-bound}.tsx`, `right-panel/style-tab-v4/sections/component-{instance,master}.tsx`, `create-component-dialog.tsx`, `top-bar/component-edit-crumb.tsx`
Links: changelog v4.2; catalog F-788/F-789, tests T-817/T-818; deferred items in BACKLOG ("Component system v1 — deferred follow-ups")

## 2026-06-11 — Create-with-AI flow unbricked: 16KB cap, hard stop, retry/redacted/suggestions UX
Author: Claude (Fable 5)
Area: `/api/chat` route, editor chat (`use-chat`, chat-tab), create handoff (`use-start-project`)
Summary: Root-caused the "stuck on Reading skill forever" create-flow failure: `/api/chat` rejected any single message over 16KB (`message exceeds 16384 bytes`), but `read_skill` tool outputs (full SKILL.md bodies, 8–30KB) ride inside the next auto-continuation request — so the AI SDK's follow-up POST 400'd silently, freezing the turn after the first skill read and resurfacing the same error on every later send/model switch. Raised caps to 512KB/message + 4MB total, extracted to a unit-tested helper (`helpers/message-limits.ts`), aligned the summarize route. Fixed the dead Stop button: SDK `stop()` only aborts the fetch — added `userStoppedRef` gating `sendAutomaticallyWhen` plus a `hardStop` that clears the tool-execution spinner. UX: error banner + Retry hidden while streaming; Regenerate icon hidden (not just disabled) during streams; `[REDACTED]` provider markers stripped from reasoning (empty reasoning skipped); suggestions moved above the composer surface; "Got your prompt" toast now fires before the slow create-context gather (was after up to ~6.5s of sandbox-file retries); stale `creationRequest` fallback fixed (undefined-vs-null) so `hasPendingCreation` clears once the handoff completes; assistant/stream message spacing+tracking unified.
Files: `apps/web/client/src/app/api/chat/{route.ts,summarize/route.ts,helpers/message-limits.ts,helpers/message-limits.test.ts}`, `apps/web/client/src/app/project/[id]/_hooks/{use-chat/index.tsx,use-start-project.tsx}`, `right-panel/chat-tab/{chat-input/index.tsx,chat-messages/{index,assistant-message,stream-message}.tsx,chat-messages/message-content/{index.tsx,sanitize-reasoning.ts,sanitize-reasoning.test.ts}}`
Links: BACKLOG.md follow-ups (skill-load timeout, optimistic prompt bubble, create-flow i18n, ask_user_question resolver leak)

## 2026-06-10 — Style Panel v4 round 2: select geometry, active states, 1-click pickers, panel-resize perf
Author: Claude (Fable 5)
Area: editor right panel (`style-tab-v4`), `@weblab/ui` resizable
Summary: Owner-reported fixes. (1) Selects rendered 36px tall with a visible border while text inputs were 26px — shadcn `SelectTrigger` sizes/skins itself via variant-prefixed classes (`data-[size=default]:h-9`, `dark:border-[#2d2d2d]`, `dark:bg-[#232323]`) that tailwind-merge cannot reconcile with the plain classes in `FIELD_BASE_CLASSES`; added `SELECT_TRIGGER_FIELD_OVERRIDES` (same-variant overrides) applied in SelectField + LabeledSelectInput. (2) Unified ALL standard fields at 28px (`FIELD_HEIGHT`) — inputs, selects, segments (Flow 32→28, IconSegment 30→28), color row 32→28, chip input, trbl/shadow/slider/alignment rows. (3) Segmented active state was invisible: `bg-background-active` resolves to #2a2a2a on the #222222 field fill — `SEGMENT_ACTIVE_CLASSES` now uses `bg-foreground/15` pill. (4) Font picker was 2 triggers deep and the inline intermediate trigger (showing the full fallback stack) overflowed the panel — `FontField` gained a `trigger` slot, `FontHeroRow` forwards ref/props, Text section now opens the searchable popover in one click. (5) Color rows opened a popover containing ANOTHER trigger (3+ clicks to the real picker) — new `ColorPickerInline` renders `ColorPickerContent` (gradient + sliders + palette) directly in ColorRow's popover; swapped in text/background/border/effects sections. (6) Right-panel resize lag: `useResizable` set React state per mousemove, re-rendering the whole panel subtree at pointer frequency — now writes DOM width directly during drag and commits state once on mouseup (onWidthChange → persistence/breakpoints fire at drag end). Canvas element-resize lag was already fixed by a parallel session's uncommitted RAF-batching diff in `canvas/overlay/elements/rect/resize.tsx` (not committed here — foreign work).
Files: `packages/ui/src/components/resizable.tsx`, `style-tab-v4/controls/{constants.ts,color-picker-inline.tsx,select-field.tsx,labeled-inputs.tsx,font-hero-row.tsx,color-row.tsx,...}`, `style-tab-v4/sections/{text,background,border,effects}.tsx`, `style-tab-v2/controls/font-field.tsx`
Links: prior entry below (round 1 consolidation)

## 2026-06-10 — Style Panel v4 control-grammar consolidation
Author: Claude (Fable 5)
Area: editor right panel (`style-tab-v4`)
Summary: Standardized every Style Panel control onto the shared v4 grammar in `controls/constants.ts`. Added `SEGMENT_ITEM_CLASSES` (shared segmented-item geometry, unified 9px inner radius — IconSegment was 6px vs FlowSegment 9px) and a v4-local `SliderField` (drops the cross-version import from `style-tab-v2`, 26px row, tabular-nums readout, disabled state). Replaced drifted one-off field clones with `FIELD_BASE_CLASSES`: LayoutGuidePopover's inline 24px/6px inputs+selects, Advanced section's custom-var name input (visible border + `rounded-sm` → transparent-border 10px field), Element raw-className textarea (gained hover/focus-border states). ChipInput container height aligned 28→26px (p-4→3px). Raw `divide-[var(--border)]` → semantic `divide-border` in SegmentedDisplay/IconToggleField/GrowOverflowRow. Contrast verified against tokens: dark labels `#b2b2b2` secondary, icons-at-rest `#717171` tertiary ≈3.4:1 on field fill (meets UI-component minimum), placeholders `muted-foreground`. Known remaining inconsistencies: hero rows differ intentionally (FontHeroRow 36px vs ColorRow 32px); `FIELD_BASE_CLASSES_SM` (PinPad, 20px/rounded-sm) is a deliberate second scale; v2-imported ColorField/FontField/ConnectButton still pending v4 ports.
Files: `apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v4/controls/{constants.ts,slider-field.tsx,index.ts,icon-segment.tsx,flow-segment.tsx,layout-guide-popover.tsx,chip-input.tsx,icon-toggle-field.tsx,segmented-display.tsx,grow-overflow-row.tsx}`, `sections/{advanced.tsx,element.tsx}`
Links: design grammar source `style-tab-v4/DESIGN-BRIEF.md`

## 2026-06-06 — Production auth E2E hardening
Author: Codex
Area: auth, production config, E2E QA
Summary: Ran local and production smoke/E2E coverage across public pages, signed-in dashboard, project creation, editor mode/preview, clone dialog, marketplace, and GitHub import gate. Local blank Next.js creation reached the editor and preview rendered. Production public pages rendered, but email OTP did not produce an authenticated session; root cause was twofold: the verify page navigated immediately after `setActive()` instead of waiting for Clerk's signed-in state, and Railway production still had Clerk/Convex dev selectors. Fixed the verify-page race and corrected Railway production vars (`CLERK_FRONTEND_API_URL` to the production Clerk frontend and `CONVEX_DEPLOYMENT` to the prod Convex deployment), triggering a Source redeploy.
Files: `apps/web/client/src/app/sign-in/verify/page.tsx`, `BACKLOG.md`, Railway Source production variables
Links: `docs/agent-context/prod-e2e-testing.md`; BACKLOG entry "Confirm Railway `NEXT_PUBLIC_CONVEX_URL` = prod Convex (`rapid-crab-113`)"

## 2026-06-05 — Full component catalog (1533) + on-brand scaffold + `shadcn` agent skill
Author: Claude (Opus 4.8)
Area: component registry, AI skills (`packages/ai/src/skills`), scaffolder (`packages/code-provider`)
Summary: Extended the F-785 MVP (21 components) to the full free catalog — 1533 items: all free shadcn/ui (78), shadcnblocks-free (293, probe-classified from 3365 via `/r/<name>.json` returning content vs "Authentication failed"), Watermelon UI (964, from the github registry), and 198 local pro blocks vendored from `reference/shadcn-pro-blocks`. Rewrote `scripts/fetch-components.mjs` as a catalog builder: registry blocks are catalogued (name + description + install URL — installed on demand) rather than vendored, so the repo isn't flooded with ~4500 third-party files; only pro + a core set are vendored. shadcnblocks descriptions are real (from `registry.json`); Watermelon's are derived from name stems. Outputs `manifest.json`, human `CATALOG.md`, and `skill-catalog.md`. Blank Next.js scaffolds now bake the Weblab OKLCH tokens into `globals.css` (`NEXTJS_GLOBALS_CSS` in `scaffoldNextProject`) so sites are on-brand before the AI runs. Added an embedded `shadcn` agent skill (`skills/shadcn/SKILL.md` → `bun run generate:skills`) carrying the shadcn design foundations + the full catalog index + install patterns; the `<component-registry>` prompt now points the agent at `read_skill("shadcn")`. Install URLs: shadcn `ui.shadcn.com/r/styles/new-york/<n>.json`, shadcnblocks `shadcnblocks.com/r/<n>.json`, Watermelon raw github (the `registry.watermelon.sh` host serves a SPA, not JSON). web-client typecheck + targeted lint green; prompt suite 27/27.
Files: `component-registry/{scripts/fetch-components.mjs,manifest.json,CATALOG.md,skill-catalog.md,README.md,pro/**}`, `skills/shadcn/SKILL.md`, `packages/ai/src/skills/{embedded,embedded-summaries}.ts` (regenerated), `packages/ai/src/prompt/constants/components.ts`, `packages/code-provider/src/providers/vercel-sandbox/index.ts`, `packages/ai/test/prompt/component-registry.test.ts`
Links: changelog v3.7; feature-catalog F-785 / test-plan T-815; BACKLOG follow-ups

## 2026-06-05 — Curated component registry + anti-slop design mandate in the AI system prompt
Author: Claude (Opus 4.8)
Area: AI prompt (`packages/ai/src/prompt`), constants (`packages/constants`), new `component-registry/` folder
Summary: Constrained the website-builder agent to a fixed, tweakable component catalog + one design-token palette so generated sites stop reading as "AI slop." Added `component-registry/` (repo root): 21 components fetched from real registries (16 shadcn/ui new-york + 5 Watermelon UI via `scripts/fetch-components.mjs`), `theme/tokens.css` (OKLCH shadcn-var palette: tinted neutrals, impure black/white, one teal whisper accent, flat), `theme/fonts.md`, `lib/utils.ts`, anti-slop block/template exemplars, `registry.config.ts`, `components.json`, `manifest.json`, README. Mirrored the catalog into `@weblab/constants` (`COMPONENT_REGISTRY`) and added three prompt blocks injected into the cached system prefix (both `cache-blocks.ts` and `provider.ts`): `<design-system>` (the design mandate), `<component-registry>` (default Next.js+React+shadcn stack, use-tokens-never-invent, install via `bunx shadcn add <url>`, match-existing-project), `<anti-slop-checklist>` (pre-return gate). Override order: attached reference > existing project's conventions > defaults; the forbidden list is defaults-not-censorship (honor explicit user requests). Full 844-line field guide saved to `docs/agent-context/ai-slop-field-guide.md`. 13 new unit tests; web-client typecheck + constants lint green.
Files: `component-registry/**`, `packages/constants/src/component-registry.ts`, `packages/ai/src/prompt/constants/{design,components,slop-checklist}.ts`, `packages/ai/src/prompt/{cache-blocks,provider}.ts`, `packages/ai/test/prompt/component-registry.test.ts`, `docs/agent-context/{ai-slop-field-guide,design-mandate-source}.md`
Links: changelog v3.6; ADR 2026-06-05 (component registry); feature-catalog F-785 / test-plan T-815

## 2026-06-05 — Standard 16px text scale + `text-tiny` token
Author: Claude (Opus 4.8)
Area: design system / global CSS (`apps/web/client/src/styles/globals.css`, `packages/ui/src/globals.css`)
Summary: Fixed app-wide too-small text and the "shrinks on every reload" flash. Root cause was the default root font size: `html[data-font-size='medium']` was 14px, scaling every `rem` (text **and** spacing) to 87.5% (text-xs read 10.5px), and the client applied medium=14px *after* the 16px first paint → one-step shrink. Rebased the appearance scale to small/medium/large = 14/16/18px so medium (default) is a true 16px root. Pinned the standard `--text-*` tokens (xs/sm/base/lg/xl/2xl) and added `--text-tiny` (0.625rem / 10px) for sub-`text-xs` micro labels. Swept 115 hardcoded `text-[10px]`→`text-tiny` and 4 `text-[13/14px]`→`text-sm` across editor/projects/dialogs; landing mockups + an icon-glyph `text-[13px]` left intentional. Editor `text-[11px]`/`text-[12px]` left hardcoded per request (logged in BACKLOG). Whole app now renders at standard density (+14% vs before); architectural note: hardcoded px no longer overrides the density setting.
Files: `styles/globals.css`, `packages/ui/src/globals.css`, `design-system/_components/demos/data.ts`, 56 UI components
Links: changelog v3.5

## 2026-06-05 — Project creation blocker fixes
Author: Codex
Area: project creation, Vercel sandbox setup, template previews, AI chat send path
Summary: Fixed the remaining clone-from-URL and Startd blockers from the E2E hardening pass. Clone create now flushes the generated user prompt into AI SDK state before starting regeneration; public template detail pages no longer import a client component helper from a server page; git-import sandbox installs are lockfile-aware and legacy Next templates normalize to Next 12/React 17 so Startd boots on Vercel Sandbox. Added production E2E auth-account guidance for agents.
Files: `apps/web/client/src/app/project/[id]/_hooks/use-chat/index.tsx`, `apps/web/client/src/app/projects/_components/select/project-preview-utils.ts`, `apps/web/client/src/app/projects/templates/[id]/page.tsx`, `apps/web/server/src/sandbox/index.ts`, `packages/code-provider/src/providers/vercel-sandbox/index.ts`, `docs/agent-context/prod-e2e-testing.md`
Links: `docs/agent-context/prod-e2e-testing.md`

---

## 2026-06-05 — Project creation E2E hardening pass
Author: Codex
Area: project creation, Vercel sandbox setup, editor interactions runtime, optional AI memory
Summary: Tested project creation locally across blank Next.js, blank static HTML, prompt create, marketplace template, clone URL, and import entry routes. Fixed sandbox auth readiness for local Fastify tRPC, restored runtime metadata into editor bootstrap so static HTML projects use the correct injection/setup path, propagated framework port/dev command into sandbox setup, changed static preload/runtime injection to module scripts, re-seeded missing public interactions runtime files, and made Mem0 memory storage a no-op when `MEM0_API_KEY` is absent. Remaining blockers found: clone URL creates a project but does not auto-run the generated AI prompt, the Startd marketplace template cannot boot (`next` missing), and prod E2E needs a production auth session/deploy.
Files: `apps/web/client/src/lib/sandbox-server-client.ts`, `apps/web/server/src/router/context.ts`, `apps/web/server/src/router/routes/sandbox.ts`, `apps/web/server/src/sandbox/index.ts`, `apps/web/client/src/app/project/[id]/_adapters/convex-bootstrap.ts`, `apps/web/client/src/components/store/editor/sandbox/*`, `apps/web/client/src/components/store/editor/interactions/index.ts`, `packages/ai/src/memory/*`, `BACKLOG.md`
Links: `BACKLOG.md` entries "Project creation E2E 2026-06-05" and "Editor cleanup logs `File system not initialized`"

---

## 2026-06-04 — Copy to Figma (native clipboard, editable layers, no plugin)
Author: Claude Opus 4.8
Area: editor canvas (right-click menu, frame toolbar, element overlay), new package `@weblab/figma-clipboard`, preload bridge
Summary: User asked for a "copy to Figma" feature — right-click an element, or a Figma-logo button when a frame is selected — that pastes into Figma. Chose (via clarifying Qs) **editable Figma layers via native paste, no plugin**. New `@weblab/figma-clipboard` encodes a serialized DOM subtree into Figma's native clipboard format: it writes the `text/html` envelope whose `data-buffer` holds a base64 `fig-kiwi` archive (magic + version 15 + zlib-raw `[schema][message]` chunks), driven by `kiwi-schema` + `pako`. The Figma scene **schema is vendored** (`src/schema-data.ts`, 62 KB, extracted from a public `.fig`'s chunk-1 via `scripts/extract-schema.ts`) — derived empirically rather than hand-written, per the format reverse-engineered by the `fig-kiwi` npm package. New preload bridge `getFigmaSceneData(domId?)` serializes the subtree (geometry relative to root + a computed-style subset + text) inside the iframe (the editor can't read it cross-origin); editor manager `CopyToFigmaManager` (`engine.figma`) builds the HTML and writes it via `navigator.clipboard.write([ClipboardItem])` on the click gesture. Surfaced on all 4 requested affordances using the pre-existing `Icons.Figma`. v1 mapping: solid fills, uniform/per-corner radius, uniform borders, text (chars/size/weight→style/align/color), opacity, absolute positioning; images → placeholder rect; gradients/shadows/flex→auto-layout deferred.
Verification: `bun typecheck` ✅ (web-client exit 0; added `getFigmaSceneData` to the `view.tsx` remote-methods map). Round-trip unit tests ✅ (`packages/figma-clipboard/test/encode.test.ts`, 3 pass / 34 asserts — encode→decode via the vendored schema proves field names + archive + envelope). eslint `--max-warnings 0` ✅ on all new files (generated `schema-data.ts` ignored). **Not run here** (env limits): the real Figma paste E2E (no Figma app in this env) and `bun lint`/`bun test` via the normal scripts (local Node 18 < the eslint config's Node-20 `import.meta.dirname`). Two residual risks are live-Figma-only: clipboard version tolerance + the `parentIndex.position` fractional-index format — see BACKLOG + T-814.
Files: `packages/figma-clipboard/**` (new), `apps/web/preload/script/api/elements/dom/figma-scene.ts` (new) + `api/index.ts`, `src/components/store/editor/copy/figma.ts` (new) + `engine.ts`, `right-click-menu/index.tsx`, `editor-bar/frame-selected/window-actions-group.tsx`, `canvas/overlay/elements/buttons/figma.tsx` (new) + `index.tsx`, `canvas/frame/view.tsx`
Links: changelog v3.4; feature-catalog F-783 + F-784; test-plan T-813/T-814; ADR 2026-06-04

---

## 2026-06-04 — Element AI button + inline-edit popover on canvas selection
Author: Claude Opus 4.8
Area: editor canvas overlay (`canvas/overlay`), chat store, right panel
Summary: User asked for a small AI affordance on a selected element (like the Cursor/Onlook command box). Added `OverlayAiMenu` — a Sparkles button anchored to the **top-right** corner of the selected element's overlay rect (mirrors `OverlayButtons`' `position: fixed` + `clickRects[0]`, so it tracks pan/zoom). Clicking opens a compact Radix popover: a `NodeIcon`+tag header, an autosizing textarea, and a footer with **Add to chat** (left) + **Send** (right). **Send** runs an inline AI edit (`chat.sendMessage(value, ChatType.EDIT)` — element auto-attached via the selection context reaction); **Add to chat** reveals/focuses the right-panel chat with the element attached, no auto-send. Critical correctness fix surfaced in planning: `chat.sendMessage` throws `'Chat actions not initialized'` whenever the chat tab is unmounted (the common case — selecting an element auto-switches the panel to Style). So both actions first dispatch a new `OPEN_CHAT_PANEL_EVENT` (right panel listens, mirroring `FIX_ERRORS_EVENT`: unhide → uncollapse → `setActiveTab('chat')`); Send then waits for the hook to wire up via `waitForChatReady()` (polls `chat.isChatActionReady`, 2.5s budget) before sending. Self-gated: single selection, DESIGN mode, AI available (`useProjectCapabilitiesContext`), not text-editing/streaming, and hidden when the legacy `showMiniChat` mini-chat is enabled (the two are config-exclusive). i18n added under `editor.panels.edit.tabs.chat.aiMenu` in all 7 locales.
Verification: `bun typecheck` ✅ (exit 0), eslint `--max-warnings 0` ✅ on all touched files, unit tests ✅ (`wait-for-chat-ready.test.ts`, 4 pass — covers ready/late-attach/timeout). Real Turbopack compile of `/project/[id]` (imports the new component transitively) ✅ no module errors. Full select→popover→send browser E2E not run — the editor canvas is Clerk-auth + Vercel-sandbox gated and unreachable headlessly this session.
Files: `src/app/project/[id]/_components/canvas/overlay/elements/buttons/ai-menu.tsx` (new), `.../buttons/wait-for-chat-ready.ts` (+`.test.ts`), `.../canvas/overlay/index.tsx`, `src/components/store/editor/chat/index.ts`, `.../right-panel/index.tsx`, `messages/{en,es,ja,ko,sv,zh}.json`
Links: changelog v3.3; feature-catalog F-292 (+ test-plan T-810/T-811/T-812)

---

## 2026-06-03 — Human-readable workspace URL slugs (+ name-based published-subdomain default)
Author: Claude Opus 4.8
Area: `apps/web/client/convex` (workspaces, personal-workspace lib, domains preview slug)
Summary: User asked why the projects page URL was `/w/personal-<32-char-user-id>/projects` and whether it could read like a name. Root cause: personal-workspace slug was hardcoded `personal-${user._id}` ([personalWorkspace.ts](apps/web/client/convex/lib/personalWorkspace.ts), [workspaces.ts](apps/web/client/convex/workspaces.ts) `ensurePersonal`), while team workspaces already got name-based slugs. Unified both on a new `lib/workspaceSlug.ts` (`baseWorkspaceSlug` pure + `generateUniqueWorkspaceSlug` collision loop) deriving the slug from the workspace **name** (Webflow/Framer style), with `-2`/`-3` suffix only on collision. Reserved `new` etc. (the `/w/new` static route would shadow a workspace slugged "new"). Added idempotent `_backfillPersonalSlugs` internalMutation (matches the exact legacy `personal-<createdByUserId>` shape via the by_slug index range — never false-positives a name-derived `personal-*` slug); ran on dev → 2/2 migrated (`personal-j571…` → `ludvig-hedins-workspace`). Old URLs self-heal: stale slug → `getBySlug` null → `/projects` redirect → re-resolves. Also switched the **published** preview-subdomain default from id-derived to name-derived (`slugFromNameForSubdomain` + global-uniqueness loop in `domainActionsDb._previewCreate`; gated behind currently-disabled publish, id fallback). Deferred (logged in BACKLOG): humanizing the `/project/<id>` **editor** URL — needs a workspace-scoped route to avoid global slug collisions + touches the core editor/offline bootstrap.
Verification: 26/26 unit tests ✅ (`workspaceSlug.test.ts` + `previewSlug.test.ts`), `convex` typecheck ✅ (exit 0), deployed to dev + backfill ran + re-run idempotent (0/0), independent reviewer ✅ (fixed its one real finding: exact-legacy-match backfill). Browser E2E not run — workspace routes are Clerk-auth-gated; ground-truth verified via the dev DB (`convex data workspaces` shows the new slugs).
Files: `apps/web/client/convex/lib/workspaceSlug.ts` (new) + `.test.ts`, `convex/workspaces.ts`, `convex/lib/personalWorkspace.ts`, `convex/lib/previewSlug.ts` (+test), `convex/domainActionsDb.ts`, `src/lib/changelog-entries.ts`
Links: changelog v3.2; BACKLOG (editor-URL entry)
Memory: `convex codegen` only generates types — it does NOT deploy functions; use `convex dev --once` to push to dev. `convex run`/`data`/`dev` are sandbox-blocked (websocket transport) — run with `dangerouslyDisableSandbox`; `codegen` works sandboxed (plain HTTPS).

---

## 2026-06-03 — Local folder + GitHub repo import re-enabled (create-paths audit)
Author: Claude Opus 4.8
Area: `apps/web/client` (import entry-point hooks)
Summary: Goal: "make all project creation work." Audited every create entry point. Re-enabled the two stubbed paths that had ready Convex backends: (1) local folder import — the dashboard-card / hero / empty-state hook (`use-import-local-project`) now routes to the already-working `/projects/import/local` page (→ `createEmptySandbox` + sandbox upload + `projects.create`) instead of throwing "temporarily unavailable"; (2) GitHub repo import — `use-repo-import` wired to `projectActions.createFromGit` (clone + persist in one action; public repos). Confirmed already-working: blank, AI prompt (`createFromPrompt`), git-URL + public-GitHub-template (`createFromGit`/`startPublicGitHubTemplate`), website clone (`createFromWebsiteClone`). Still blocked and logged in BACKLOG: fork-based paths — project clone + marketplace "Use template" (`fork` action needs Vercel snapshot-based fork, `TODO(sandbox-fork)`) — and Figma import (wirable to `createEmptySandbox` but only yields low-fidelity colored-box stubs; recommend the screenshot→AI path instead).
Verification: `bun typecheck` ✅, `eslint` ✅ on changed files. Full browser E2E blocked (Clerk-auth-gated + real Vercel sandbox provisioning, not automatable headless).
Files: `apps/web/client/src/hooks/use-import-local-project.ts`, `apps/web/client/src/app/projects/import/github/_hooks/use-repo-import.ts`
Links: changelog v3.1; commit `7a9c5df8e`; BACKLOG (sandbox-fork + figma entries)

---

## 2026-06-03 — Website clone re-enabled end-to-end (Convex) + Firecrawl key env fix
Author: Claude Opus 4.8
Area: `apps/web/client` (clone hook + helpers), `convex/projectActions.ts` (new action); deployment config (Convex env)
Summary: Website clone (from URL or screenshot) had been stubbed since the Supabase→Convex migration — `useCloneWebsite` scraped then threw "temporarily unavailable". Re-wired it through the proven create pipeline: new `projectActions.createFromWebsiteClone` provisions a Vercel sandbox and seeds the purpose-built clone context types (WEBSITE_URL + framework, WEBSITE_SCRAPE, IMAGE, PROMPT) that the editor's existing `use-start-project.resumeCreate` already turns into a framework-specific clone prompt via `getCloneSystemPrompt` — lighting up a previously dead replay branch instead of duplicating it. The user-facing "FIRECRAWL_API_KEY is not configured" error was a separate, env-placement root cause: the key was in Next.js `.env.local`, but the scrape runs in a Convex action that reads its own deployment env. Key set on both Convex deployments (dev avid-gnat-539 + prod rapid-crab-113).
Verification: `bun typecheck` ✅, `eslint` ✅ (0), `bun test` ✅ (6/6 new helper tests), independent reviewer ✅ (no issues). Could NOT drive full browser E2E — the clone dialog is Clerk-auth-gated and a real Vercel sandbox provision can't be automated headless. New Convex action deployed to dev via `convex codegen`; prod gets it on the next CI Convex deploy (push required).
Files: `apps/web/client/src/hooks/{use-clone-website.ts,clone-prompt.ts,clone-prompt.test.ts}`, `apps/web/client/convex/projectActions.ts`
Links: changelog v3.0 (F-782); commit `38a0cf921`
Memory: Convex actions read the Convex deployment env, NOT Next.js `.env.local` / Railway env — set runtime keys with `convex env set [--prod]`.

---

## 2026-05-29 — Skills upload + more built-ins + agent image generation (Nano Banana via OpenRouter, metered)
Author: Claude Opus 4.8
Area: `apps/web/client` (settings Skills tab, chat API route, Convex usage), `packages/ai` (image tool + provider, skills codegen), `packages/models` (image registry)
Summary: Five workstreams shipped together. (1) The skill import dialog now accepts a `SKILL.md` or `.zip` upload (client-side `fflate` unzip → existing `rawContent` path); Upload is the default tab, then Paste, then URL, and it auto-previews on upload. (2) The Skills scope selector ("All / My skills / This project") gained explanatory help copy. (3) Seeded 7 more default-on built-in skills (apple-design, bug-hunt, design-audit, design-review, react-best-practices→`vercel-react-best-practices`, ui-ux-pro-max, ux-polish) via the `skills/<name>/SKILL.md` → `generate:skills` codegen, and added a client-safe `EMBEDDED_SKILL_SUMMARIES` export so the browser bundle no longer ships ~130KB of skill bodies. (4) Wired Nano Banana (`google/gemini-2.5-flash-image`) image generation through OpenRouter's REST chat-completions endpoint (the AI-SDK provider exposes no image interface); GPT Image stays on direct OpenAI (OpenRouter has no OpenAI image model). (5) Metered image gen against the existing credit pool: 5-credit multiplier + per-user daily cap (free 2 / pro 50) + per-minute burst (3) + per-turn cap (4), all reverted on failure.
Verification: web-client + convex `tsc` ✅; `bun lint` ✅ on changed files; 23 new unit tests pass (usageMath credit math + OpenRouter data-URL parse); preview smoke ✅ (home compiles + loads clean after a dev-server restart picked up the generated summaries file). Independent review (claude-review) flagged 4 — fixed 3 (free-tier credit-pool enforcement in `reserveImage`, refund clamp to `bucket.max`, removed an SSRF-prone hosted-URL fallback) and backlogged 1 (Pro multi-bucket credit fragmentation). Could NOT interactively test the auth-gated Skills dialog (needs login).
Files: `apps/web/client/convex/{usage.ts,schema.ts,lib/enums.ts,lib/usageMath.ts(+test),lib/imageLimits.ts}`, `apps/web/client/src/app/api/chat/route.ts`, `apps/web/client/src/components/ui/settings-modal/skills-tab/{index.tsx,skill-import-dialog.tsx}`, `apps/web/client/messages/en.json`, `packages/ai/src/{tools/classes/generate-image.ts,image/providers.ts(+test),tools/server-context.ts,client.ts,scripts/generate-skills.ts,skills/embedded*.ts}`, `packages/models/src/image/index.ts`, `skills/{apple-design,bug-hunt,design-audit,design-review,react-best-practices,ui-ux-pro-max,ux-polish}/SKILL.md`
Links: changelog v2.3 + v2.4; spec `docs/superpowers/specs/2026-05-29-skills-image-gen-design.md`; BACKLOG (3 new Open entries)

---

## 2026-05-29 — Project-creation flow: fix duplicate onboarding, sandbox cold-boot resilience, Ollama CSP spam, 502 card thumbnails
Author: Claude Opus 4.8 (investigate session)
Area: `apps/web/client` (onboarding tour + Convex users, editor sandbox boot, projects card, chat tab), `apps/web/client/convex` (users schema/mutation)
Summary: Investigated the "create blank project" flow end-to-end and fixed five distinct defects surfaced by the console (sandbox 502s, escalating penpal timeouts, `__missing_router_config__`, Ollama CSP violations) plus the reported "onboarding shows again for existing users" and "card with an error" symptoms. (1) **Onboarding re-show** — the first-run tour stored "seen" only in browser `localforage`, so existing users re-saw it after a storage clear / new browser / the suppression timing during create. Made it durable per-user: added `users.hasSeenEditorOnboarding` (Convex schema) + `users.markEditorOnboardingSeen` mutation; the tour now gates on the per-user flag (localforage kept as an optimistic cache) and only persists "seen" on a genuine dismissal/completion — never when it auto-hides because the anchor panels aren't mounted yet (which previously could burn the flag). (2) **Preload injection was terminal** — after a 5×2s retry budget (~10s) a *transient* `__missing_router_config__` (sandbox FS not synced yet on cold boot) logged `console.error` AND stopped retrying, so the preload script never injected and the editor "loaded forever"; extracted `planPreloadRetry` so the transient case retries patiently up to ~60s and always logs at `debug`. (3) **Preview stranded after cap** — the iframe auto-reload capped at 6 attempts (~27s) and, because `useSandboxLiveness` is a no-op on Convex, nothing re-armed the iframe when a slow Vercel sandbox finally served; added `planReload` self-heal (gentle 15s background reloads up to ~3min past the cap) so the preview reconnects on its own while still showing the manual Retry panel. (4) **Ollama CSP console spam** — the chat tab browser-probed `http://localhost:11434/api/tags` on every mount, which the hosted-prod CSP (`connect-src 'self' https: wss:`) blocks → a guaranteed "Refused to connect" violation; gated the browser fallback behind `canReachLocalOllamaFromBrowser()` (only where CSP permits localhost; the server route probe still runs everywhere). (5) **Card "with an error"** — a brand-new project's card iframed the cold sandbox URL, which 502s during boot, rendering a "502 Bad Gateway" tile; stopped using the sandbox URL as a thumbnail (no liveness signal to gate it) so the card shows a calm skeleton until a real screenshot exists, and added `*.vercel.run` to `isNonEmbeddable`. Also made the blank-create loader caption honest (15s → 20–40s range).
Verification: `bun typecheck` ✅ for all touched files (a parallel agent's in-flight `skill-import-dialog.tsx` rewrite + `en.d.json.ts` i18n drift makes the *whole-project* typecheck red, but zero errors reference any file in this change — confirmed by grep). `eslint` ✅ — 0 new warnings across the 14 changed src files (3 remaining warnings in `use-frame-reload.ts` + `sandbox/index.ts` are pre-existing on `main`, confirmed via HEAD baseline lint). 22 new unit tests across 5 files pass (`planPreloadRetry`, `planReload`, `resolveOnboardingVisibility`, `canReachLocalOllamaFromBrowser`, `isNonEmbeddable`). Could NOT browser-verify the live sandbox boot/penpal paths (needs a real Vercel-sandbox env + cold boot); the testable decision logic is unit-covered and the rest is behind the new resilience guards. The deeper "create is slow / double-boot" + "liveness probe unported" issues are infra-bound and logged in BACKLOG.
Files: `apps/web/client/convex/schema.ts`, `apps/web/client/convex/users.ts`, `apps/web/client/src/app/project/[id]/_components/onboarding-tour.tsx`, `apps/web/client/src/app/project/[id]/_components/onboarding-visibility.ts` (+test), `apps/web/client/src/components/store/editor/sandbox/index.ts`, `apps/web/client/src/components/store/editor/sandbox/preload-retry.ts` (+test), `apps/web/client/src/app/project/[id]/_components/canvas/frame/use-frame-reload.ts`, `apps/web/client/src/app/project/[id]/_components/canvas/frame/frame-reload-policy.ts` (+test), `apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-tab-content/index.tsx`, `apps/web/client/src/services/offline/ollama-client.ts` (+test), `apps/web/client/src/app/projects/_components/select/project-preview-surface.tsx` (+test), `apps/web/client/messages/en.json`, `BACKLOG.md`
Links: BACKLOG "Blank-project create pays the sandbox cold-boot cost twice" + "Sandbox liveness probe is a no-op on Convex" (both Open, new)

## 2026-05-29 — Resilience pass: auto-recover stale-chunk crashes + convert Convex SSR hangs (524) to retryable errors
Author: Claude Opus 4.8 (full-repo code review + ship)
Area: `apps/web/client/src/app` (root layout, error boundary), `apps/web/client/src/utils/convex` (server-fetch), `packages/ui` (input-otp), `apps/web/client/src/app/sign-in` (auth form)
Summary: Reviewed and shipped a batch of in-flight reliability fixes. (1) **Stale-chunk auto-recovery** — long-lived tabs keep a module graph pointing at content-hashed chunk filenames that rotate on every deploy/HMR, so a later dynamic import 404s with `ChunkLoadError` and strands the user on the "Something went wrong" card. New `ChunkErrorReloader` (mounted in root layout) listens for `error`/`unhandledrejection` (capture phase, to catch non-bubbling `<script>` load errors) and the root `error.tsx` boundary now detects chunk errors too; both call a session-guarded one-time `window.location.reload()` (10s guard via `sessionStorage` stops reload loops on a genuinely broken build). The boundary renders a blank surface while recovering so the error card never flashes. (2) **Convex SSR timeout** — server-side `fetchQuery`/`fetchMutation` in the workspace layout + legacy `/projects` page block the SSR response; a slow/unavailable Convex backend (most often during a prod deploy version swap) hangs past Cloudflare's ~100s edge timeout → hard **HTTP 524** with no recovery (the error boundary only catches *thrown* errors, never a hang). New `fetchQueryWithTimeout`/`fetchMutationWithTimeout` (`@/utils/convex/server-fetch`, 10s ceiling) race the call against a timeout that throws `ConvexRequestTimeoutError`, which the nearest `error.tsx` catches and renders as retryable. (3) **OTP visibility** — the email-code `InputOTPSlot` used `border-input`, which in dark mode ≈ the fill color, making the boxes near-invisible; restyled with a visible fill + border in both themes and a neutral active ring (no blue). (4) Removed a redundant "We'll email you a code" hint under the sign-in email button. (5) Added the missing `billing/format.test.ts` its source header already claimed.
Verification: `bun typecheck` ✅ (exit 0), `bun lint` ✅ (exit 0, max-warnings 0), `bun test` — `chunk-error-reloader.test.ts` 8/8, new `format.test.ts` 10/10. Production build ✅ (`bun run build`). Did not browser-verify the 524 path (requires inducing a real Convex hang) or the chunk-reload path (requires a live deploy chunk rotation); both are guarded + unit-tested where logic is testable.
Files: `apps/web/client/src/app/_components/chunk-error-reloader.tsx` (new), `apps/web/client/src/app/_components/chunk-error-reloader.test.ts` (new), `apps/web/client/src/app/error.tsx`, `apps/web/client/src/app/layout.tsx`, `apps/web/client/src/utils/convex/server-fetch.ts` (new), `apps/web/client/src/app/w/[slug]/layout.tsx`, `apps/web/client/src/app/projects/page.tsx`, `packages/ui/src/components/input-otp.tsx`, `apps/web/client/src/app/sign-in/_components/clerk-auth-form.tsx`, `apps/web/client/src/components/ui/settings-modal/billing/format.test.ts` (new)
Links: BACKLOG "Billing settings redesign built but not wired" (new, `#wip`)

## 2026-05-29 — Diagnose "can't create projects" (Vercel HTTP 402) + make sandbox-provision failures legible
Author: Claude Opus 4.8
Area: `apps/web/client/convex` (project/branch create actions), `apps/web/client/src` (blank-create hook, editor branch manager)
Summary: Investigated "Project creation is temporarily unavailable" + "Start blank → Server Error". Root cause is **not code**: the Vercel Sandbox API returns **HTTP 402 Payment Required** for the team in `VERCEL_TEAM_ID`, so `Sandbox.create` fails for every create + editor-resume path. Confirmed by matching the user's prod console request id `d93c958b083e9289` to a prod Convex log line (`Uncaught Error: Status code 402 is not ok` at `projectActions.ts:243`). Both Convex deployments (dev `avid-gnat-539`, prod `rapid-crab-113`) already have all three Vercel creds, so it's a billing/spend/plan limit on the Vercel side — needs a manual dashboard fix (logged in BACKLOG). The code change makes the failure legible: a plain `Error` thrown from a Convex action is redacted to "Server Error" in prod, so added `convex/lib/sandboxErrors.ts` (`mapSandboxProvisionError`) that re-wraps recognized Vercel HTTP failures (402 billing, 401/403 auth, 429 rate-limit, 5xx upstream) as a **`ConvexError`** carrying `{ kind, status, message, retryable }` — ConvexError data is delivered to the client verbatim. Wired into `projectActions.createBlank` + `branchActions.createBlank`; both client surfaces (`use-create-blank-project.ts`, `BranchManager.createBlankSandbox`) now read the structured payload to show the real reason + drive the Retry CTA off `retryable` instead of brittle string-matching. Verified edit/delete are unaffected by 402: `projects.remove` → `deleteProjectCascade` is pure Convex; `projects.update`/`setAccessMode` are pure mutations. Live code editing still needs the sandbox (same 402) — same root cause, not a separate bug.
Verification: `bun typecheck` ✅ (exit 0; caught + fixed an `interface`→`type` Value-constraint error on the ConvexError payload). New unit test `convex/lib/sandboxErrors.test.ts` 11/11 pass (`bun test`). `eslint --max-warnings 0` ✅ on the two client files (convex/* is eslint-ignored). Could NOT browser-verify create succeeding — the 402 is an external Vercel billing block; no code change makes Vercel provision a sandbox. Partial fix noted on BACKLOG F-361.
Files: `apps/web/client/convex/lib/sandboxErrors.ts` (new), `apps/web/client/convex/lib/sandboxErrors.test.ts` (new), `apps/web/client/convex/projectActions.ts`, `apps/web/client/convex/branchActions.ts`, `apps/web/client/src/hooks/use-create-blank-project.ts`, `apps/web/client/src/components/store/editor/branch/manager.ts`, `BACKLOG.md`
Links: BACKLOG "Vercel Sandbox returns HTTP 402" (Open, `#blocker`), BACKLOG F-361 (partial fix)

## 2026-05-28 — Add Claude Opus 4.8 model + model-picker polish (real Claude logo, hover bg, title size)
Author: Claude Opus 4.8
Area: `packages/models` (model registry), `packages/ai` (router/providers/pricing), `packages/ui` (icons), `apps/web/client` (model picker + landing showcases)
Summary: Added **Claude Opus 4.8** (`anthropic/claude-opus-4.8`) as a selectable model. New flagship is additive — Opus 4.7 stays. Registered it across the whole chain so it actually works end-to-end: `OPENROUTER_MODELS` enum, `CHAT_MODEL_OPTIONS` (shown in picker), `MODEL_MAX_TOKENS` (1M), `REASONING_CAPABLE_MODELS`, `CLAUDE_CODE_MODELS`, the auto-router `PREMIUM_MODELS` set, the `ANTHROPIC_DIRECT_MODEL_MAP` (`→ claude-opus-4-8` for direct-API routing), and `MODEL_PRICING` (15/75/18.75/1.5, same as 4.7). Also rebuilt the picker rows to match the build/plan (`ChatModeToggle`) dropdown exactly, per request: (1) swapped the angular Anthropic "A" glyph for the real Claude sunburst mark — added `ClaudeLogo` to `@weblab/ui` icons and pointed `cloudProviderIconName` at it for all `anthropic/*` models; (2) hover/selected background now uses cmdk's native `data-[selected=true]:bg-accent` (#2e2e2e) — removed the old motion.div + `hoveredCloudId` + inline `background:transparent` hack that produced an invisible (#222 on #222) hover; `Command` gets `defaultValue={selectedCloudValue}` so the rest-state highlight lands on the chosen row (not always the first), matching the Radix dropdown; (3) model name + description are both `text-mini` (12px, name `font-medium`) with `gap-2.5`/`px-3 py-2`/`gap-0.5` — identical size + spacing to build/plan; (4) added an `auto` entry to `MODEL_DESCRIPTIONS` so the Auto row shows a description; (5) the search box is now gated behind a new optional `showSearch` prop (default `false`) on `ModelSelectorV2` — kept in code, hidden everywhere by default. Bumped the rendered marketing showcases (feature-trio, model-agnostic, weblab-interface-mockup) from Opus 4.7 → 4.8 so the advertised lineup matches.
Verification: `bun typecheck` ✅ (web-client, exit 0). Browser-verified the hero picker via preview (same V2 component as chat-input): dropdown lists Opus 4.8 between Sonnet 4.6 and Opus 4.7, no search input, Auto shows its description, all three Claude rows render the sunburst path, the selected/highlighted row computes `rgb(46,46,46)` (bg-accent), name = 12px/500 + desc = 12px/400 (text-mini). No console errors. Standalone per-package typecheck noise (`--jsx not set`, missing `@convex/_generated`) is pre-existing config artifact, not from this change. No new lint warnings.
Files: `packages/models/src/llm/index.ts`, `packages/ai/src/chat/providers.ts`, `packages/ai/src/chat/model-router.ts`, `packages/ai/src/observability/index.ts`, `packages/ui/src/components/icons/index.tsx`, `apps/web/client/src/components/ai-prompt-composer/model-picker/model-selector-v2.tsx`, `apps/web/client/src/app/_components/landing-page/{model-agnostic-section,feature-trio-section,weblab-interface-mockup}.tsx`, `apps/web/client/src/lib/changelog-entries.ts`, `apps/web/client/content/blog/claude-opus-4-8.mdx`
Links: changelog v2.2 (`src/lib/changelog-entries.ts`), blog `content/blog/claude-opus-4-8.mdx`

## 2026-05-28 — Backlog user-flow sweep: fix invite-accept, billing-portal lockout, terminal crash
Author: Claude Opus 4.7
Area: `apps/web/client/convex` (invitations/billing), `apps/web/client/src/app/project/[id]/_components/bottom-bar`
Summary: Triaged the whole BACKLOG Open section for issues that actually break a user flow (excluding cosmetic/a11y/perf/abuse-only). Found most "2026-05-28" entries were already fixed but never moved to Resolved — verified and marked 4 stale (F-335 restart spinner, F-300 interactions null-guard, F-491 checkout double-sub guard, F-491 update schedule-release abort). Fixed 3 still-real flow breaks:
1. **F-360 invite-accept** — `projectInvitations.ts` lowercased but never trimmed emails, so a pasted address with stray whitespace stored a non-canonical row and the invitee could never accept. `isEmailMatch` now trims both sides (fixes legacy rows too) and `create` canonicalizes with `.trim().toLowerCase()`.
2. **F-491 billing-portal lockout** — `_findActiveSubscriptionForCaller` / `_findActiveProSubscriptionForPromo` used `.unique()` on `by_user_status`; any user with 2 pre-existing active subs threw and was locked out of the billing portal + promo. Switched both to `.take(2)` + pick-first + `console.warn`.
3. **F-330 terminal crash** — `terminal-area.tsx` switch-session wrote `sandbox.session.activeTerminalSessionId` after only null-checking `sandbox`; now guards `sandbox?.session` (crash during sandbox cold-boot).
Validated-and-left-alone: F-435 account-delete + F-427 GitHub-disconnect are gated with clear "temporarily unavailable" toasts (not silent breaks); wiring account-delete is destructive + has the F-558 orphan-PII risk. F-437 favicon raw-filename deferred (fix depends on `editorEngine.image.upload` contract). F-122 unauth-bounce needs runtime repro. Abuse/quota-concurrency entries (F-471/475/476) are revenue leaks, not user-flow breaks.
Verification: `bun typecheck` ✅, `eslint` on touched files ✅ (0 new warnings; pre-existing warnings untouched). No schema change → no codegen. Convex function changes deploy via the normal pipeline (not pushed from here).
Files: `convex/projectInvitations.ts`, `convex/lib/stripeWebhook.ts`, `src/app/project/[id]/_components/bottom-bar/terminal-area.tsx`, `BACKLOG.md`
Links: BACKLOG F-360 / F-491 / F-330 (Resolved)

## 2026-05-28 — Stripe webhook idempotency (evt.id dedup) + CodeRabbit fix pass
Author: Claude Opus 4.7
Area: `apps/web/client/convex` (billing/webhook), `apps/web/client/messages` (i18n), `apps/web/client/src/components/ui/pricing-modal`
Summary: Validated two CodeRabbit reviews against the code and fixed the real findings. Headline: closed the Stripe webhook duplicate-credit gap (BACKLOG F-491) — added a `stripeEventLog` table (`by_event_id`) and an `alreadyProcessed()` guard at the top of every `_handleSub*` mutation, with `event.id` threaded through `http.ts`. Dedup is transactional (log insert + handler work in one mutation) and race-safe via Convex OCC; a failed handler rolls back the log row so genuine retries still reprocess. Kept the table bounded with a daily `purgeStaleStripeEvents` cron (7-day TTL).
Other fixes: pre-existing unindexed `.filter` scan in `purgeStaleCursors` (added `cursors.by_lastSeen` index + `withIndex`); accurate `deleted` count + corrected doc-budget comment in cleanup.ts; 20 missing `sv.json` i18n keys added (en/sv now both 1637 leaf keys); SEO FAQ framework claim reconciled (dropped "Vue, Angular" → React/Next.js + roadmap); `sr-only` loading labels on the pricing-card auth-loading CTAs (a11y).
Validated as NOT bugs (skipped): `projects.list` "limit applied late" (micro-opt — `break` already caps `loadProjectListCard` work); `projects.update` "cloud clobber" (false positive — nested `runtimeMetadata.cloud` lives on the branches table, replaced wholesale; projects only carry `.framework`).
Deferred to BACKLOG: over-strict webhook field gate (can drop cancel/pause/resume); `_clearScheduleChange` `.filter` table scan.
Tests: no Convex test harness exists (`convex-test`/`@edge-runtime/vm` absent, zero `convex/*.test.ts`). Relied on `bun typecheck` + `eslint` + `claude-review`. Harness setup is a follow-up.
Files: `convex/schema.ts`, `convex/http.ts`, `convex/lib/stripeWebhook.ts`, `convex/internal/cleanup.ts`, `convex/crons.ts`, `messages/en.json`, `messages/sv.json`, `messages/en.d.json.ts`, `components/ui/pricing-modal/free-card.tsx`, `components/ui/pricing-modal/pro-card.tsx`
Links: BACKLOG F-491 (Resolved)

## 2026-05-28 — Prod Google login crash root-caused: prod Convex was never deployed
Author: Claude Opus 4.7
Area: Convex deploy pipeline / `apps/web/client/convex` / `apps/web/client/src/app/projects`
Summary: Google sign-in on weblab.build crashed ("This page couldn't load") with console errors `No auth provider found matching the given token` + `[CONVEX Q(users:me)] Server Error`. Root cause: the **production** Convex deployment (`rapid-crab-113`) was completely empty — no functions, no schema, no `auth.config.ts` had ever been pushed to it. The dev deployment (`avid-gnat-539`) had everything because devs run `convex dev` locally, but nothing in CI/Docker ever ran `convex deploy` for prod, and the `convex:deploy` npm script was mislabeled (`convex dev --once`, which targets dev). Empty prod deployment ⇒ no auth provider registered (every Clerk token rejected) AND `users:me` doesn't exist (query throws a Server Error that Convex's `useQuery` re-throws into the framework crash screen). Both console errors collapse to that one cause.

Fixes: (1) ran `convex deploy` to push functions+schema+auth.config to prod `rapid-crab-113` — verified `users:me` now returns null cleanly and issuer = `https://clerk.weblab.build`. (2) `package.json`: `convex:deploy` → `convex deploy --yes` (real prod), added `convex:dev:once` for the old one-shot dev behavior. (3) New GitHub Action `convex-deploy-production.yml` auto-deploys Convex to prod on push to main touching `convex/**` (+ manual dispatch), mirroring `supabase-push-staging.yml`. Needs repo secret `CONVEX_DEPLOY_KEY` (manual). (4) Added `app/projects/error.tsx` segment boundary so a future backend blip degrades to a retry UI instead of the bare framework crash (the `/projects` pages call `useQuery(api.users.me, {})` with no fallback).
Unverified: React error #418 (hydration) on /sign-in — likely secondary to the thrown query; logged to BACKLOG to confirm after the prod fix is validated live. Railway `NEXT_PUBLIC_CONVEX_URL` not yet confirmed = prod (Railway login expired) — see BACKLOG.
Files: `apps/web/client/package.json`, `.github/workflows/convex-deploy-production.yml`, `apps/web/client/src/app/projects/error.tsx`
Links: deploy = `rapid-crab-113.convex.cloud`

## 2026-05-28 — Desktop auth: route email through handoff + CAPTCHA mount + prefill
Author: Claude Opus 4.7
Area: `apps/web/client/src/app/sign-in`
Summary: Desktop email/OTP was still failing end-to-end after the OAuth handoff landed because Cloudflare Turnstile (Clerk's bot-protection CAPTCHA, required for the sign-up branch of the email flow) raises `Error: 600010` inside Electron — embedded Chromium fails Turnstile's environment checks. UI showed "The CAPTCHA failed to load…" and stuck on "Sending…". Three changes:

(1) `handleSendCode` in `clerk-auth-form.tsx` now mirrors `handleOAuth`'s desktop branch: when `window.weblabNative.target === 'desktop'`, route through `weblabNative.openExternal('/sign-in/desktop-handoff?email=…')` instead of calling `signIn.create` in the embedded Chromium. The email completes in the user's real default browser where Turnstile passes.

(2) Added the `<div id="clerk-captcha" />` mount point at the bottom of the form. Without it, Clerk logged "Cannot initialize Smart CAPTCHA widget" and fell back to Invisible Turnstile (the harder-to-pass variant and the source of the 600010 errors). With it, browser-side Clerk mounts the visible widget on demand only.

(3) Plumbed an `email` query param through `/sign-in/desktop-handoff` → `/sign-in?email=…&returnUrl=/sign-in/desktop-handoff?email=…` so the email the user typed in the Electron shell prefills the browser sign-in form (no double-typing across the OS-protocol handoff). Server-side sanitizer at the `/sign-in` entry rejects anything that isn't a plausible email so an attacker can't echo HTML / control chars into the form via `?email=`.

Verified end-to-end in the preview browser by injecting a fake `window.weblabNative` and observing every button (Email, Google, GitHub, Vercel) captures the correct handoff URL with the right query params, and that `/sign-in/desktop-handoff?email=…&provider=…` redirects to `/sign-in?email=…&returnUrl=…` with email prefilled. The final OS-protocol → desktop redeem step (`weblab://auth/handoff?ticket=…` → `/sign-in/redeem`) requires the actual Electron shell to test and is unchanged from `38b95dcf2`.
Files: `apps/web/client/src/app/sign-in/_components/clerk-auth-form.tsx`, `apps/web/client/src/app/sign-in/[[...rest]]/page.tsx`, `apps/web/client/src/app/sign-in/[[...rest]]/sign-in-client.tsx`, `apps/web/client/src/app/sign-in/desktop-handoff/page.tsx`
Links: n/a

## 2026-05-28 — CMS workspace bug-hunt sweep (F-380..F-392)
Author: Claude Opus 4.7
Area: `apps/web/client/src/app/project/[id]/_components/cms-workspace`
Summary: Scoped `/bug-hunt` over the 13 catalog rows F-380..F-392 (CMS shell, tabs, table, item editor, dialogs, data pusher). Three auto-fixes: (a) `edit-source-dialog.tsx` `source!.type` non-null assertion could TypeError if the user clicked Test before the source query resolved — added an early-return guard; (b) same file, seed effect overwrote the user's in-progress name edit when a Convex realtime refetch fired — added the `initializedRef` + `lastSourceIdRef` lock-on-first-fill pattern that bind-dialog and routing-dialog already use; (c) `data-pusher.tsx` `matchSegment` called `decodeURIComponent` unguarded — a preview URL with malformed percent-encoding (e.g. `/blog/%G1`) raised URIError that bubbled up through the 2s push interval and spammed unhandled-error logs. Wrapped in try/catch, returns null (non-match). Four report-only TODO(bug-hunt) comments + a CODE_REVIEW_BACKLOG entry for: sources-tab syncingId/testingId concurrent-row race (need `Set<string>`), item-editor unsaved-edit overwrite on collab refetch, items-table bulk-delete dropping failed ids from selection, fields-tab moveField double-click race. `bun typecheck` exit 0; touched-file lint clean.
Files: `apps/web/client/src/app/project/[id]/_components/cms-workspace/{edit-source-dialog,data-pusher,sources-tab,item-editor,items-table,fields-tab}.tsx`, `CODE_REVIEW_BACKLOG.md`
Links: n/a

## 2026-05-28 — Desktop OAuth handoff: wire renderer + polish (follow-up to 38b95dcf2)
Author: Claude Opus 4.7
Area: `apps/web/client/src/app/sign-in`
Summary: Commit `38b95dcf2` (Sonnet 4.6, parallel session) landed the system-browser + Clerk ticket handoff infrastructure — new `/sign-in/desktop-handoff` and `/sign-in/redeem` pages, `openExternal` IPC, and the `weblab://auth/handoff?ticket=…` deep-link route. It did NOT touch `clerk-auth-form.tsx`, so the renderer's `handleOAuth` was still calling `signIn.authenticateWithRedirect` even in the desktop shell — meaning the new infrastructure had no caller. This change wires the renderer side: detect `window.weblabNative.target === 'desktop'` in `handleOAuth`, and route OAuth clicks through `weblabNative.openExternal('/sign-in/desktop-handoff?provider=…')` instead of triggering an in-window Clerk redirect. Web path (browser) is unchanged.

Also polished `redeem-client.tsx` (use `env` instead of `process.env`, `void` the IIFE for the floating-promise rule, cleaner non-empty selector for the Clerk error message) and a prettier nit in `handoff-client.tsx`.
Files: `apps/web/client/src/app/sign-in/_components/clerk-auth-form.tsx`, `apps/web/client/src/app/sign-in/desktop-handoff/handoff-client.tsx`, `apps/web/client/src/app/sign-in/redeem/redeem-client.tsx`
Links: n/a

## 2026-05-28 — Desktop auth: fix dead launch URL + OAuth stale-session recovery
Author: Claude Opus 4.7
Area: `apps/desktop`, `apps/web/client/src/app/sign-in`
Summary: Three bugs fixed in the desktop sign-in flow.
(1) `DEFAULT_LAUNCH_URL` in `apps/desktop/main.js` still pointed at the legacy `/login?native=1` route deleted in the Supabase → Clerk migration (commit `944b1e7ac`). Middleware only redirects `/` → `/sign-in` for the WeblabDesktop UA, so `/login` 404'd. Switched to `/sign-in?native=1`.
(2) `handleOAuth` in `clerk-auth-form.tsx` had no stale-session recovery (commit `f04415447` only fixed the email/OTP path). When the `persist:weblab` Electron cookie jar carried a leftover Clerk session, `signIn.authenticateWithRedirect` short-circuited and the user saw nothing happen on OAuth button clicks. Mirrored the `startOtpFlow` pattern: catch `isAlreadySignedInError`, `signOut`, retry once.
(3) Improved OAuth error extraction — `ClerkAPIResponseError.message` is often a generic short string while the user-facing text lives at `errors[0].longMessage`. Picks the first non-empty candidate across `longMessage` → `message` → `Error.message` → fallback.
Files: `apps/desktop/main.js`, `apps/web/client/src/app/sign-in/_components/clerk-auth-form.tsx`
Links: n/a

## 2026-05-27 — Documentation refresh for agent context
Author: Claude Opus 4.7
Area: `docs/agent-context`, `docs/agent-memory`
Summary: Rewrote `current-progress.md`, `repo-map.md`, `data-api-architecture.md`, `agent-context/README.md`, and `packages-reference.md` to reflect the Clerk + Convex + Vercel Sandbox reality (prior copies still described Supabase + tRPC + CodeSandbox). Added a one-page `agents-onboarding.md` so fresh sessions can spin up in 5 minutes. Appended catch-up entries here for ships that landed between 2026-05-25 and 2026-05-27 (feature catalog, profile-setup, AI chat optimization scaffolding, properties clipboard, rulers tick step tests).
Files: `docs/agent-context/current-progress.md`, `docs/agent-context/repo-map.md`, `docs/agent-context/data-api-architecture.md`, `docs/agent-context/README.md`, `docs/agent-context/packages-reference.md`, `docs/agent-context/agents-onboarding.md`, `docs/agent-memory/feature-log.md`, `docs/agent-memory/architecture-decisions.md`
Links: n/a

## 2026-05-26 — Feature catalog, test plan, backlog, profile-setup layout
Author: Claude Sonnet 4.6
Area: `docs/`, `apps/web/client/src/app/profile-setup`
Summary: Landed the master `docs/feature-catalog.md` (master inventory with stable `F-XXX` IDs and tags `#editor`, `#ai`, `#public`, `#auth-gated`, `#cms`, `#billing`, `#convex`, `#deprecated`, …) and the matching `docs/test-plan.md` (per-feature `T-XXX` test matrix). Added the reusable `docs/prompts/validate-feature.md` orchestration prompt that chains `anthropic-skills:frontend-testing-debugging`, `anthropic-skills:webapp-testing`, and `superpowers:verification-before-completion` against a feature ID / tag / section / branch diff. `BACKLOG.md` consolidated and re-templated. Profile-setup layout refresh on the auth side.
Files: `docs/feature-catalog.md`, `docs/test-plan.md`, `docs/prompts/validate-feature.md`, `BACKLOG.md`, `apps/web/client/src/app/profile-setup/*`
Links: n/a

## 2026-05-26 — Tests for rulers tick step + properties clipboard
Author: Claude Sonnet 4.6
Area: `apps/web/client/src/components/store/editor`
Summary: Added unit tests for the canvas rulers tick-step calculation (Figma-style layout guides shipped 2026-05-17) and for the new properties clipboard that copies/pastes style props across a selection. Both modules previously had only happy-path coverage.
Files: `apps/web/client/src/components/store/editor/style/properties-clipboard.test.ts`, ruler tick-step tests under the canvas store
Links: commit `89fad709b`

## 2026-05-25 — AI chat optimization scaffolding
Author: Claude Sonnet 4.6
Area: `packages/ai`, `apps/web/client/src/app/api/chat`, `apps/web/client/src/app/project/[id]/_hooks/use-chat`
Summary: Landed the optimization pipeline designed in `docs/notes/2026-05-24-ai-chat-optimization-design.md`. New modules: `packages/ai/src/chat/model-router.ts` (selection rules), `request-builder.ts` (assembles streaming request), `summarizer.ts` + `summarizer-utils.ts` (long-context summarization with cache-aware truncation), `prompt/cache-blocks.ts` (Anthropic cache-block markers), `observability/index.ts` (Langfuse + PostHog event emission). The client `useChat` hook now mounts a `useSummarizer` that triggers Convex `chatActions.summarizeConversation` when token budget reaches threshold. Per-message `applyDiff`, `generateTitle`, `generateSuggestions` endpoints gate on `requireProjectCreateCap` / `requireProjectUpdateCap` to prevent cost amplification.
Files: `packages/ai/src/chat/model-router.ts` (new), `packages/ai/src/chat/request-builder.ts` (new), `packages/ai/src/chat/summarizer.ts` (new), `packages/ai/src/chat/summarizer-utils.ts` (new), `packages/ai/src/prompt/cache-blocks.ts` (new), `packages/ai/src/observability/index.ts` (new), `apps/web/client/src/app/project/[id]/_hooks/use-chat/use-summarizer.ts` (new), `apps/web/client/src/app/project/[id]/_hooks/use-chat/index.tsx`, `apps/web/client/convex/chatActions.ts`
Links: design doc `docs/notes/2026-05-24-ai-chat-optimization-design.md`


Area: `packages/code-provider`, `packages/constants`, `apps/web/client/convex`, `apps/web/client/src/components/store/editor/sandbox`, `apps/web/client/src/app/projects/import`
Summary: Two-phase removal of the dual-mode sandbox abstraction. Phase 1 (`5e8dca441`) flipped `WEBLAB_CLOUD_PROVIDER` default to `vercel_sandbox`, made `CSB_API_KEY` optional, added `scaffoldStaticHtmlProject` + framework-aware dispatch to `VercelSandboxProvider.createProject`, and rewrote `convex.projectActions.createBlank` to always provision on Vercel for `framework ∈ {'nextjs', 'static-html'}`. Phase 2 (`de3dc9269`) routed every active CodeSandbox caller away from the SDK — editor session throws `CODESANDBOX_ARCHIVED_MESSAGE` for legacy CSB-backed projects, import flows hard-fail on non-Vercel provisioning, `branchActions.createBlank` ported to Vercel, and `projectActions.fork` / `branchActions.fork` / `publishHelpers.forkBuildSandbox` throw clear errors pointing at `TODO(sandbox-fork)` / `TODO(publish-vercel)`. CodeSandbox provider files and `@codesandbox/sdk` dep retained as `@deprecated` dead code so legacy DB rows still type-check; full deletion gated on row migration. CLAUDE.md gained a "Sandbox runtime — Vercel only" section; an ADR was appended documenting the decision and follow-ups.
Files: `packages/code-provider/src/providers/vercel-sandbox/index.ts`, `packages/code-provider/src/types.ts`, `packages/code-provider/src/providers/codesandbox/index.ts`, `packages/code-provider/package.json`, `packages/constants/src/csb.ts`, `apps/web/client/src/env.ts`, `apps/web/client/.env.example`, `apps/web/client/convex/projectActions.ts`, `apps/web/client/convex/branchActions.ts`, `apps/web/client/convex/projects.ts`, `apps/web/client/convex/lib/publishHelpers.ts`, `apps/web/client/src/components/store/editor/sandbox/session.ts`, `apps/web/client/src/app/projects/import/local/_context/index.tsx`, `apps/web/client/src/app/projects/import/figma/_context/index.tsx`, `CLAUDE.md`, `docs/agent-memory/architecture-decisions.md`, `docs/notes/2026-05-13-vercel-sandbox-provider.md`
Links: ADR `docs/agent-memory/architecture-decisions.md#2026-05-24-codesandbox-archived`

## 2026-05-24 — Backend migration audit pass 3: validate remaining risks + deep edge sweep
Author: Claude Sonnet 4.6
Area: `apps/web/client/convex`, `apps/web/client/src/app/api`, `apps/web/client/src/utils/auth`
Summary: Third audit pass. Validated all "remaining risks" from pass 2 (4 false alarms / out-of-scope, 4 deferred with TODOs) and ran a deep edge-case sweep that surfaced 13 new bugs (5 CRITICAL, 5 HIGH, 3 MEDIUM). Closed CRITICAL: `upsertCanvasView` IDOR (any signed-in caller could write userCanvases rows tied to foreign canvases), `revertIncrement` farmable free-credits (user could replay rateLimitId for unlimited refunds), `uploadServerSideBlob` unlimited binary uploads, `projectActions.createBlank` workspace-viewer IDOR (could burn paid CSB quota and inject sandbox iframes), `setStripeCustomerId` subscription hijack. Closed HIGH: `tab-complete` missing projectId ownership check, `utils.scrapeUrl` SSRF (no allowlist), `applyDiff`/`generateTitle`/`generateSuggestions` unbounded LLM input cost amplification, `captureScreenshot` viewer-tier Firecrawl spend, `projectInvitations._validateAndInsert` full users-table scan (would break at 16k users). Closed MEDIUM: `_createRedeployment` missing stale TTL (stuck redeploys forever), `deleteUserCascade` missing cursors cleanup, `inline-edit` empty-projectId bypass. Added schema fields (`usageRecords.linkedRateLimitId`, `cursors.by_user` index) + three new internal cap helpers (`_requireProjectCreateCap`, `_requireProjectUpdateCap`) so every action that does paid external calls now gates uniformly BEFORE the side effect. Full audit at `docs/agent-memory/backend-migration-audit.md`.
Files: `apps/web/client/convex/users.ts`, `apps/web/client/convex/usage.ts`, `apps/web/client/convex/storageActions.ts`, `apps/web/client/convex/storage.ts`, `apps/web/client/convex/projects.ts`, `apps/web/client/convex/projectActions.ts`, `apps/web/client/convex/projectInvitations.ts`, `apps/web/client/convex/publishActionsDb.ts`, `apps/web/client/convex/utils.ts`, `apps/web/client/convex/chatActions.ts`, `apps/web/client/convex/internal/cascade.ts`, `apps/web/client/convex/schema.ts`, `apps/web/client/src/app/api/ai/tab-complete/route.ts`, `apps/web/client/src/app/api/ai/inline-edit/route.ts`, `apps/web/client/src/app/api/chat/helpers/usage.ts`, `docs/agent-memory/backend-migration-audit.md`

## 2026-05-24 — Backend migration audit pass 2: IDOR + duplicate-user race + UX
Author: Claude Sonnet 4.6
Area: `apps/web/client/convex`, `apps/web/client/src/app/project/[id]`, `apps/web/client/src/app/_components/hero`, `apps/web/client/src/app/projects`, `apps/web/client/src/utils/auth`
Summary: Second audit pass on the Clerk + Convex final cut. Closed two CRITICAL IDOR bugs (`branchActions.fork` / `createBlank` provisioned paid CSB sandboxes and wrote branches into ANY project for any signed-in caller — no `requireCap`). Closed a HIGH duplicate-user-race regression: prior pass fixed `requireUserJIT` via `.collect()+dedupe` but missed five other `.unique()` readers on `by_clerk_user_id` (`clerkWebhooks.upsertUser`/`deleteUser`, `userActionsInternal._getByClerkId`, `lib/stripeWebhook._resolveCallerUserId`, `users.getByClerkId`, `projectInvitations.resolveCaller`, `domainActionsDb`) — every one of those bricked profile sync, account delete, billing, project invitations, and domain ownership for affected users. Closed a HIGH cross-project integrity bug in `frames.update` (mirrored existing `frames.create` guard). Closed a HIGH UX bug where signed-in user on `/projects/new` was redirected to `/sign-in` (Convex `Doc<'users'>` has `_id`, not `id`; component read `user?.id`). Closed a HIGH FORBIDDEN→"session expired" miscategorization on `/project/<id>` that infinite-looped users without access through the sign-in flow. Added loud `console.error` on `clerk-bridge.ts` when Clerk's `convex` JWT template is misconfigured (prior silent null → redirect loop with no signal). Added shared `getUserByClerkIdSafe` helper in `convex/lib/permissions.ts` and a new `_requireProjectUpdateCap` internal query in `convex/branches.ts`. Full diff and remaining risks documented in `docs/agent-memory/backend-migration-audit.md`.
Files: `apps/web/client/convex/branchActions.ts`, `apps/web/client/convex/branches.ts`, `apps/web/client/convex/clerkWebhooks.ts`, `apps/web/client/convex/userActionsInternal.ts`, `apps/web/client/convex/lib/stripeWebhook.ts`, `apps/web/client/convex/lib/permissions.ts`, `apps/web/client/convex/users.ts`, `apps/web/client/convex/projectInvitations.ts`, `apps/web/client/convex/domainActionsDb.ts`, `apps/web/client/convex/frames.ts`, `apps/web/client/src/utils/auth/clerk-bridge.ts`, `apps/web/client/src/app/project/[id]/page.tsx`, `apps/web/client/src/app/project/[id]/_components/project-load-error.tsx`, `apps/web/client/src/app/project/[id]/_components/offline-editor-bootstrap.tsx`, `apps/web/client/src/app/_components/hero/create.tsx`, `apps/web/client/src/app/_components/hero/index.tsx`, `apps/web/client/src/app/_components/hero-v2.tsx`, `apps/web/client/src/app/projects/new/page.tsx`, `apps/web/client/src/app/projects/_components/select/index.tsx`, `apps/web/client/src/app/projects/_components/templates/template-modal.tsx`, `docs/agent-memory/backend-migration-audit.md`

## 2026-05-24 — Backend migration audit: Clerk + Convex hardening
Author: Claude Opus 4.7
Area: `apps/web/client/convex`, `apps/web/client/src/utils/auth`, `apps/web/client/src/utils/supabase`, `apps/web/client/src/env.ts`, `.env.example`
Summary: Audited the final Supabase → Clerk + Convex push. Closed two real bugs (unauthenticated `convex/skillActions.previewImport`; `requireUserJIT` could race with the Clerk webhook and brick reads via `.unique()`), removed a type-only `@supabase/supabase-js` leak by introducing a local `BridgedUser` interface, added warn-once telemetry on the Supabase-storage stub, and made all `SUPABASE_*` env vars optional. Updated `.env.example` to surface Clerk + Convex as the canonical setup and demote Supabase to a rollback footer. Full audit report at `docs/agent-memory/backend-migration-audit.md`.
Files: `apps/web/client/convex/skillActions.ts`, `apps/web/client/convex/lib/permissions.ts`, `apps/web/client/src/utils/auth/types.ts` (new), `apps/web/client/src/utils/auth/clerk-bridge.ts`, `apps/web/client/src/utils/auth/current-user.ts`, `apps/web/client/src/utils/supabase/client/index.ts`, `apps/web/client/src/env.ts`, `apps/web/client/.env.example`, `docs/agent-memory/backend-migration-audit.md` (new)

## 2026-05-24 — Landing-page asset restyle + light bg token shift
Author: Claude Opus 4.7
Area: `apps/web/client` landing page, `packages/ui` light theme
Summary: Restyled the three feature-trio assets (model picker, terminal, AI assistant) and side-by-side feature visuals to match new design language (light cream surfaces w/ subtle shadow + soft top gradient backdrop; dark mode mirror). Each asset now adapts to theme via `dark:` variants instead of being dark-only. Backed up originals as `*-v1.tsx`.
- Light theme `--background` token: `#ffffff` → `#f7f7f4` (warm off-white).
- `FeatureBackdrop`: gradient cream wash on light, kept blurred image + dark veil on dark.
- Inline visuals (Components, Tokens/Brand, History/Revision, Structure/Layers) swapped `bg-background-secondary/80 backdrop-blur-sm` → explicit `bg-white dark:bg-[#1C1C1D]` w/ soft shadow.
- Trio assets: rewritten to mirror Figma — Mac-style window chrome, dropdown anchored under composer, AI-chat layout with thought/tool-call sequence.
Files: `apps/web/client/src/app/_components/landing-page/feature-trio-section.tsx`, `…/feature-backdrop.tsx`, `…/what-can-weblab-do-section-v2.tsx`, `packages/ui/src/globals.css`

## 2026-05-23 — Component system pass: button rewrite, switch/slider/menu/tabs polish
Author: Claude Sonnet 4.6
Area: `packages/ui` components, `apps/web/client/src/components/ui`, `style-tab-v4`, design-system demos
Summary: Comprehensive component-level alignment pass on top of the dark-token rewrite.
- **Button**: dropped pill shape (`rounded-full`), now `rounded-sm` (8px), `h-7` default + sm, 10px horizontal padding, `text-mini` (12px). New variants: `destructive` (bg `#321F20` + text `#FF595D`, no border), `muted` (bg `#242424` + text `#DEDEDE`), `ghost` (text `#717171` resting). Outline uses `--border-secondary` so the line is visible. Same treatment applied to local `apps/web/client/src/components/ui/button.tsx` (still used by 13 pricing/marketing call sites).
- **Switch**: `bg-foreground-brand` (#458ef7) when checked, `bg-background-tertiary` unchecked. Removed hardcoded green `rgb(52,199,89)`.
- **Slider**: shrunk track to 1px, brand-tinted range fill, thumb gets a proper drop shadow + hover scale + brand-tinted focus ring (no longer flat/harsh).
- **Dropdown/Popover/Menubar/ContextMenu/HoverCard/Select**: all swapped `border-foreground/8` (invisible) → `border-border-popover` (#2d2d2d). Items unified at `rounded-sm px-2.5 py-1.5 text-mini`. Added `duration-200 ease-out` (open) / `duration-150 ease-in` (close) for smoother enter/leave.
- **NavigationMenu**: trigger now `h-7 px-2.5 text-mini` to match dropdown/menubar item density (was `h-9 px-4 text-sm` — too tall + too wide).
- **Tabs**: added sliding active-rect indicator via `motion.span layoutId` (per-Tabs-instance scope), so the active background morphs between triggers instead of instant swap. Uses spring 380/32 for smooth glide.
- **Reasoning effort demo** (chat.tsx): pill row was full-width grid with oversized buttons; now `inline-flex w-fit` + `h-6 px-2 rounded-xs`.
- **Editor canvas tokens** (dark): `--background-canvas/chrome/bar/tab-strip/tab-active` pulled into new ladder (canvas=card #1d1d1d, chrome+bar=app #181818, tab-strip=secondary #222, tab-active=accent #2e2e2e).
- **style-tab-v4 controls** (13 files): dropped 27 hardcoded `dark:bg-[#262626]`/`dark:hover:bg-[#2F2F2F]`/`dark:bg-[#3A3A3A]` overrides; semantic tokens (`bg-background-secondary` / `hover:bg-background-tertiary` / `bg-background-active`) now drive both modes.
- **v3 chip controls left alone** per owner instruction (v4 is now the default — `NEXT_PUBLIC_STYLE_PANEL_V4` env default flipped to `true`).
- **Purple-skill swap** (4 files): branch-management, layer tree, draft-context-pill, verify-project switched from `purple-*` palette → `text-foreground-skill`.
- **Status palette swap** (8 files): `red-*` → `destructive`, `amber-*` → `foreground-warning`, `emerald-*` → `foreground-success` across hero/auth/project-row/context-menu/delete/mic-button.
- **components/ui audit**: `select.tsx`, `table.tsx`, `label.tsx` confirmed dead (0 imports) — flagged for delete (rm blocked by sandbox; owner can `rm` manually). `button.tsx`, `card.tsx`, `avatar.tsx`, `alert.tsx`, `badge.tsx` tokenized to use semantic tokens instead of raw slate/red.
- **Radius audit**: `rounded-[4px]` → `rounded-xs`, `rounded-[8px]` → `rounded-sm` across 21 files. `rounded-[10px]` kept (v4 spec). `rounded-[6px]` / large arbitrary values left for design call.
- **Light-mode contrast analysis** (no fixes — analysis only per instruction): hierarchy collapsed (secondary ~`#6c6c6c` and tertiary ~`#7d7d7d` only 13 luminance apart vs dark's 78→32→53 hierarchy); border invisible (matches `--background-tertiary`); card/popover/modal all `#fafafa` — no elevation; status colors still blue-aliased (dark un-aliased); sidebar collapsed with card; ring still gray. Light needs its own full pass.
Files: `packages/ui/src/components/{button,switch,slider,tabs,dropdown-menu,popover,menubar,context-menu,hover-card,select,navigation-menu}.tsx`, `apps/web/client/src/components/ui/{button,card,avatar,alert,badge}.tsx`, `apps/web/client/src/env.ts`, 13 style-tab-v4 control files, ~21 radius-normalized files, `apps/web/client/src/app/design-system/_components/demos/chat.tsx`
Links: prior dark token entry below

---

## 2026-05-23 — Dark theme rewrite to Codex-aligned palette + new semantic tokens
Author: Claude Sonnet 4.6
Area: `packages/ui` design tokens, `apps/web/client/src/styles` and `design-system` page
Summary: Rewrote `.dark` block in `packages/ui/src/globals.css` to use Codex-exact dark palette (bg `#181818`, card `#1d1d1d`, modal `#212121`, popover `#222222`, sidebar `#161616`, accent `#458ef7`, ring `#458ef7`). Added 25+ new semantic tokens: `--modal`, `--background-modal/popover/tooltip-hover`, `--background-sidebar/sidebar-active/chat-input/selected/diff-added/diff-removed`, `--foreground-placeholder/tooltip/diff-added/diff-removed/skill/code-orange/code-purple`, `--border-card/input/search/secondary/popover`. Un-aliased status colors so success=`#6fc57e` real green, warning=`#ec8c55` real orange, destructive=`#e35446` real red (previously all blue-aliased). Switched headings to `font-weight: 500` with tighter tracking. Switched font cascade to system-first (`-apple-system, BlinkMacSystemFont, 'SF Pro Text', var(--font-inter), 'Segoe UI', system-ui`) so Mac users get SF Pro automatically; Inter remains cross-platform fallback. Fixed `ColorSwatch` to read live computed CSS values via `getComputedStyle` + `MutationObserver` instead of stale static HSL strings from `data.ts` (root cause of "all colors look the same" bug in `/design-system`). Light-mode stubs added for the new tokens; full light pass deferred.
Files: `packages/ui/src/globals.css`, `apps/web/client/src/styles/globals.css`, `apps/web/client/src/app/design-system/_components/demos/color-swatch.tsx`, `apps/web/client/src/app/design-system/_components/demos/data.ts`
Links: n/a (internal design system pass)

---

## 2026-05-22 — Core flow QA fixes for login, editor boot, and sandbox preview
Author: Codex (agent)
Area: `apps/web/client` auth/editor flows, `packages/code-provider` Vercel Sandbox
Summary: Real-browser QA covered dev login, signed-out project routing, blank project creation, editor boot, and preview iframes. Fixed the dev magic-link login path so it establishes a Supabase session directly, redirected signed-out `/projects` before protected tRPC calls, moved Node-only crash handlers out of Edge instrumentation, stopped MobX from wrapping the history debounced persister, made presence channel setup idempotent before subscribe, ensured blank projects include Weblab interaction runtime files, and prevented duplicate Next dev servers in Vercel Sandbox previews.
Files: `apps/web/client/src/app/login/actions.tsx`, `apps/web/client/src/app/auth/auth-context.tsx`, `apps/web/client/src/app/projects/page.tsx`, `apps/web/client/src/instrumentation.ts`, `apps/web/client/src/instrumentation-crash-handlers.server.ts`, `apps/web/client/src/components/store/editor/{history,interactions,presence}/index.ts`, `packages/code-provider/src/providers/vercel-sandbox/index.ts`
Links: n/a (internal QA)

---

## 2026-05-20 — Harden Railway client service against silent crashes
Author: Claude Sonnet 4.7
Area: `apps/web/client` (deploy/instrumentation), Railway service config
Summary: Production apex `weblab.build` started returning Cloudflare 502s after the Railway container died silently (no logs, no stack trace) and Railway exhausted its 10-retry restart budget. Added stdout crash handlers (`unhandledRejection`/`uncaughtException`/`SIGTERM`) in `instrumentation.ts` so the next silent crash leaves a fingerprint, bumped `restartPolicyMaxRetries` 10 → 50 across all three Railway services, and set `NODE_OPTIONS=--max-old-space-size=2048` on the client service so heap exhaustion throws a catchable JS exception instead of a kernel SIGKILL.
Files: `apps/web/client/src/instrumentation.ts`, `railway.toml`, `docs/railway.toml`, `apps/docs/railway.toml`
Links: `docs/agent-memory/architecture-decisions.md` (2026-05-20 entry)

---

## 2026-05-17 — Interactions system, multi-provider hosting, brand tokens, page settings
Author: Claude Sonnet 4.6
Area: `packages/models/interactions`, `packages/parser`, `apps/web/preload/ix-runtime`, editor interactions store, hosting provider adapters, brand-tab, page-settings-drawer
Summary: Eight feature + bugfix commits shipped in one session after a comprehensive bug-hunt review.
New: animation interactions system (InteractionsManager, ix-runtime preload bundle, timeline editor UI); multi-provider hosting with Vercel/Netlify/Cloudflare/Railway/Render adapters and redesigned publish dropdown; brand token editor with groups/variable tokens/text styles; page settings drawer with schema markup parser injection.
Bug fixes: duplicatePage same-path overwrite, session.task null crash, resumeSyncInit double-call, EditorState.clear() missing tab resets, refetch() void→Promise, promisifyMethod error swallowed, deployment relation name collision, project role NaN sort, URL() constructor crash in site settings, dead code in domain verify helpers.
Files: 8 commits, ~260 files changed, 12,800+ insertions
Links: commits f1fb6953a..bfa1f928e

---

## 2026-05-14 — Assets panel (Webflow-style rework of the Images tab)
Author: Claude Opus 4.7
Area: `apps/web/client` — editor left panel; `@weblab/utility`, `@weblab/constants`
Summary: Renamed the editor's "Images" tab to "Assets" and reworked it end to end.
It now accepts any file type (PDFs, fonts, docs), classifies files via a new
`getAssetType` helper, and shows type-aware cards. Breadcrumb drilldown was
replaced with a Webflow-style browser: a persistent type-filter + folder-tree
sidebar when the panel is wide (`@container` query, ≥380px) and a dropdown when
narrow. Added a designed drop zone, right-click context menus + a shared
`AssetActions` set, copy-URL, folder creation, move-to-folder (reuses the JSX
image-reference updater), in-place raster compression with an undo toast,
sorting, and multi-select with bulk move/compress/delete.
Files:
  `apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/asset-tab/*` (renamed from `image-tab/`, ~16 files),
  `apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/index.tsx`,
  `packages/utility/src/file.ts` (`getAssetType`),
  `packages/constants/src/files.ts` (font/document extension groups),
  `apps/web/client/messages/*.json` (tab label)
Links: changelog `v1-9-assets-panel`
Note: 3 obsolete files (`breadcrumb-navigation.tsx`, `folder-list.tsx`,
`hooks/use-navigation.tsx`) are unreferenced and pending manual deletion — `rm`
was blocked in the agent environment.

---

## 2026-05-14 — Persistent cross-session undo/redo history
Author: Claude Sonnet 4.6
Area: `apps/web/client` — editor history, action manager, branch manager
Summary: Editor undo/redo stacks now persist to IndexedDB (localforage) keyed by
branch id. History survives page reload and cross-session. On editor boot,
`BranchManager.init()` hydrates each branch's `HistoryManager` from storage after
codeEditor + sandbox are ready. Actions are capped at 100 undo / 50 redo entries
on disk. Fixed async race: `undo()` and `redo()` now properly `await commitTransaction()`
before mutating stacks. Header undo/redo buttons now visible at md+ breakpoint
(was lg+).
Files:
  `apps/web/client/src/components/store/editor/history/storage.ts` (new),
  `apps/web/client/src/components/store/editor/history/index.ts`,
  `apps/web/client/src/components/store/editor/action/index.ts`,
  `apps/web/client/src/components/store/editor/branch/manager.ts`,
  `apps/web/client/src/utils/constants/index.ts`,
  `apps/web/client/src/app/project/[id]/_components/top-bar/index.tsx`

---

## 2026-05-13 — Staged Vercel Sandbox runtime provider
Author: Codex
Area: `@weblab/code-provider`, project sandbox runtime
Summary: Added Vercel Sandbox as a second cloud runtime behind
`WEBLAB_CLOUD_PROVIDER`, with branch-level provider metadata and CodeSandbox as
the default rollback path. Vercel editor calls use server-side tRPC proxies,
new Vercel sandboxes snapshot after setup, and unsupported v1 flows keep using
CodeSandbox instead of silently changing framework behavior.
Files: `packages/code-provider/src/providers/vercel-sandbox/index.ts`,
`apps/web/client/src/server/api/routers/project/sandbox.ts`,
`apps/web/client/src/components/store/editor/sandbox/vercel-browser-provider.ts`,
`docs/notes/2026-05-13-vercel-sandbox-provider.md`
Links: `docs/notes/2026-05-13-vercel-sandbox-provider.md`

## 2026-05-13 — Style Panel v3 — UX polish round 3 (5-agent team)
Author: Claude (impeccable + ux-polish + ui-ux-pro-max) + 5 subagents
Area: apps/web/client/src/app/project/[id]/_components/right-panel
Summary: Third polish round from user UX review. Focus rings now
keyboard-only (`FIELD_BASE_CLASSES` switched `focus-within:` →
`has-[:focus-visible]:`; forked select-field/text-field/icon-toggle-field
into v3). Segmented controls got a clear two-tier active state — STRONG
raised pill when the value is an explicit override, QUIET neutral fill
when it's the inherited/computed default; `isSet?` prop threaded from
sections through SegmentedDisplay / IconToggleField / GrowRow /
OverflowRow. Panel horizontal overflow fixed — v3 root `<div>` was a
flex item without `min-w-0`; added `w-full min-w-0 overflow-x-hidden`
through the root→header→ScrollArea chain. TrblGrid per-side mode
redesigned to 4 discrete bordered inputs (was one merged pill) that
shrink to fit at min panel width. Styles tab active-state bug fixed —
`TooltipTrigger` was clobbering Tabs' `data-state`; tab now only
tooltip-wrapped in CODE mode. Alt-click on a property label now resets
the value AND clears the per-element override flag. `useStyleValue`
forked into v3 with robust `isSet` detection — root cause was a
camelCase (`computed`) vs kebab-case (`defined`) key mismatch + missing
shorthand resolution, so the override dot only lit for some props. New
`useStyleBatchSetter` (`setMultiple`) routes multi-property writes
(padding/margin/grow) through `StyleManager.updateMultiple` as ONE undo
entry — fixes panel-side history fragmentation. Persistent cross-session
history flagged as a separate core-engine effort (not done).
Files: style-tab-v3/controls/{constants,select-field,text-field,
icon-toggle-field,segmented-display,number-field,chip-input,shadow-field,
grow-overflow-row,trbl-grid,property-control,property-label,index}.ts(x),
style-tab-v3/hooks/{use-style-value,use-style-setter}.ts,
style-tab-v3/sections/{layout,size,text,styles}.tsx, style-tab-v3/index.tsx,
right-panel/index.tsx

## 2026-05-13 — Style Panel v3 — UX polish round 2 (4-agent team)
Author: Claude (impeccable + ux-polish + ui-ux-pro-max) + 4 subagents
Area: apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v3
Summary: Second polish round from user UX review. `TrblGrid` redesigned to
the Figma padding control — 2-button mode switcher (Square = all-sides /
SquareDashed = per-side) + a single connected 4-cell pill with T/R/B/L
labels. `SegmentedDisplay` collapses to icon-only via `@container`
queries when the panel is narrow. `display: none` added to the Display
control; Display icons relogicked (Flex → StretchHorizontal, Grid →
LayoutGrid, Block → Square, None → EyeOff). `GrowOverflowRow` split into
separate `GrowRow` + `OverflowRow` — fixes the overflow/alignment bug;
each renders as its own labeled Size row. New `PropertySearch` at the
panel top — fuzzy search over a ~65-entry property registry, scrolls to
+ opens the target section via `[data-style-property]`. Margin moved out
of Advanced into Layout (directly below Padding). Transitions extracted
from Advanced into its own section, placed after Effects. New Content row
in Text — real text-content write via `frameView.editText` + history push.
Verified all required selectors present + inherited/computed values show
as the active selection across value-bearing controls.
Files: style-tab-v3/controls/{trbl-grid,segmented-display,grow-overflow-row,
property-search,index}.ts(x), style-tab-v3/sections/{layout,size,text,
advanced,transitions}.tsx, style-tab-v3/index.tsx

## 2026-05-13 — Style Panel v3 — UX polish pass (4-agent team)
Author: Claude (impeccable + ux-polish + ui-ux-pro-max) + 4 subagents
Area: apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v3
Summary: Polish round on v3 driven by user UX review. Forked `PropertyLabel`,
`PropertyControl`, `constants.ts` into v3 (no longer re-exports of v2):
blue "is set" dot now renders ONLY when set — no gray dot when unset; unset
labels lifted to ~85% visibility; dark-mode field contrast raised (lighter
fill + visible hairline border). `CustomExpander` tinted-card background
removed — expanded rows sit flush in the column. Section header dot only
renders when populated. New `NumberField` replaces the shared
`@weblab/ui/number-input` across all v3 sections — drops the scrub-drag
`cursor-ew-resize` affordance the user disliked; static `cursor-pointer`
unit pill instead. New `ShadowField` — Figma-style `box-shadow` editor
(color swatch + hex + opacity, X/Y/Blur/Spread rows with −/+ steppers),
wired into Effects. Row alignment audited across all sections; `cursor-pointer`
added to clickable affordances; section-level dark-bg overrides removed so
the raised-contrast field tokens win.
Files: style-tab-v3/controls/{constants,property-label,property-control,
custom-expander,number-field,shadow-field,index}.ts(x),
style-tab-v3/sections/*.tsx, style-tab-v3/controls/{trbl-grid,grow-overflow-row}.tsx

## 2026-05-13 — Style Panel v3 (Figma-driven redesign, env-flagged)
Author: Claude (figma-use + impeccable + ux-polish)
Area: apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v3
Summary: Built a successor to `style-tab-v2` matching the Figma design at
`figma.com/design/Jq0i0XECT9DPqfUdIEl5MY?node-id=202-8418`. New section
order (Element → Position → Layout → Size → Styles → Text → Effects →
Overlays → Cursor → Transforms → Advanced) with a hybrid named-style + Custom
expander model on Text and Effects. v2 stays as the default; v3 ships
behind `NEXT_PUBLIC_STYLE_PANEL_V3` (defaults `false`) — module-scope
dynamic import in `right-panel/index.tsx` swaps which panel renders.
Reuses v2's `StyleManager` pipeline, `useStyleValue` / `useStyleSetter`
hooks, and every shared control via a controls/ barrel re-export, so
undo/redo + AST sync + write-target prefs work unchanged. Seven new
primitives in `style-tab-v3/controls/`: ChipInput, StyleChipPicker,
TrblGrid, SegmentedDisplay, AlignmentToolbar, GrowOverflowRow,
CustomExpander. Mounted in the design-system page under a new
"Style panel v3" group. v2 source frozen at
`docs/archive/style-tab-v2-snapshot/`; full property catalog at
`docs/agent-context/style-panel-v2-inventory.md`.
Files: apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v3/**,
apps/web/client/src/app/project/[id]/_components/right-panel/index.tsx,
apps/web/client/src/env.ts,
apps/web/client/src/app/design-system/page.tsx,
apps/web/client/src/app/design-system/_components/demos/style-panel-v3.tsx,
docs/agent-context/style-panel-v2-inventory.md,
docs/archive/style-tab-v2-snapshot/**
Links: docs/agent-context/style-panel-v2-inventory.md

## 2026-05-11 — Performance + production-readiness audit
Author: Claude (performance audit)
Area: apps/web/client (landing + editor + tRPC + providers)
Summary: Closed real-prod issues across landing and editor: gated
anonymous-reachable `user.get` / `user.settings.get` / `provider.connectionsList`
calls behind a Supabase auth-cookie heuristic; extracted `parseRepoUrl`
so the `@weblab/parser` bundle no longer leaks into the landing chunk;
added `loading.tsx` + `error.tsx` for `/project/[id]` and a root
`error.tsx`; lazy-loaded editor modals (settings, subscription,
keyboard shortcuts, command/file palettes, project search, CMS dialogs);
disabled React Query `refetchOnWindowFocus`; closed a cross-project
access gap on `userCanvas.get` / `getWithFrames` / `update`; capped
unbounded `comment.list` and `chat.conversation.getAll`. Surfaced the
silent-failure path on `userCanvas.update` instead of swallowing errors.
Files: see `docs/agent-memory/performance-audit.md` for the full list.
Links: docs/agent-memory/performance-audit.md

## 2026-05-11 — Weblab App Figma component library (extracted from code)
Author: Claude (figma-use)
Area: design-system / Figma
Summary: Built a Figma file mirroring the live app component surface from
`packages/ui` and `apps/web/client/src/**`. Foundations are token-bound
(Color collection with Light + Dark modes, Radius, Spacing collections,
text styles, effect styles). All component sets use Figma variants with
`Variant=` / `Size=` / `State=` properties and reference variables —
swap modes at any frame to flip light/dark. Token values pulled from
`packages/ui/src/globals.css`; Tailwind config + button CVA were the
ground truth for type ramps and button heights/radii.
Categories created:
  Foundations · Core UI · Navigation · Feedback + Overlays · Dashboard
  · Editor · AI Chat · Settings + Auth · QA Notes
Counts: 1 file · 10 pages · 3 variable collections (66 color + 8 radius
+ 14 spacing) · 14 text styles · 5 effect styles · ~200 component
variants across 35 component sets, plus 6 example compositions.
Key token decisions:
  - Status semantic tokens (`background-success/warning`,
    `foreground-success/warning`) are kept aliased to blue to match
    today's `globals.css`. Flagged in QA notes as a decision point.
  - Editor canvas surfaces (`bg/canvas`, `bg/chrome`, `bg/bar`,
    `bg/bar-active`, `bg/tab-strip`, `bg/tab-active`) modeled
    explicitly so Editor mockups can use them directly.
  - Radius scale uses xs/sm/md/lg/xl/2xl/3xl/full anchored to
    `--radius = 1rem`.
Missing / deferred (full list on the QA Notes page in Figma):
  - Calendar, color-picker, motion-card, shimmer skeleton animations
  - Streamdown markdown formatting inside AI messages
  - Real icons (placeholders used — swap when wiring Code Connect)
  - Real green/amber palette (currently aliased to blue)
Recommended follow-ups (also captured in QA Notes):
  1. Rename `foreground-quadranary` → `foreground-quaternary`.
  2. Resolve green/amber aliasing in `globals.css`.
  3. Unify the two `alert.tsx` files (`packages/ui` vs `apps/web/client`).
  4. Reconcile `editor-bar/toolbar-button.tsx` with `Button` `toolbar` size.
  5. Migrate landing-page inline color overrides to tokens.
Files: Figma file `Weblab App — Component Library`
  (key `FrhrPDEJ2BAJS6q6oEVRdJ`,
   https://www.figma.com/design/FrhrPDEJ2BAJS6q6oEVRdJ)
Links: source tokens — `apps/web/client/src/styles/globals.css`,
  `packages/ui/src/globals.css`, `packages/ui/tailwind.config.ts`,
  `packages/ui/src/components/button.tsx`

---

## 2026-05-09 — Editor selection state persistence (frame, breakpoint, element)

Author: Claude (agent)
Area: `apps/web/client` — project editor (`src/app/project/[id]/_hooks`, `src/services/editor`)

Summary: Reloading the editor previously dropped the user's selection state (which frame was active, which breakpoint, which element was selected). Now persisted per-project to `localStorage` and restored on `isProjectReady`. Frame restored via `frames.select`; breakpoint applied after so explicit switches win; element restore polls `view.getElementByOid(oid, false)` until the iframe view is ready or a 5s deadline elapses, then gives up silently. Re-persistence runs through MobX `reaction`s with a single debounced flush — concurrent updates merge into one `pendingPatch` to avoid the lost-write race that an ad-hoc `setTimeout` per reaction would create. Restore is keyed by `projectId` (not a boolean ref), so navigating project → project re-arms cleanly. In-flight async element lookups check a `cancelled` flag before mutating editor state to prevent post-unmount `click` calls.

Files:
- `apps/web/client/src/services/editor/state-persistence.ts` (existed; unchanged contract)
- `apps/web/client/src/services/editor/state-persistence.test.ts` (new — 13 tests, `bun:test`)
- `apps/web/client/src/app/project/[id]/_hooks/use-editor-state-persistence.tsx` (new)
- `apps/web/client/src/app/project/[id]/_components/main.tsx` (wired hook)
- `apps/web/client/src/lib/changelog-entries.ts` (v1.6 entry)
- `apps/web/client/src/server/api/routers/user/user.ts` (cleaned typecheck/lint blockers in dirty tree: `avatarUrl` `string | null` coercion, dropped wrong `await` on void `trackEvent`, narrowed `user_metadata` cast to drop `any` chain)

Validation: `bun typecheck` green, `bun x eslint --max-warnings 0` clean for touched files, `bun test src/services/editor/state-persistence.test.ts` 13/13 pass.

Caveat: clicking the restored element triggers BreakpointsManager's auto-flip to that frame's breakpoint, overriding any explicitly-saved breakpoint when both apply. Treated as acceptable — the element is the more specific signal.

Links:
- Changelog: v1.6 in `changelog-entries.ts`

---

## 2026-05-09 — Product explainer video: planning + HyperFrames implementation

Author: Claude (agent)
Area: `apps/web/product-video/` (new), `docs/`

Summary: Planned and implemented the homepage product explainer. Plan doc covers positioning, format, five storyboards, asset plan, and HyperFrames implementation strategy (`docs/product/product-video-plan.md`). Built the chosen storyboard A — "From prompt to polished site" — as a deterministic HyperFrames composition: 75s, 1920×1080, 10 scene sub-comps + captions overlay, brand-faithful product UI recreations using real Weblab tokens (`#131314` bg, `#3d8bfd` accent, Inter, 16px radius). Renders byte-deterministically to a 2.6 MB MP4 via `npx hyperframes render`. Voiceover not generated (no ElevenLabs key in env) — script in `voiceover-script.md`, captions ship without audio. Lint passes 0-error; 210 cosmetic selector warnings + 250 small-label contrast warnings documented as known limitations. Real screen recordings deferred — substituted with stylized HTML/CSS recreations per plan §6.

Files:
- `docs/product/product-video-plan.md`
- `docs/product/product-video-implementation-notes.md`
- `apps/web/product-video/index.html`
- `apps/web/product-video/design.md`
- `apps/web/product-video/voiceover-script.md`
- `apps/web/product-video/compositions/scene-{01..10}-*.html`
- `apps/web/product-video/compositions/captions.html`
- `apps/web/product-video/assets/brand/{logo,symbol,wordmark}.svg`
- `apps/web/product-video/out/weblab-explainer-v1.mp4`

Links: render path `apps/web/product-video/out/weblab-explainer-v1.mp4`

---

## 2026-05-09 — Production QA audit: security hardening + UX fixes

Author: Claude (agent)
Area: `apps/web/client` (chat API, chat input, canvas, invitation router), `packages/ai`, `packages/penpal`

Summary: Multi-batch production QA audit. Fixed invitation router missing authorization on list/delete, token leakage on get (stripped for non-invitees), role escalation guard on invite. Added SSRF guard on CMS adapter URLs via DNS resolution + IP blocklist. Fixed abort signal not being forwarded to `streamText` (wasted GPU tokens on cancelled requests). Fixed stop button hidden when input has content. Fixed canvas wheel handler not bypassing contenteditable elements. Fixed Penpal `PromisifiedPendpalChildMethods` type double-wrapping via `Awaited<ReturnType<...>>`. Fixed `setCmsSelectedCollectionId` compare-before-assign logic bug.

Files:
- `apps/web/client/src/server/api/routers/project/invitation.ts`
- `apps/web/client/src/server/api/routers/cms/adapters/index.ts`
- `apps/web/client/src/app/api/chat/route.ts`
- `apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-input/index.tsx`
- `apps/web/client/src/app/project/[id]/_components/canvas/index.tsx`
- `apps/web/client/src/components/store/editor/state/index.ts`
- `packages/ai/src/agents/root.ts`
- `packages/penpal/src/child.ts`

---

## 2026-05-09 — Semantic status tokens (success / warning) + chrome de-hardcoding

Author: Claude (agent)
Area: `packages/ui` design tokens, project editor chrome (left/right panel,
canvas overlay), callback pages, project list cards, marketing landing
mockups.

Summary: Added eight CSS variables — `--foreground-success`,
`--background-success`, `--background-success-secondary`, `--border-success`
plus the `*-warning` quartet — to `packages/ui/src/globals.css` (light + dark)
and exposed Tailwind utilities (`text-foreground-success`,
`bg-background-success[/-secondary]`, `border-success`, etc.) in
`packages/ui/tailwind.config.ts`. Default values alias to the blue palette
because `packages/ui/tokens.ts` already maps green/yellow/teal/amber → blue;
this preserves today's render while giving us a single switch to flip the
entire app's status colors. Then refactored ~30 chrome surfaces from raw
Tailwind palette utilities (`text-green-500`, `bg-amber-500/10`,
`border-yellow-300`, `bg-blue-400`, `outline-teal-400`) and inline hex
literals (`#22c55e`, `#3b82f6`, `#109BFF`, `#181412`, `#1c1c1c`, `#282828`)
to tokens. Documented the new semantic group in the design-system page
(visual + usage block) and inline in `globals.css` with a header comment
covering when to use which token. To switch from blue-aliased to real
green/amber, edit only the eight lines per mode in `globals.css` — no
component code needs to change.

Files: `packages/ui/src/globals.css`, `packages/ui/tailwind.config.ts`,
`apps/web/client/src/app/design-system/page.tsx`, plus chrome refactors
across `apps/web/client/src/app/project/[id]/_components/**`,
`apps/web/client/src/app/projects/_components/select/**`,
`apps/web/client/src/app/callback/{figma,github}/**`,
`apps/web/client/src/app/_components/landing-page/**`,
`apps/web/client/src/components/ui/ai-chat-input-styles.ts`,
`packages/ui/src/components/ai-elements/{tool,web-preview}.tsx`.

---

## 2026-05-24 — Desktop auth window and sign-in drag fix

Author: Codex (agent)
Area: desktop shell, sign-in
Summary: Desktop OAuth provider redirects now open in a small Weblab-owned auth
BrowserWindow that shares the app's `persist:weblab` session, then closes when a
Weblab callback URL is reached and finishes sign-in in the main window. The
desktop sign-in screen also restores a usable top drag strip without blocking
the normal web sign-in page. Follow-up: email OTP sign-in now clears a stale
Clerk client session once and retries, fixing the false "You're already signed
in" error when the page renders signed-out but Clerk still has a leftover
session.
Files: `apps/desktop/main.js`, `apps/desktop/preload.js`,
`apps/web/client/src/app/layout.tsx`,
`apps/web/client/src/app/sign-in/[[...rest]]/sign-in-client.tsx`,
`apps/web/client/src/app/sign-in/_components/clerk-auth-form.tsx`,
`apps/desktop/RELEASES.md`.

---

## 2026-05-24 — Production security release-blocker remediation

Author: Codex (agent)
Area: dependencies, AI API routes, CSP, production build
Summary: Upgraded the hosted web stack to Next.js 16.2.6 / React 19.2.6,
removed an unused vulnerable AI dependency, added root dependency overrides for
patched transitive audit findings, added byte/count payload caps to chat,
inline-edit, and tab-complete, replaced internal AI route errors with stable
public responses, removed `unsafe-eval` from production CSP, and fixed the
Next.js 16.2 production build regression caused by browser-visible `@weblab/git`
type imports.
Validation: `bun audit --audit-level=moderate`, `bun typecheck`, and
`bun --filter @weblab/web-client build` pass. `bun --filter @weblab/web-client
lint` exits successfully with existing warnings. Repository-wide `bun lint`
still fails on unrelated package lint debt/project-service config.
Files: `package.json`, `bun.lock`, `apps/web/client/package.json`,
`apps/docs/package.json`, `packages/email/package.json`,
`packages/ai/package.json`, `apps/web/client/next.config.ts`,
`apps/web/client/src/app/api/chat/**`,
`apps/web/client/src/app/api/ai/**`,
`apps/web/client/src/components/store/editor/git/git.ts`,
`apps/web/client/src/components/ui/settings-modal/versions/version-row.tsx`,
`docs/security/production-readiness-security-review-2026-05-24.md`.

---

## 2026-05-14 — Faster project creation, editor open, and imports

Author: Codex (agent)
Area: project creation/open/import flows
Summary: Blank project creation now uses a single server-side `project.createBlank`
mutation that forks the template, creates all project rows, and cleans up the
orphan sandbox if DB creation fails. `/project/[id]` now uses a consolidated
`project.getEditorBootstrap` payload for project, branches, canvas/frames,
conversations, and pending create requests; existing projects render the editor
chrome immediately while sandbox/canvas/chat finish inside the canvas. Local,
GitHub, and Figma import finalizing states now show explicit phases, and local
/ Figma file uploads use bounded parallel writes instead of fully serial writes.
Files: `apps/web/client/src/server/api/routers/project/project.ts`,
`apps/web/client/src/hooks/use-create-blank-project.ts`,
`apps/web/client/src/hooks/use-import-local-project.ts`,
`apps/web/client/src/app/project/[id]/**`,
`apps/web/client/src/app/projects/import/**`,
`apps/web/client/src/components/project-creation-loader.tsx`.

---

## 2026-05-09 — Documentation overhaul + agent memory system

Author: Claude (agent)
Area: `docs/agent-context/`, `docs/agent-memory/`, `CLAUDE.md`, `AGENTS.md`
Summary: Audited existing docs, fixed stale package count and router list,
added five new sub-docs (`packages-reference.md`, `trpc-routers-reference.md`,
`routes-reference.md`, `ai-chat-architecture.md`, `cms-architecture.md`,
`breakpoints-architecture.md`), and introduced the `docs/agent-memory/` folder
(`user-preferences.md`, `feature-log.md`, `architecture-decisions.md`) so
agents have persistent, repo-scoped context without bloating the rulebook
files.
Files:
- `docs/agent-context/README.md` (updated index)
- `docs/agent-context/repo-map.md`, `current-progress.md`, `editor-architecture.md`, `data-api-architecture.md` (refreshed)
- `docs/agent-context/packages-reference.md` (new)
- `docs/agent-context/trpc-routers-reference.md` (new)
- `docs/agent-context/routes-reference.md` (new)
- `docs/agent-context/ai-chat-architecture.md` (new)
- `docs/agent-context/cms-architecture.md` (new)
- `docs/agent-context/breakpoints-architecture.md` (new)
- `docs/agent-memory/*` (new folder)
- `CLAUDE.md`, `AGENTS.md` (added memory + read-protocol sections)
Links: n/a (internal docs)

---

## Pre-2026-05-09 — Historical context (not exhaustive)

This log started 2026-05-09; older work is partially recoverable from:

- `apps/web/client/src/lib/changelog-entries.ts` — public changelog
- `docs/*.md` (timestamped working notes)
- Git log

Highlights from `changelog-entries.ts`:

- **2026-05-01 — v1.5 AI Component Generation** — natural-language → typed,
  styled, inserted components.
- **2026-04-01 — v1.4 GitHub Sync** — auto-commit + pull from in-editor.
- **2026-03-01 — v1.3 Component Library** — sidebar shadcn / Radix browser.
- **2026-02-01 — v1.2 Live Collaboration** — multi-user real-time editing.
- **2026-01-01 — v1.1 Weblab Launch** — public release.

Notable in-flight work as of this log's creation (see
`docs/agent-context/current-progress.md`):

- TipTap rich-text AI chat composer with `@`/`/` commands
- CMS workspace
- Responsive frame breakpoints (migration `0029_frame_breakpoints.sql`)
- Framework auto-detection in project creation
- Local CLI bridge for desktop AI providers
- Marketing/SEO expansion (blog redesign, comparison pages, structured data)

---

## 2026-06-11 — Canvas editor: destructive boot-sync fix + no-oid edit failures (commit 7291f40f4)

- **What:** Fixed the failure chain that made every canvas edit throw "No oid
  found for style change": a booting sandbox returning an empty/partial file
  listing caused `pullFromSandbox` to wipe the local FS and echo those
  deletions into the real sandbox (destroying `public/_weblab`), leaving the
  OID index empty so no element could be edited.
- **How:** sync-engine `listingIncomplete` guard (skip deletion reconciliation
  on untrustworthy listings), `syncDeletedRoots` echo suppression (sync-made
  deletes never pushed back), bounded background re-pull self-heal; fs.watch
  phantom self-delete path fix (`public/public`); MobX `runInAction` for all
  post-await HistoryManager stack mutations; dev-runner package.json read
  retry; deduped write-failure toast.
- **Tests:** new `apps/web/client/src/services/sync-engine/sync-engine.test.ts`
  (5 cases: incomplete/empty listing safety, complete-listing reconciliation,
  echo suppression, genuine user delete propagation).
- **Deferred:** static-HTML projects have NO oid pipeline (BACKLOG.md);
  `runCommand` empty-output-on-failure semantics (BACKLOG.md).
- **User-facing:** yes — eliminates the per-keystroke error toast and the
  project-file destruction that made the editor feel broken.
