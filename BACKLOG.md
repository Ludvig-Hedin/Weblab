# BACKLOG

Living list of known bugs, follow-ups, and deferred TODOs that did not block the
work that surfaced them. Every entry is something an agent or human can pick up
later without re-discovering the context.

## Protocol — read this before editing

- **Both [CLAUDE.md](CLAUDE.md) and [AGENTS.md](AGENTS.md) point here.** Any
  agent (Claude Code, Codex, Gemini, etc.) starting work in this repo should
  skim this file once and decide whether anything listed below intersects the
  task at hand. If it does, fix it as part of the work instead of duplicating
  the entry.
- **Always log it here when you defer a bug or TODO.** If you discover a real
  defect, latent issue, or follow-up that you cannot fix in the current
  change, append an entry below (or update an existing one) — do not leave it
  buried in a chat transcript, code comment, or PR description.
- Entries are organized newest first under **Open**. Move closed items to
  **Resolved** with the resolution date and PR/commit if known.
- Each entry should be self-contained: location (file:line), what's wrong,
  why it matters, a concrete next step.

### Entry template

```markdown
### <short-noun-phrase title>

- **Discovered:** YYYY-MM-DD (session/source if relevant)
- **Where:** path:line (or feature ID like F-131)
- **Symptom:** what the user / dev / test sees
- **Root cause:** if known
- **Next step:** what to do — usually a one-line fix sketch
- **Risk if ignored:** what stays broken
- **Tags:** `#bug` / `#test-gap` / `#tech-debt` / `#docs` / `#flake` / `#infra`
```

---

## Open

### Bug Hunt 2026-06-05 — project creation (needs-review findings)

Auto-fixed this pass (committed): `captureScreenshot` logged the expected
deleted-project `NOT_FOUND` race as a hard error (console spam) → now a quiet
skip; `getTimeoutMs` returned a negative `input` verbatim as the sandbox
lifetime → now guarded `> 0`. Remaining (not yet fixed):

- **static-html GitHub import → permanent 502.** [convex/projectActions.ts:413](apps/web/client/convex/projectActions.ts#L413) `createFromGit` reads `framework` and persists it but never passes it to `VercelSandboxProvider.createProjectFromGit`, so the provider uses Next's `DEFAULT_PORT` (3000). A static-html template (`serve` binds 8080) gets port 3000 persisted (`?? 8080` never fires) → preview 502s forever. `TODO(bug-hunt)` in code. Fix: thread `framework` → provider, map port/devCommand from `FRAMEWORK_RUNTIME`. Only static-html git imports affected.
- **`startGitHubTemplate` drops the parsed branch.** [components/store/create/manager.ts](apps/web/client/src/components/store/create/manager.ts) destructures `parseRepoUrl` for `{owner, repo}` only and lets `createFromGit` default branch to `main`; a repo whose default branch is `master`/`develop` (or a `/tree/<branch>` URL) clones the wrong/nonexistent ref → git failure. Fix: parse + pass the branch (action already accepts `branch`).
- **Silent prompt drop on double seed-failure.** [convex/projectActions.ts](apps/web/client/convex/projectActions.ts) `createFromPrompt` returns `{projectId}` even when both `_insertCreateRequest` attempts fail, so the editor opens with no pending request and the user's prompt is silently dropped (no replay, no error). Fix: surface a non-fatal toast ("project created but prompt couldn't be saved — retype it").
- **Sandbox-server lifecycle hardening (low).** `apps/web/server/src/sandbox/index.ts` `getSandbox` cache is unbounded + only evicts on rejection (stale handles to reclaimed VMs accumulate; 410 on first op after reclaim) — add TTL/LRU or evict on 410. And the provider's snapshot-resume shares the 45s `SDK_CALL_TIMEOUT_MS`; a legit cold resume >45s falls off a cliff to the 60-90s scaffold path — give snapshot-resume its own higher ceiling.
- **`createFromGit.repoUrl` unvalidated (low, from code-review).** Unlike `scrapeUrl` (which calls `assertSafeHttpUrl`), `convex/projectActions.ts` `createFromGit` hands `repoUrl` to the Vercel git-clone with no scheme/host guard. Blast radius is small (authed; clone runs in Vercel's isolated VM, not Convex), but the action is the trust boundary — add an http(s)-scheme + non-private-host check. `static-html` git-import port bug above is the deeper, multi-layer one (provider port + the server `setup()` hardcoding 3000); currently dormant since the static-html starter was removed and GitHub-import defaults to nextjs.
- **Duplicated sandbox-cleanup catch ×4 (nit).** `fork` factored a `stopSandbox` helper; createBlank/createFromPrompt/createFromGit/createFromWebsiteClone still inline the same `Sandbox.get → stop` block. Reuse the helper. (`readActiveWorkspaceId` ×3 dedup was fixed in the code-review commit.)

### Perf: first editor open pays a cold Next compile (snapshot is baked pre-dev-server)

- **Discovered:** 2026-06-05 (bug-hunt). The blank snapshot (`scripts/create-vercel-template.mjs`) is taken *after* `npm install` but *before* the dev server starts, so resume is fast (~13s) but the first preview pays a 30-90s cold Turbopack compile (`server/src/sandbox/index.ts` `setup()` polls up to 90s). No double-boot — the editor reuses the live sandbox by id (`Sandbox.get`), confirmed.
- **Fix (in progress this turn):** warm the dev server (with `--hostname 0.0.0.0`) before snapshotting so the snapshot carries a hot `.next` build cache → first open recompiles in seconds. Bake script updated + re-baked; `VERCEL_BLANK_SNAPSHOT_ID` rotated. An in-action pre-warm was rejected — the scaffolded `package.json` dev script lacks `--hostname`, so pre-warming with the wrong command would make `setup()` skip its correct spawn and 502 the preview.
- **Tags:** `#perf` `#sandbox`

### Copy to Figma (F-783): fidelity follow-ups + two live-Figma-only risks

- **Discovered:** 2026-06-04 (Copy to Figma ship)
- **Where:** [packages/figma-clipboard/src/map.ts](packages/figma-clipboard/src/map.ts) (mapping), [src/figma-schema.ts](packages/figma-clipboard/src/figma-schema.ts) (codec), [fractional-index.ts](packages/figma-clipboard/src/fractional-index.ts), [copy/figma.ts](apps/web/client/src/components/store/editor/copy/figma.ts) (clipboard write)
- **Symptom:** v1 pastes editable layers but is lossy for rich CSS, and two correctness details can only be confirmed in the real Figma app.
- **Risks that need a real-Figma check (T-814):**
  1. **Clipboard `version` tolerance** — we write `fig-kiwi` version 15 (per `fig-kiwi`) while the vendored schema came from a v106 `.fig`. If a Figma build rejects the mismatch on paste, derive both from a fresh real clipboard copy and pin them together.
  2. **`parentIndex.position` fractional-index** — we emit fixed-width ascending strings (Figma re-keys on paste). If siblings mis-order or paste is rejected, replace `positionForIndex` with Figma's real fractional-index algorithm (capture from a live copy).
- **Deferred fidelity (each a `// TODO`-worthy follow-up):**
  - **Image fills** — `<img>`/`background-image` currently become a gray placeholder rect. Real image fills need the bytes uploaded as buffer `blobs` + an `IMAGE` paint referencing the hash.
  - **flex → auto-layout** — v1 uses absolute positioning. Detect `display:flex` and emit Figma `stackMode`/spacing/padding/align for resilient, editable layouts.
  - **Gradients / box-shadow / transforms / filters / SVG** — approximated or skipped; add gradient paints, `DROP_SHADOW`/`INNER_SHADOW` effects, and transform decomposition.
  - **Mixed text+element nodes** — an element with both loose text and child elements drops the loose text (treated as a box).
  - **Safari clipboard activation** — the async `getFigmaSceneData` bridge call before `clipboard.write` may drop user-activation in Safari; primary target is Chromium. Mitigate with a promise-based `ClipboardItem` or pre-fetch-on-selection if Safari support is needed.
- **Next step:** schedule the real-Figma validation (T-814) first; it gates whether the two risks need rework. Fidelity items are independent enhancements.
- **Risk if ignored:** feature works for simple elements/frames; complex components paste with reduced fidelity. No crash — failures toast and no-op.
- **Tags:** `#feature` `#editor` `#integration` `#tech-debt`

### Editor URL `/project/<id>` is still the raw Convex id (not the site name)

- **Discovered:** 2026-06-03 (URL-humanization session — workspace slugs shipped, this deferred)
- **Where:** route [apps/web/client/src/app/project/[id]/page.tsx](apps/web/client/src/app/project/[id]/page.tsx); link builders [use-clone-website.ts:107,138](apps/web/client/src/hooks/use-clone-website.ts#L107), [use-create-blank-project.ts:84](apps/web/client/src/hooks/use-create-blank-project.ts#L84), [shared-with-me.tsx:37](apps/web/client/src/app/w/[slug]/_components/shared-with-me.tsx#L37). Route value `Routes.PROJECT` in [src/utils/constants/index.ts](apps/web/client/src/utils/constants/index.ts).
- **Symptom:** while editing, the address bar shows `/project/k97fawpe0hv2bt3g5qv1df583h8794fh` — opaque, not the site name. (Sibling work: workspace URLs were humanized this session; published `<slug>.weblab.app` default was switched to name-derived.)
- **Root cause:** the route param IS the Convex project `_id`, fed straight into `api.projects.getEditorBootstrap`, the offline bootstrap, and `editorEngine.projectId`. There is no project routing-slug column.
- **Why deferred (don't-break-anything):** a flat `/project/<slug>` namespace forces slugs to be **globally** unique across all users → common names collide constantly → `portfolio-2`, `portfolio-x7f9` everywhere (not actually human). Doing it the Webflow/Framer way means re-scoping the route under the workspace (`/w/<workspace>/<project>`), which rewrites the core editor entry point + offline bootstrap — too risky to bundle with the slug change.
- **Next step:** (a) add `projects.routeSlug` (unique **within workspace**), generate from name on create + backfill; (b) introduce nested route `/w/[slug]/[projectSlug]` (or make `/project/[idOrSlug]` resolve slug→id at the boundary via `ctx.db.normalizeId` fallback for back-compat so old id links never 404); (c) resolve to the real `_id` at the page boundary and keep passing the id downstream unchanged; (d) update the ~3 link builders; (e) decide offline-cache keying (slug URLs can't resolve offline → keep id-based links working as the offline path).
- **Risk if ignored:** none functional — editor URLs stay ugly but fully working. Cosmetic only.
- **Tags:** `#feature` `#editor` `#convex` `#ux`

### Fork-based create paths still stubbed: project clone + marketplace templates (`TODO(sandbox-fork)`)

- **Discovered:** 2026-06-03 (create-paths audit session)
- **Where:** `projectActions.fork` ([convex/projectActions.ts](apps/web/client/convex/projectActions.ts)) throws "Project fork is temporarily unavailable… snapshot-based fork is not yet implemented". Callers: project clone ([clone-project.tsx](apps/web/client/src/app/projects/_components/settings/clone-project.tsx), `clone-project-dialog.tsx`) and marketplace "Use template" ([template-modal.tsx](apps/web/client/src/app/projects/_components/templates/template-modal.tsx) → `forkTemplate`).
- **Symptom:** "Clone project" and marketplace "Use template" toast "Sandbox service temporarily unavailable".
- **Root cause:** Fork = duplicate an existing project's sandbox state into a new one. Needs Vercel snapshot-based fork (resume the source project's persisted `snapshotId` into a fresh sandbox, then insert a new project graph). Same blocker as `branch.fork` / publish.
- **Next step:** implement `fork` via snapshot resume — read source `projects.snapshotId`, provision from it (model on `createBlank`/`createFromGit`), insert project graph. Handle expired/missing snapshot (re-scaffold fallback or clear error).
- **Risk if ignored:** can't duplicate a project or start from a marketplace template. (Start-blank / AI-prompt / git-URL / folder / GitHub-repo / website-clone all work as of 2026-06-03.)
- **Tags:** `#feature` `#sandbox` `#convex`

### Figma import is low-fidelity (colored-box stubs); GitHub private-repo import needs token passthrough

- **Discovered:** 2026-06-03 (create-paths audit session)
- **Where:** Figma — [import/figma/_context/index.tsx:86](apps/web/client/src/app/projects/import/figma/_context/index.tsx#L86) (sandbox provisioning stubbed; fetch via `figmaActions.fetchFile` already works). GitHub private repos — `createFromGit` clones over HTTPS with no auth token.
- **Symptom:** Figma import throws "Sandbox provisioning is temporarily unavailable". Private GitHub repos fail at clone with a generic error (public repos work).
- **Root cause / detail:** Figma context is a near-copy of the (now-working) local importer and is wirable to `createEmptySandbox` + tRPC `fileWrite`/`setup`, BUT the scaffolder ([packages/figma/src/scaffold.ts](packages/figma/src/scaffold.ts)) only emits empty colored `<div>`s sized to each frame — no image export, no layout. So even re-enabled it yields colored boxes, not a real design.
- **Next step:** (a) low-fi: rewire the 4 figma-context stubs to `createEmptySandbox` + upload and have the scaffolder emit Next.js boilerplate. (b) **recommended** high-fi: render frame screenshots via Figma `/v1/images/` and feed them into `createFromWebsiteClone`/`createFromPrompt` image context (real visual clone). Private GitHub: thread the user's GitHub token into `createFromGit`'s clone URL.
- **Tags:** `#feature` `#sandbox` `#figma` `#integration`

### Edit-message submit guard is a no-op (`sendMessage` not awaited)

- **Discovered:** 2026-06-02 (chat-panel UI review session, surfaced by `claude-review`)
- **Where:** `apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-messages/user-message.tsx:147-153` (caller `handleSubmit:122-131`)
- **Symptom:** Editing a user message and pressing Submit twice quickly can fire the edit twice; the Submit spinner (`isSubmittingEdit`) never visibly renders.
- **Root cause:** `sendMessage` calls `toast.promise(onEditMessage(...))` but never `await`s or `return`s the inner promise, so it resolves to `undefined` immediately. `handleSubmit` awaits it and the `finally` resets `isSubmittingEdit` before the edit completes, defeating the `if (isSubmittingEdit) return;` dedup guard. `handleRetry` (133-145) already does this correctly.
- **Next step:** make `sendMessage` await/return its promise — `const p = onEditMessage(...); toast.promise(p, {...}); await p;` (mirror `handleRetry`).
- **Risk if ignored:** rare double-submit of an edited message; no visible submitting state. Pre-existing (not introduced by this session's UI tweaks); left out of scope to avoid touching unrelated logic in a multi-session tree.
- **Tags:** `#bug`

### Project settings expansion — deferred sub-features

- **Discovered:** 2026-06-02 (project-settings expansion session)
- **Where:** `apps/web/client/src/components/ui/settings-modal/*`
- **Context:** Built this pass — Overview (General), Site Access tab, SEO tab (robots.txt + crawler/AI quick-inserts + llms.txt + custom sitemap.xml). The items below were deferred; each has a reason + a quick alternative.
- **Deferred — blocked by disabled publish/serving on Vercel (`TODO(publish-vercel)`):**
  - **Website password** + **Make staging private** — need a serving-layer auth gate on the published/staging site; nothing serves it yet. *Quick alt:* persist the setting now, label "applies once publishing is live" (no real protection until then). `pageAccess.passwordHash` schema already exists to build on.
  - **301 redirects** — need `next.config` redirects or a redirect server honoring them. *Quick alt:* persist a redirect list now; write to `next.config` / wire serving when publish lands.
  - **Forms** (sender name / send-to / submissions) — no form-capture backend, and submissions require the served site to POST somewhere. *Quick alt:* embed a 3rd-party form (Formspree/Tally) on the page — works with zero backend from us.
- **Deferred — feasible but medium-high / better handled elsewhere:**
  - **Fonts** (Google/custom/Adobe) — must inject into the user's project code (`next/font`, Tailwind v4 theme, or `<link>`) + an asset pipeline for custom uploads; fragile across arbitrary project setups. *Quick alt:* ask the AI chat ("use Inter") — it edits the project's actual font setup correctly today.
  - **Organize in folder** — no folder model exists; it's an org/dashboard-level concept, not per-project settings. *Quick alt:* project **tags** already exist for grouping.
  - **SEO v2** — auto-generate sitemap from the pages tree, global canonical URL (needs root-metadata plumbing like the Site tab), staging-indexing toggle (moot until staging serves). *Quick alt:* the custom `sitemap.xml` editor already shipped covers manual sitemaps.
  - **Overview: total asset size + site activity** — need storage metering + an `auditLog` query (the `auditLog` table exists, no client query yet).
- **Handoff prompts written** (2026-06-03) for picking these up: [docs/prompts/add-publishing-controls.md](docs/prompts/add-publishing-controls.md) (password · private staging · 301 redirects · Forms), [docs/prompts/add-fonts-tab.md](docs/prompts/add-fonts-tab.md), [docs/prompts/add-seo-v2.md](docs/prompts/add-seo-v2.md). The **folder** item is now DONE (folder dropdown shipped in General settings).
- **Tags:** `#feature` `#tech-debt` `#infra`

### AI chat UX — deferred polish follow-ups

- **Discovered:** 2026-06-02 (chat-tab `/ux-assesment` + `/ux-polish` session)
- **Where:** `apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/*` + `messages/en.json` (`panels.edit.tabs.chat.*`)
- **Symptom / items not done this pass** (the high-value W1–W9 + thread-title orientation shipped):
  - **Queue clarity (S3):** the message queue never explains *why* messages queue or *when* they send, and a committed queued-edit shows no save confirmation. `chat-input/queue-items/*`.
  - **History-recall affordance (S2):** ↑/↓ recalls prior prompts but there is no hint and no "browsing history (n/total)" active indicator. `chat-input/index.tsx:281-320`.
  - **Context-pill near-limit count:** made the remove-X always visible (W6) but did **not** add the `n/max` image-limit indicator — intentionally skipped to avoid clutter. `context-pills/input-context-pills.tsx`.
  - **Stale composer copy:** `chat.input.tooltip` = "Chat with AI about the selected element" (selection no longer required — misleading) and `chat.mode.tooltip` = "Switch between Build and Ask modes" (omits **Plan**). `messages/en.json` (~1164, ~1167).
- **Next step:** small, independent edits; each a self-contained quick win. Fix the two stale strings first (one-line copy each).
- **Risk if ignored:** minor friction / mild confusion; nothing broken.
- **Tags:** `#ux` `#polish` `#i18n`

### Settings modal i18n is partial — only 4 tabs translated

- **Discovered:** 2026-06-02 (settings-modal polish session)
- **Where:** `apps/web/client/src/components/ui/settings-modal/*` — new `settings.*` namespace in `messages/en.json` + `sv.json`
- **Symptom:** Switching language now updates the **Appearance, Language, Editor, and Domain** tabs (Swedish added), but the remaining tabs (Account, AI, Skills, Shortcuts, Git, Subscription, Site, Project, Versions) and nested dialogs (skill-form, billing-info-edit, user-delete) still render hardcoded English.
- **Root cause:** Scope was limited to the highest-traffic tabs + the tab in the original report. Account-tab was deferred because its support-link helper needs `t.rich` and it embeds the sensitive delete flow.
- **Next step:** Convert the remaining tab files to `useTranslations()` under `settings.*`, extend `en.json`/`sv.json` (and ideally the other locales). Use the 4 done tabs as the pattern.
- **Risk if ignored:** Inconsistent localization — Swedish users see a mixed-language settings modal.
- **Tags:** `#i18n` `#tech-debt`

### Orphaned Convex `uiDensity` field after Density control removal

- **Discovered:** 2026-06-02 (settings-modal polish session)
- **Where:** `apps/web/client/convex/schema.ts` (userSettings `uiDensity`), `convex/users.ts` (`updateSettings`/`getMappedSettings` still map it)
- **Symptom:** The Density appearance control was removed because `--spacing-unit` (set by `[data-density]`) was consumed nowhere — the toggle did nothing. The Convex `uiDensity` field is now write-dead.
- **Root cause:** Density was never wired to real spacing; removing the UI is correct, but the schema field was left to avoid a migration.
- **Next step:** Either drop `uiDensity` from the userSettings schema + mapper in a dedicated additive→narrow migration, OR re-implement density for real (multiply component padding by `--spacing-unit`). Low priority.
- **Risk if ignored:** Harmless dead field; minor schema clutter.
- **Tags:** `#tech-debt` `#convex`

### Editable Weblab subdomain — end-to-end serving unverified (publish disabled)

- **Discovered:** 2026-06-02 (settings-modal polish session)
- **Where:** `convex/domains.ts` (`setPreviewSlug`, `previewSlugGet`), `convex/domainActionsDb.ts` (`_previewCreate`), `domain/preview.tsx`
- **Symptom:** Users can now reserve/rename `<slug>.weblab.app`. The slug persists (`projects.previewSlug`) and `_previewCreate` honors it, but `publish` is disabled on Vercel (`TODO(publish-vercel)`), so the slug can't be exercised against live routing/serving yet.
- **Root cause:** Publish path gated until snapshot-based fork lands.
- **Next step:** When publish is re-enabled, verify a chosen slug actually serves the deployed site and that the wildcard DNS + `by_full_domain` lookup resolves it. Pre-publish slug collisions across projects are only guarded at set-time (and at publish-time in `_previewCreate`).
- **Risk if ignored:** Setter UX works, but a reserved slug might not route until verified post-publish.
- **Tags:** `#infra` `#convex` `#test-gap`

### Terminal tab drag-reorder is single-branch only; live exec depends on sandbox runtime

- **Discovered:** 2026-06-02 (terminal overhaul — F-331/F-331a/F-331b/F-480)
- **Where:** [terminal-area.tsx](apps/web/client/src/app/project/[id]/_components/bottom-bar/terminal-area.tsx) `handleReorder`; [session.ts](apps/web/client/src/components/store/editor/sandbox/session.ts) `reorderTerminalSessions`.
- **Symptom / limitation:** Drag-to-reorder of terminal tabs only works **within a single branch**. Dragging a tab across branch boundaries is a deliberate no-op because per-branch session maps can't represent cross-branch interleaving. The common single-branch project is unaffected. Multi-branch projects can't interleave tabs from different branches.
- **Also:** The new command input row + AI mode are fully wired to the provider PTY (`terminal.write`) / `session.runCommand`, but **live command execution depends on the Vercel sandbox runtime** (the TOP-PRIORITY entry below) — `VercelBrowserProvider.runCommand`/terminals are currently stubs, so commands won't produce output on cloud projects until that lands. Works today on the local `nodefs` provider. The AI translation route (F-480) is independent and works now (returns a command string).
- **Next step (reorder):** if cross-branch interleaving is ever needed, lift terminal ordering out of per-branch maps into a single editor-level ordered list keyed by composite `branchId-sessionId`.
- **Tags:** `#editor` `#terminal` `#low`

### Editor sandbox runtime is UNIMPLEMENTED (deferred migration) → every project "loads forever" [TOP PRIORITY]

- **Discovered:** 2026-05-29 (create-flow e2e + root-cause). This is THE reason the editor preview never boots (penpal timeout + `__missing_router_config__` + "Trouble connecting"). Reproduces on every project, all environments.
- **Root cause — all three layers are stubs:**
  - `apps/web/client/src/components/store/editor/sandbox/vercel-browser-provider.ts` — every method returns a safe default: `listFiles → {files:[]}`, `readFile → ''`, `writeFile → {success:false}`, `runCommand → {success:false}`, terminals/tasks/watch are no-ops ("return safe defaults until the routes are ported").
  - `apps/web/server/src/router/routes/sandbox.ts` — `sandboxRouter` only has `create/start/stop/status` and they're placeholders (`create` returns `` `hi ${input}` ``).
  - `apps/web/server/src/sandbox/index.ts` — `start/stop/status` return hardcoded `http://localhost:8084` URLs.
- **Consequences:** `listFiles` empty → `detectRouterConfig` null → preload never injects → penpal never connects; `runCommand` no-op → dev server never starts → preview URL 502s. So the canvas, code panel, AI edit, and preview are all dead even though the sandbox provisions fine (`createBlank` works; a direct snapshot resume serves HTTP 200 in ~13s).
- **The building blocks all exist + are verified:** browser→server tRPC WS client `apps/web/client/src/lib/sandbox-server-client.ts` (+ Clerk JWT auth bridge `sandbox-server-auth-bridge.tsx`), `NEXT_PUBLIC_SANDBOX_SERVER_URL` (defaults `ws://host:8080/api/trpc`), and the `@vercel/sandbox` SDK (`Sandbox.get({sandboxId,teamId,projectId,token})` → `fs.readFile/writeFiles/mkdir/stat`, `runCommand`, `domain(port)` — all confirmed working via probe).
- **Build spec (incremental, verify each on localhost):**
  1. `apps/web/server/src/sandbox/index.ts`: real helpers over `Sandbox.get` — `listFiles` (via `runCommand('find . -type f' ...)` excluding node_modules/.next/.git), `readFile`, `writeFile` (`fs.writeFiles`), `stat`, `mkdir`, `runCommand`, `runBackgroundCommand` (dev server), `domain`.
  2. `apps/web/server/src/router/routes/sandbox.ts`: tRPC procedures (`fileList/fileRead/fileWrite/fileStat/fileMkdir/fileDelete/commandRun/commandRunBackground/taskOpen/taskRestart`) calling the helpers; auth via the existing Clerk-JWT context.
  3. `vercel-browser-provider.ts`: replace each stub with a call to `sandbox-server-client.ts`. Implement `VercelBrowserTerminal`/`VercelBrowserTask` streaming over the WS subscription, and `setup()` → `npm install` + spawn `npm run dev -- --hostname 0.0.0.0` (background).
  4. Verify order on localhost: router config detected → preload injected → dev server serves → penpal connects → preview renders.
- **SECURITY PREREQUISITE (blocker for the whole build):** the Fastify tRPC context `apps/web/server/src/router/context.ts` does NO real auth — it sets `user = { name: req.headers.username ?? 'anonymous' }`. The sandbox-server-auth-bridge claims the server "verifies the token via Clerk's JWKS in its tRPC context", but it does NOT. Wiring `fileRead`/`fileWrite`/`commandRun` onto this would expose **arbitrary file read/write + command execution on ANY sandbox to ANY unauthenticated caller** (RCE + cross-tenant data access). Before any sandbox procedure ships: (a) verify the Clerk JWT (passed in WS connectionParams) against Clerk JWKS in `createContext`, (b) resolve the caller's userId, (c) authorize that the caller owns/can-access the requested `sandboxId` (map sandboxId→project→`requireCap('project.edit')`). This is the gating reason the wiring must be a reviewed, security-tested build, NOT a blind push. The server-side `VercelSandboxProvider` (reused by `createBlank`) already wraps the SDK correctly — reuse it, but the AUTH layer is net-new and security-critical.
- **Risk:** this is the editor's core runtime AND a remote sandbox-access surface — build behind verification + a security review, do NOT ship partial or unauthenticated.
- **Tags:** `#bug` `#sandbox` `#migration` `#editor` `#high` `#blocks-everything`

### Editor preview never boots on a freshly-created blank project — sync engine wipes the sandbox on first connect (DATA-PATH RISK)

- **Discovered:** 2026-05-29 (create-flow e2e, localhost, authenticated). This is the real "loads forever" the original report showed (penpal timeouts + `__missing_router_config__`).
- **NOT offline mode:** ruled out — `navigator.onLine === true`, `/api/health` → 200, and the project connected to a **real** sandbox (`[Sync] Created new sync instance for sbx_…`). The synthetic-project offline fallback (`session.ts:102`, sandboxId `test-…`/`example.com`) is a separate, intended path (that's why the seeded "QA Test Project" is offline).
- **Symptom / sequence on first connect:** `[Sync] Created new sync instance for sbx_…` → `[Sync] Deleted directory: /public` → `[Sync] Pushing locally modified files back to sandbox…` → `Error: File system not initialized` (`CodeFileSystem.writeFile`) → `[SandboxManager] Router config not detected yet` (repeats forever) → penpal timeouts. The client ZenFS (`CodeFileSystem`) appears uninitialized, so the sync engine treats local as empty and **pushes empty / deletes `/public` (and the router dir) on the sandbox** instead of pulling sandbox→local first. With `app/` gone, `detectRouterConfig` returns null forever → preload never injects → preview never connects.
- **The sandbox itself is healthy** — a direct snapshot-resume probe serves HTTP 200 in ~13s. The bug is in the editor's initial sync, not the sandbox.
- **Next step (do carefully — this path persists user code):** trace `CodeProviderSync` (`src/services/sync-engine/sync-engine.ts`) initial-sync direction + `CodeFileSystem` init order (`packages/file-system`). The initial `pullFromSandbox` must complete (and ZenFS must be initialized) BEFORE any push/delete. Add a guard: never push/delete to the sandbox until the first successful pull. Repro is deterministic on a fresh blank create.
- **Risk if ignored:** every freshly-created project (and any reconnect with an uninitialized FS) can have its sandbox files deleted → permanent "loads forever" + potential loss of scaffolded files.
- **Tags:** `#bug` `#sandbox` `#sync` `#data-loss-risk` `#high`

> Note: `bun dev` (`@weblab/web dev`) only starts client+preload, not `@weblab/web-server`. Start `apps/web/server` separately (`bun --filter @weblab/web-server dev`, port 8080) for full local editing. This was NOT the cause of the boot failure above but is needed for a complete local stack.

### Editor comments fail to load — ConvexHttpClient query is unauthenticated (UNAUTHORIZED)

- **Discovered:** 2026-05-29 (editor console). `CommentManager.loadCommentsOnce` → `ConvexHttpClient.query(api.comments...)` → `Server Error / UNAUTHORIZED at requireUser (convex/lib/permissions.ts:44)`.
- **Root cause:** the one-shot `ConvexHttpClient` is created without `.setAuth(token)`, so it carries no Clerk identity; `requireCap('project.view')` → `requireUser` throws. Would fail on prod too (comments never load in the editor).
- **Next step:** pass the Clerk JWT to the `ConvexHttpClient` used by `CommentManager` (`client.setAuth(await getToken())`), or switch to the reactive authenticated Convex client.
- **Risk if ignored:** project comments silently never load.
- **Tags:** `#bug` `#convex` `#auth`

### 3 of 4 create paths disabled — AI / clone / upload need Convex re-implementation (Vercel 402 now RESOLVED)

> **RESOLVED 2026-06-03** — all three are wired: AI prompt (`createFromPrompt`, commit `ab96d3e69`), site clone (`createFromWebsiteClone`, commit `38a0cf921`), upload folder (entry points route to the working `/projects/import/local` page → `createEmptySandbox`, commit `7a9c5df8e`). GitHub repo import also re-enabled (`createFromGit`). Remaining create gaps tracked in the two fork/figma entries at the top of Open.

- **Discovered:** 2026-05-29 (create-flow e2e session). External Vercel 402 blocker is **gone** — verified `Sandbox.create` provisions in ~3.6s and a blank snapshot resume serves HTTP 200 in ~13s. So **blank create works end to end** (`api.projectActions.createBlank`). The other three paths are still stubbed.
- **Where / current state:**
  - **AI prompt:** [src/components/store/create/manager.ts](apps/web/client/src/components/store/create/manager.ts) `startCreate` throws `UNAVAILABLE_MESSAGE`. Editor reads `api.projectCreateRequests.getPendingRequest` ([convex/projectCreateRequests.ts](apps/web/client/convex/projectCreateRequests.ts)) → only sets `isFirstCreation` (copy). **No insert mutation for `projectCreateRequests`, and no editor consumer that actually sends the prompt to the AI chat** — the auto-kickoff was part of the removed `project.create(creationData)` flow.
  - **Site clone:** [src/hooks/use-clone-website.ts](apps/web/client/src/hooks/use-clone-website.ts) `cloneFromUrl` — `scrapeUrl` ([convex/utils.ts:152](apps/web/client/convex/utils.ts#L152), returns markdown/HTML + base64 screenshot) works, then `unavailable('Cloning from URL')`. Clone = scrape → AI rebuild, so it depends on the same missing AI-kickoff.
  - **Upload folder:** [src/hooks/use-import-local-project.ts](apps/web/client/src/hooks/use-import-local-project.ts) throws before the FS-Access picker; needs the removed `sandbox.fork` + `orphanBulkUpload` + `startOrphan`.
- **Root cause:** Convex migration removed `sandbox.fork`, `project.create(creationData)`, and the bulk-upload/orphan primitives. `createBlank` returns `{projectId}` only and takes no initial files; `writeFile` exists on the provider ([packages/code-provider/src/providers/vercel-sandbox/index.ts:586](packages/code-provider/src/providers/vercel-sandbox/index.ts#L586)) but nothing wires scrape/upload content into a provisioned sandbox.
- **Next step (incremental, verify each in a logged-in browser before shipping):**
  1. **Upload** (no AI): client FS-Access gather → new Convex action: provision (createBlank path) → bulk `writeFile` into the live sandbox → re-snapshot → insert project graph.
  2. **AI kickoff**: add a `projectCreateRequests` insert mutation; add an editor consumer that, on a pending request, sends the stored prompt to the AI chat and marks the request done.
  3. **Clone**: reuse (2) — feed the `scrapeUrl` result as the create-request context.
- **Risk if ignored:** only blank create is usable; AI/clone/upload show "temporarily unavailable".
- **Tags:** `#feature` `#sandbox` `#convex` `#ai`

### Built-in skills `tailwind` and `impeccable` could not be embedded (missing sources)

- **Discovered:** 2026-05-29 (skills built-in seeding session)
- **Where:** `agent-temp-input/tailwind` → `../../.agents/skills/tailwind` and `agent-temp-input/impeccable` → `../../.agents/skills/impeccable` (dangling symlinks); generator [packages/ai/scripts/generate-skills.ts](packages/ai/scripts/generate-skills.ts) reads `skills/<name>/SKILL.md`.
- **Symptom:** User asked for both to ship as default-on built-ins, but their symlink targets resolve to `coder-new/.agents/skills/*`, which does not exist on disk; no matching `SKILL.md` found under `~/.claude` either. The other 7 requested skills were embedded; these two were skipped.
- **Next step:** Obtain the real `tailwind` + `impeccable` `SKILL.md` sources, drop them into `skills/tailwind/SKILL.md` and `skills/impeccable/SKILL.md`, then run `bun run generate:skills`. No code change needed.
- **Risk if ignored:** the agent's built-in skill menu is missing two skills the user expected.
- **Tags:** `#docs` `#tech-debt`

### Image credit deduction can't span multiple Pro rate-limit buckets

- **Discovered:** 2026-05-29 (image-gen independent review)
- **Where:** [convex/lib/usageMath.ts](apps/web/client/convex/lib/usageMath.ts) `selectDeductionBucket` (has a `TODO(image-credits)` marker); consumed by `applyIncrement` / `reserveImage` in [convex/usage.ts](apps/web/client/convex/usage.ts).
- **Symptom:** A Pro user whose remaining credits are split across two buckets (e.g. 3 + 4 left = 7 total) can't generate a 5-credit image because no single bucket holds ≥5 — they get `USAGE_LIMIT_REACHED` despite having enough total. Reachable near billing-period rollover. Text usage (cost 1) is unaffected.
- **Root cause:** deduction targets one bucket and the usageRecord links one bucket so `revertIncrement` can refund it; spanning buckets needs multi-link tracking.
- **Next step:** add a `linkedRateLimits: {id, amount}[]` field (or child table) on `usageRecords`, drain oldest-first across buckets in `applyIncrement`, refund each in `revertIncrement`.
- **Risk if ignored:** rare false "out of credits" for paying users near period boundaries.
- **Tags:** `#bug` `#billing`

### Skills settings tab strings are hardcoded (no i18n)

- **Discovered:** 2026-05-29 (skills scope-clarity work)
- **Where:** [apps/web/client/src/components/ui/settings-modal/skills-tab/index.tsx](apps/web/client/src/components/ui/settings-modal/skills-tab/index.tsx) and [scope-badge.tsx](apps/web/client/src/components/ui/settings-modal/skills-tab/scope-badge.tsx).
- **Symptom:** all strings ("Skills", "All skills", scope help, empty/loading states) are inline English, unlike the sibling `skill-import-dialog.tsx` which uses `next-intl`. New scope-help copy added this session followed the file's existing hardcoded convention.
- **Next step:** route through `editor.settings.skills.*` keys in `messages/en.json` (base for all locales).
- **Risk if ignored:** the Skills tab stays untranslated for non-English users.
- **Tags:** `#i18n` `#tech-debt`

### Blank-project create pays the sandbox cold-boot cost twice (slow create + slow editor)

- **Discovered:** 2026-05-29 (project-creation investigation session)
- **Where:** [convex/projectActions.ts:244](apps/web/client/convex/projectActions.ts#L244) (`createBlank` → `VercelSandboxProvider.createProject`, synchronous), then editor cold-resume via [src/components/store/editor/sandbox/session.ts](apps/web/client/src/components/store/editor/sandbox/session.ts) `start()`.
- **Symptom:** "Start blank" shows the creation loader for 15–45s while `createBlank` scaffolds + `npm install` + snapshots + resumes the sandbox synchronously. It then `router.push`es to the editor, which cold-resumes the *same* sandbox from snapshot — the dev server respawns and the preview 502s for another 20–60s. The user waits through the boot twice.
- **Root cause:** Provisioning is fully synchronous in the action, and the editor does not reuse the still-warm sandbox from create; it re-resumes from the persisted `snapshotId`.
- **Next step:** Either (a) keep the create-time sandbox warm and hand its live session to the editor so it skips the second resume, or (b) provision asynchronously (return `projectId` immediately, boot in the background) and let the editor's now-resilient boot loop (see self-heal in [use-frame-reload.ts](apps/web/client/src/app/project/[id]/_components/canvas/frame/use-frame-reload.ts)) cover the wait. Also wire `WEBLAB_VERCEL_WARM_POOL_SIZE` so a pre-warmed VM is claimed instead of cold-provisioned. Needs a live Vercel-sandbox env to verify.
- **Risk if ignored:** every new project feels slow and "stuck"; the perceived double-wait is the top creation-flow complaint.
- **Tags:** `#perf` `#infra` `#sandbox` `#needs-verification`

### Sandbox liveness probe is a no-op on Convex — editor can't tell "booting" from "dead"

- **Discovered:** 2026-05-29 (project-creation investigation session)
- **Where:** [src/app/project/[id]/_components/canvas/frame/use-sandbox-liveness.ts:23](apps/web/client/src/app/project/[id]/_components/canvas/frame/use-sandbox-liveness.ts#L23) (TODO(convex-migration): always returns `'unknown'`); also stubbed in [project-preview-surface.tsx:93](apps/web/client/src/app/projects/_components/select/project-preview-surface.tsx#L93).
- **Symptom:** `useSandboxLiveness` never probes, so every auto-recovery branch in [frame/index.tsx](apps/web/client/src/app/project/[id]/_components/canvas/frame/index.tsx) that keys off `livenessState === 'alive' | 'gone' | 'notFound'` is dead code. The editor relies solely on the penpal handshake + reload loop; a genuinely-reaped sandbox can't surface a Restore CTA, and the boot loop can't distinguish "still cold" from "gone forever". Partially mitigated this session by a background self-heal reload after the cap, but that's a fallback, not a real signal.
- **Root cause:** The legacy `sandbox.checkAlive` tRPC procedure (apps/web/server) was never ported to Convex during the migration.
- **Next step:** Add a Convex `action` `sandboxActions.checkAlive({ projectId })` that server-side `HEAD`s the project's *own* stored `sandboxUrl` (look it up server-side — do NOT accept an arbitrary URL from the client, SSRF) and classifies `2xx/3xx/404→alive`, `502/503/504→booting`, `410/DNS-fail→gone`. Wire it into `useSandboxLiveness` (poll while `enabled`). Unit-test the classifier in isolation.
- **Risk if ignored:** reaped sandboxes spin forever with no Restore path; boot UX stays guess-based.
- **Tags:** `#bug` `#sandbox` `#convex` `#tech-debt`

### Stripe `past_due` / `unpaid` subscriptions keep full Pro access (no failed-payment gating)

- **Discovered:** 2026-05-29 (test-hardening session: billing audit, HIGH-confidence)
- **Where:** [convex/lib/stripeWebhook.ts:279](apps/web/client/convex/lib/stripeWebhook.ts#L279) (`isRenewal` only handles `stripeStatus === 'active'`), [convex/lib/enums.ts](apps/web/client/convex/lib/enums.ts) (`vSubscriptionStatus` is only `active | canceled`), entitlement at [convex/usage.ts:54](apps/web/client/convex/usage.ts#L54) (keys solely off `status === 'active'`).
- **Symptom:** When a renewal charge fails, Stripe sends `customer.subscription.updated` with `status: 'past_due'`. `_handleSubUpdated` has no branch that maps non-active statuses, so the row stays `active` and the user keeps Pro credits while not paying. There is **no `invoice.payment_failed` handler** (grep: 0 matches). Conversely, when `customer.subscription.deleted` finally fires, access is yanked with no prior grace/warning.
- **Root cause:** The subscription model has only two states; `past_due`/`unpaid`/`incomplete` are unrepresentable, and entitlement never consults `stripeCurrentPeriodEnd`.
- **Next step:** Decide the dunning policy (grace window vs immediate gate), extend `vSubscriptionStatus` + `_handleSubUpdated` to map `past_due`/`unpaid`, and add an `invoice.payment_failed` handler in the webhook switch ([convex/http.ts](apps/web/client/convex/http.ts)). Add a `convex-test` harness so `_handleSubUpdated` can be unit-tested.
- **Risk if ignored:** revenue leak (failed renewals keep access) + abrupt access loss with no warning UX.
- **Tags:** `#bug` `#billing` `#convex` `#money-path`

### Stripe webhook reads billing period from `items.data[0]`, not the subscription — API-version fragile

- **Discovered:** 2026-05-29 (test-hardening session: billing audit, NEEDS-VERIFICATION)
- **Where:** [convex/http.ts:195](apps/web/client/convex/http.ts#L195) (`current_period_start/end` read off `subscription.items.data[0]`; 202-drop guard at ~L222), SDK constructed with no pinned `apiVersion` at [convex/subscriptionActions.ts:27](apps/web/client/convex/subscriptionActions.ts#L27).
- **Symptom:** `current_period_start/end` moved onto subscription **items** only in Stripe API `2025-03-31.basil`+. On an older account default API version those fields are `undefined` → the guard returns `202` and silently drops the event — including `customer.subscription.created`, so a brand-new paid subscription is never persisted (user charged, zero access). Renewal quota reset also depends on a distinct `subscription.updated` rather than the canonical `invoice.paid` signal.
- **Next step:** Confirm the Stripe API version pinned for this account's webhook endpoint; make the parser fall back to `sub.current_period_*` when the item fields are absent; pin `apiVersion` on the `new Stripe()` client so the webhook JSON shape and SDK agree.
- **Risk if ignored:** on an API-version mismatch every checkout silently no-ops server-side.
- **Tags:** `#bug` `#billing` `#convex` `#needs-verification`

### Email / custom-domain values are not canonicalized at write — case-sensitive lookups can miss

- **Discovered:** 2026-05-29 (test-hardening session: auth + domain audit, MEDIUM)
- **Where:** invite member-conflict guard [convex/projectInvitations.ts:428](apps/web/client/convex/projectInvitations.ts#L428) (probes only lowercased + as-typed email); `users.email` stored raw from Clerk ([convex/clerkWebhooks.ts:31](apps/web/client/convex/clerkWebhooks.ts#L31), [convex/lib/permissions.ts:88](apps/web/client/convex/lib/permissions.ts#L88)). Custom-domain reuse/remove exact-match on stored `fullDomain`: [convex/domainActionsDb.ts:273](apps/web/client/convex/domainActionsDb.ts#L273) (`_ensureUserOwnsDomain`), [:82/:95](apps/web/client/convex/domainActionsDb.ts#L82) (`_customRemove`).
- **Symptom:** A member whose stored email is `John.Doe@Acme.com` invited again as `john.doe@acme.com` (third casing) bypasses the "already a member" guard → duplicate pending invite (NOT a privilege escalation; `accept` is case-insensitive + idempotent). Custom-domain reuse/remove can miss when casing differs from the stored value.
- **Root cause:** emails/domains persisted verbatim; guards assume a lowercased invariant that writers don't enforce. (The verification **create** path was normalized 2026-05-29 — see commit; reuse lookup left raw for backward-compat with pre-existing rows.)
- **Next step:** lowercase `users.email` in the Clerk webhook + JIT writers (one-time backfill for existing rows), then normalize the reuse/remove domain lookups too. Extract a pure `canonicalizeEmail` + reuse the existing `isEmailMatch`.
- **Risk if ignored:** duplicate invites + occasional "you don't own this domain" / silent no-op on remove for mixed-case entries. Low severity.
- **Tags:** `#bug` `#auth` `#convex` `#low-severity`

### Dead-code domain helpers in `packages/utility` have a real ccTLD bug

- **Discovered:** 2026-05-29 (test-hardening session: auth audit)
- **Where:** [packages/utility/src/domain.ts:58](packages/utility/src/domain.ts#L58) `getRootDomain` (naive `parts.slice(-2)`), plus `isSubdomain` (:49) and `verifyDomainOwnership` (:14).
- **Symptom:** `getRootDomain('app.foo.co.uk')` → `"co.uk"` (public suffix, not the registrable apex). These have **zero production callers** (grep across `apps/`+`packages/`); the live Convex path uses tldts (`convex/lib/freestyle.ts::parseDomain`, now unit-tested). Vestigial from the pre-Convex tRPC domain router.
- **Next step:** delete the dead helpers, or if revived, reimplement on tldts/PSL and add tests.
- **Risk if ignored:** none today (dead); a future caller would inherit the ccTLD mis-parse.
- **Tags:** `#tech-debt` `#dead-code`

### Test hygiene: `navigation.test.ts` fails in bare env; `subdirectory.test.ts` is empty

- **Discovered:** 2026-05-29 (test-hardening session: baseline run)
- **Where:** [apps/web/client/test/frame/navigation.test.ts](apps/web/client/test/frame/navigation.test.ts) (transitively imports `src/env.ts`); [apps/web/client/test/sandbox/subdirectory.test.ts](apps/web/client/test/sandbox/subdirectory.test.ts) (0 bytes).
- **Symptom:** `navigation.test.ts` is the only failing test in the client suite — it throws "Invalid environment variables" at import time because `OPENROUTER_API_KEY` is unset under `bun test` (env IS set at runtime, so not a product bug). `subdirectory.test.ts` is empty → false-confidence "coverage" with zero assertions.
- **Next step:** preload a test-only env (bunfig `preload` or set a dummy `OPENROUTER_API_KEY` in a test setup file) so the suite is green in CI; delete or fill `subdirectory.test.ts` (no subdirectory-resolution helper currently exists to test).
- **Risk if ignored:** perpetually red suite masks new real failures; empty file misleads.
- **Tags:** `#test-gap` `#flake` `#infra`

### `parseDomain` comment claims PSL private-domain handling it doesn't do

- **Discovered:** 2026-05-29 (test-hardening session; pinned in `freestyle.test.ts`)
- **Where:** [convex/lib/freestyle.ts:65](apps/web/client/convex/lib/freestyle.ts#L65) + the comment at [domainActions.ts:58](apps/web/client/convex/domainActions.ts#L58).
- **Symptom:** Comment says tldts splits `.co.uk` / `.github.io` / `.vercel.app` "correctly via the PSL", but `parse()` is called without `allowPrivateDomains: true`, so PRIVATE suffixes are NOT honored: `parseDomain('user.github.io')` → apex `github.io`, `parseDomain('x.vercel.app')` → apex `vercel.app`. `.co.uk` (ICANN suffix) is correct. Behavior is now pinned in `convex/lib/freestyle.test.ts`.
- **Next step:** either fix the comment (private suffixes not handled) or pass `{ allowPrivateDomains: true }` if those should be treated as apexes — and update the test. Low impact: users connect real registrable domains, not `*.github.io`.
- **Risk if ignored:** misleading comment; apex dedup key for a `*.vercel.app`/`*.github.io` custom domain would be the shared private suffix.
- **Tags:** `#docs` `#low-severity`

### Billing settings redesign built but not wired into the Subscription tab

- **Discovered:** 2026-05-29 (full-repo code review)
- **Where:** [apps/web/client/src/components/ui/settings-modal/billing/](apps/web/client/src/components/ui/settings-modal/billing/) — `plan-card.tsx`, `payment-methods.tsx`, `billing-information.tsx`, `billing-info-edit-dialog.tsx`, `billing-history.tsx`, `cancel-plan.tsx`, `use-billing-details.ts`, `format.ts`. Backed by new Convex actions in [convex/subscriptionActions.ts](apps/web/client/convex/subscriptionActions.ts) (`getBillingDetails`, `updateBillingInfo`, `setDefaultPaymentMethod`, `deletePaymentMethod`, `addPaymentMethod`, `cancelSubscription`, `reactivateSubscription`).
- **Symptom:** Nothing imports any of these components — `grep` for `PlanCard`/`PaymentMethods`/`useBillingDetails` outside the dir returns zero hits. The live Subscription tab ([subscription-tab.tsx](apps/web/client/src/components/ui/settings-modal/subscription-tab.tsx)) still renders the old inline UI, so the new payment-method management, billing-address editor, invoice history, and native cancel/reactivate are invisible to users.
- **Root cause:** In-flight WIP committed before the integration step. Components + actions typecheck/lint clean (compiled as dead code), so no build break — but the feature does nothing.
- **Next step:** Wire the new `billing/*` components into `subscription-tab.tsx` (replace or augment the existing plan UI), then browser-verify the full Stripe flow end-to-end against test mode: load details, set/delete default card, add card (portal deep-link), edit billing address, cancel + reactivate. Treat as a payment-critical change — do not ship without manual verification of each path.
- **Risk if ignored:** dead code in the bundle; the intended billing UX never reaches users; future readers assume it's live.
- **Tags:** `#feature-gap` `#billing` `#convex` `#wip`

### Vercel Sandbox returns HTTP 402 — all project/branch creation + editor sandbox resume is blocked

- **Discovered:** 2026-05-29 (investigate: "can't create projects")
- **Where:** Vercel account behind `VERCEL_TEAM_ID` (set on both Convex deployments `avid-gnat-539` dev + `rapid-crab-113` prod). Surfaces at [apps/web/client/convex/projectActions.ts:243](apps/web/client/convex/projectActions.ts#L243) (`VercelSandboxProvider.createProject` → `Sandbox.create`).
- **Symptom:** `projectActions.createBlank` / `branchActions.createBlank` fail; prod client sees masked "Server Error" (request id `d93c958b083e9289`). Prod Convex log: `Uncaught Error: Status code 402 is not ok`. Editing an existing project also breaks because opening the editor resumes the sandbox via the same `Sandbox.create` call.
- **Root cause:** HTTP 402 Payment Required from the Vercel Sandbox API — the token authenticates (else 401/403) but the team has hit a spend/quota limit, has no payment method, or is on a plan that excludes Sandbox. **Not a code bug.**
- **Next step (manual, owner = Ludvig):** In the Vercel dashboard for the team in `VERCEL_TEAM_ID` → Settings → Billing: confirm an active paid plan that includes Sandbox, add/repair a payment method, and raise/clear the spend-management cap. Then retry "Start blank". If it should run on a different team, rotate `VERCEL_TEAM_ID`/`VERCEL_PROJECT_ID`/`VERCEL_TOKEN` on **both** Convex deployments (`npx convex env set … ` and `… --prod`).
- **Risk if ignored:** core product is unusable — no project can be created, opened, or edited.
- **Tags:** `#bug` `#infra` `#blocker` `#sandbox` `#billing`

### Prompt / GitHub-template project creation not yet ported to Convex (`TODO(sandbox-port)`)

> **RESOLVED 2026-06-03** — `startCreate` → `createFromPrompt`, and `startPublicGitHubTemplate` / `startGitHubTemplate` → `createFromGit` are all wired (commits `ab96d3e69`, `7a9c5df8e`). The only stubbed manager method left is `createSandboxFromGithub`, which is dead code (no caller). Marketplace "Use template" (forkTemplate → `fork`) is still blocked — see the `TODO(sandbox-fork)` entry at the top of Open.

- **Discovered:** 2026-05-29 (investigate; pre-existing TODO)
- **Where:** [apps/web/client/src/components/store/create/manager.ts:24](apps/web/client/src/components/store/create/manager.ts#L24) — `startCreate`, `startGitHubTemplate`, `startPublicGitHubTemplate` all throw `UNAVAILABLE_MESSAGE`.
- **Symptom:** AI/prompt create (hero input) and GitHub-template imports show "Project creation is temporarily unavailable while the sandbox layer is being migrated to Convex." Only the "Start blank" CTA reaches a real Convex action.
- **Root cause:** legacy flow chained tRPC `api.sandbox.fork` + `api.project.create` + `api.github.validate`; none have Convex equivalents that accept a prompt, image context, or github subpath. `projectActions.createBlank` only handles the blank shape.
- **Next step:** port a `projectActions.createFromPrompt` (+ github variant) that provisions via `VercelSandboxProvider.createProjectFromGit` / scaffold, writes the project graph, and seeds the first chat message. Gated behind the 402 blocker above — nothing creates until billing is fixed.
- **Risk if ignored:** the headline "describe your app" entry point is dead; users must use "Start blank".
- **Tags:** `#tech-debt` `#sandbox` `#convex` `#feature-gap`

### Stripe webhook required-field gate can drop cancel/pause/resume events

- **Discovered:** 2026-05-28 (CodeRabbit-fix pass, local-review)
- **Where:** [apps/web/client/convex/http.ts:216-234](apps/web/client/convex/http.ts#L216-L234) — the `if (!event.id || !sub.id || !item?.id || !priceId || !customerId || !item.current_period_start || !item.current_period_end)` 202 gate
- **Symptom:** the gate requires `priceId` + `customerId` + `current_period_*` for **every** routed event before dispatch, then 202-accept-ignores (no Stripe retry). But `_handleSubDeleted` / `_handleSubPaused` / `_handleSubResumed` only consume `subscriptionId`. If Stripe ever delivers a cancel/pause/resume without a fully-expanded price/period (e.g. canceled-immediately, or future API-version field relocation), the event is permanently dropped and the subscription stays `status:'active'` in our DB → user keeps entitlements they no longer pay for.
- **Root cause:** one-size gate; pre-existing (predates the `evt.id` dedup work, which only added `!event.id` to the same gate).
- **Next step:** gate billing fields only for `created`/`updated` (`const needsBilling = event.type === 'customer.subscription.created' || 'customer.subscription.updated'`). **Must also** relax `vSubEventInput` (make `priceId`/`customerId`/`currentPeriod*` optional) since those handlers don't read them — a gate-only change would pass the gate then fail the validator → 500 retry loop. Needs a convex-test once a harness exists.
- **Risk if ignored:** low in practice (Stripe currently sends the full subscription object on delete/pause/resume) but a silent revenue/entitlement leak if that ever changes.
- **Tags:** `#bug` `#billing` `#webhook`

### `_clearScheduleChange` uses unindexed `.filter` table scan + `.unique()`

- **Discovered:** 2026-05-28 (CodeRabbit-fix pass, local-review)
- **Where:** [apps/web/client/convex/lib/stripeWebhook.ts](apps/web/client/convex/lib/stripeWebhook.ts) — `_clearScheduleChange`, `.filter(q => q.eq(q.field('stripeSubscriptionScheduleId'), …)).unique()`
- **Symptom:** unlike every other lookup in the file (all `withIndex`), this scans the entire `subscriptions` table on each schedule release; `.unique()` throws if two rows ever share a schedule id. Violates the Convex "never `.filter`" guideline.
- **Root cause:** missing index; pre-existing (untouched by the dedup work).
- **Next step:** add `subscriptions.index('by_stripe_subscription_schedule_id', ['stripeSubscriptionScheduleId'])` and switch to `withIndex`; consider `.first()` over `.unique()` per the duplicate-row hazard already acknowledged in `_resolveCallerUserId`.
- **Risk if ignored:** full-table scan cost grows with subscription count; a duplicate schedule id crashes `releaseSubscriptionSchedule`.
- **Tags:** `#tech-debt` `#billing` `#performance`

### Confirm Railway `NEXT_PUBLIC_CONVEX_URL` = prod Convex (`rapid-crab-113`)

- **Discovered:** 2026-05-28 (prod Google-login crash investigation)
- **Where:** Railway web-client service build vars (Dockerfile ARG `NEXT_PUBLIC_CONVEX_URL`)
- **Symptom:** Could not verify which Convex deployment the live bundle targets — Railway login token expired (`railway login` needed) and the URL sits in a lazy-loaded JS chunk the sandbox probe couldn't reach.
- **Root cause:** n/a (verification gap). Diagnosis strongly implies prod points at `rapid-crab-113` (only an empty deployment produces *both* console errors, and dev `avid-gnat-539` is not empty), but it is unconfirmed.
- **Next step:** `railway login`, then read the web-client service var. Must equal `https://rapid-crab-113.convex.cloud`. If it's the dev URL (`avid-gnat-539`), that's a second bug — repoint it and redeploy. While there, sanity-check `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is the `pk_live_*` prod key.
- **Risk if ignored:** If prod actually points at dev Convex, login still fails after the prod deploy (prod Clerk token rejected by dev's issuer).
- **Tags:** `#infra` `#auth` `#convex`

### React error #418 (hydration) on /sign-in — confirm resolved post-fix

- **Discovered:** 2026-05-28 (prod Google-login crash investigation)
- **Where:** `apps/web/client/src/app/sign-in/**` (rendered with Clerk + Convex providers)
- **Symptom:** Console `Minified React error #418` (hydration text-content mismatch) on the sign-in page during the failed login.
- **Root cause:** Unverified. Most likely secondary — the thrown `users:me` Convex Server Error crashing mid-hydration — and should disappear now that prod Convex is deployed. Could also be an independent SSR/client mismatch.
- **Next step:** After confirming live login works, reload /sign-in and check the console. If #418 persists, run the dev build (non-minified React) to get the real component + reproduce.
- **Risk if ignored:** Possible flicker / hydration warning on the auth page; low user impact if the underlying query no longer throws.
- **Tags:** `#bug` `#auth` `#frontend`

### F-558 — `userActions.remove` deletes Clerk identity before cascade can fail; orphan PII on partial-fail

- **Discovered:** 2026-05-28 (validate-feature F-510..F-565 deep bug-hunt)
- **Where:** [apps/web/client/convex/userActions.ts:42-49](apps/web/client/convex/userActions.ts#L42)
- **Symptom:** Account-delete UI calls Clerk `deleteUser` first, then `internal.internal.cascade.deleteUserCascade`. If the cascade mutation throws (Convex read-limit, transient network, schema validator), the Clerk identity is already gone but every Convex `users` row + all FK'd PII (workspaceMembers, projectMembers, providerConnections, hostingProviderConnections, subscriptions, rateLimits, usageRecords, aiUsageEvents, cursors, skills, deployments, projectInvitations, userCanvases, projectOfflinePins, feedbacks) remains.
- **Root cause:** Deliberate "Clerk-first" ordering per the docstring at line 13-18 ("Delete the Clerk identity FIRST so a partial failure cannot leave a re-signinable orphan"). Trade-off prioritizes auth invariant (no re-sign-in into a half-deleted account) over PII completeness, but no retry / dead-letter queue catches the orphaned-Convex case.
- **Next step:** After `deleteClerkIdentity` succeeds, wrap `deleteUserCascade` in a retry loop (3 attempts with exponential backoff) and, on terminal failure, write a row to a new `pendingUserDeletions` table that a cron sweeps until cascade succeeds. Alternative: split cascade into smaller bounded mutations (per-table chunks) so no single mutation hits the 16k read limit on heavy users.
- **Risk if ignored:** GDPR exposure on any partial-failure delete; admin `/admin/usage` dashboard surfaces a "deleted user" row indefinitely; cascade re-run by hand requires a DB engineer.
- **Tags:** `#bug` `#privacy` `#convex` `#tech-debt`

### F-510 / F-563 — Convex `_generated/api.d.ts` is checked-in but stale (missing `layoutGuideStyles`)

- **Discovered:** 2026-05-28 (validate-feature F-510..F-565 deep bug-hunt)
- **Where:** [apps/web/client/convex/_generated/api.d.ts](apps/web/client/convex/_generated/api.d.ts), drift introduced by [apps/web/client/convex/layoutGuideStyles.ts](apps/web/client/convex/layoutGuideStyles.ts)
- **Symptom:** Running `bunx convex codegen` against the live deployment regenerates `_generated/api.d.ts` with two new lines re-exporting `layoutGuideStyles`. The committed copy on `main` is missing those lines, so any client code that does `api.layoutGuideStyles.list()` (or similar) will fail TypeScript compilation against the checked-in generated file until codegen is re-run.
- **Root cause:** Latent — no production consumer of `api.layoutGuideStyles.*` exists yet (verified by `grep`), so CI hasn't caught it. The first commit that adds a consumer will break TS until someone re-runs codegen.
- **Next step:** Run `bunx convex codegen` from `apps/web/client/`, then `git add apps/web/client/convex/_generated/api.d.ts && git commit -m "chore(convex): refresh _generated for layoutGuideStyles"`. Also add an `F-566` row to [docs/feature-catalog.md](docs/feature-catalog.md) section 25 (and matching `T-566` to [docs/test-plan.md](docs/test-plan.md)) per the Change Protocol — the module is on disk but not catalogued.
- **Risk if ignored:** First PR that imports `api.layoutGuideStyles` will fail CI; reviewer will have to ask "did you re-run codegen?" instead of the diff being clean.
- **Tags:** `#docs` `#dx` `#convex`

### F-335 — Aborted restart leaves the button spinner stuck forever

- **Resolved:** 2026-05-28 (backlog user-flow sweep) — verified fixed in code: [restart-sandbox-button.tsx:213-221](apps/web/client/src/app/project/[id]/_components/bottom-bar/restart-sandbox-button.tsx#L213) now resets `restarting` / `restartElapsedSec` / `restartGraceUntilRef` on the abort path before returning. Stale entry.
- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [apps/web/client/src/app/project/\[id\]/_components/bottom-bar/restart-sandbox-button.tsx:214](apps/web/client/src/app/project/[id]/_components/bottom-bar/restart-sandbox-button.tsx#L214)
- **Symptom:** User clicks Restart Sandbox once → cancels (unmounts mid-restart or grace-window expires) → button stays in `restarting=true` spinner state, `restartElapsedSec` keeps the last value, `restartGraceUntilRef.current` keeps the future timestamp. The button is permanently disabled (`disabled={... || restarting}`) until the component remounts.
- **Root cause:** `if (abortController.signal.aborted) return;` exits early without calling `setRestarting(false)` / `setRestartElapsedSec(0)` / `restartGraceUntilRef.current = null`.
- **Next step:** mirror the cleanup block from the success path before the `return`.
- **Risk if ignored:** any abort path (route change during restart, sibling sandbox change, manual cancel) bricks the bottom-bar restart UI; user must reload the page.
- **Tags:** `#bug` `#editor` `#bottom-bar`

### F-313 ImgSelected toolbar variant is dead code — never dispatched

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [apps/web/client/src/app/project/\[id\]/_components/editor-bar/index.tsx:23-57](apps/web/client/src/app/project/[id]/_components/editor-bar/index.tsx#L23) + [editor-bar/img-selected.tsx](apps/web/client/src/app/project/[id]/_components/editor-bar/img-selected.tsx)
- **Symptom:** Selecting an `<img>` element shows the generic `DivSelected` toolbar — the image-specific controls (`src`, `alt`, `fit`, `bg`) listed in catalog F-313 never render.
- **Root cause:** `TAG_TYPES[IMG]: []` is empty and `editor-bar/index.tsx` never imports `ImgSelected`. The `// TODO: Add img and video tag support` comment acknowledges the gap. `getSelectedTag` falls through to `TAG_CATEGORIES.DIV` for `<img>`.
- **Next step:** import `ImgSelected`, populate `TAG_TYPES[IMG] = ['img']`, branch `if (selectedTag === IMG) return <ImgSelected ... />` in `getTopBar()`. Update [docs/feature-catalog.md](docs/feature-catalog.md) row F-313 either to `#disabled` (with `TODO(img-toolbar)`) or to remove the deceptive "img quick-edit" claim until the dispatch lands.
- **Risk if ignored:** catalog lies; QA can't tell whether F-313 is shipped. Test row T-310 ("Select different element types → Correct variant renders") will fail when an `<img>` is selected.
- **Tags:** `#bug` `#editor` `#editor-bar` `#catalog-drift`

### F-361 — `forkBranch` / `createBlankSandbox` swallow errors to console, no user feedback

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [apps/web/client/src/app/project/\[id\]/_components/branch/branch-controls.tsx:29-57](apps/web/client/src/app/project/[id]/_components/branch/branch-controls.tsx#L29)
- **Symptom:** Per catalog, F-361 is `#disabled` on Vercel Sandbox (`TODO(sandbox-fork)`). T-361 expects "clear error per `TODO(sandbox-fork)`". Reality: `forkBranch` and `createBlankSandbox` both `catch (error) { console.error(...); }`. The user sees the dropdown close + the spinner reset; no toast, no inline error, nothing.
- **Root cause:** Error handling is `console.error`-only. The `#disabled` contract isn't enforced at the UI surface.
- **Next step:** replace each `console.error` with `toast.error(...)` falling back to a fixed string when the upstream Convex error has no `message`. Use the existing `'Branch fork is not available on Vercel Sandbox yet.'` copy from the `TODO(sandbox-fork)` note.
- **Partial fix (2026-05-29):** `BranchManager.createBlankSandbox` now surfaces a `toast.error` with the structured `ConvexError` message as the description (see [branch/manager.ts](apps/web/client/src/components/store/editor/branch/manager.ts) + [convex/lib/sandboxErrors.ts](apps/web/client/convex/lib/sandboxErrors.ts)). `forkBranch` (the stub at `branch-controls.tsx`) is still `console.error`-only — this entry stays open for it.
- **Risk if ignored:** user thinks the button is dead; reports a "nothing happens" bug; T-361 keeps failing.
- **Tags:** `#bug` `#editor` `#branch` `#disabled-contract`

### F-333 — ErrorsConsole keys errors by `branchId + content` → duplicate keys

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [apps/web/client/src/app/project/\[id\]/_components/bottom-bar/errors-console.tsx:205](apps/web/client/src/app/project/[id]/_components/bottom-bar/errors-console.tsx#L205)
- **Symptom:** Two identical error strings on the same branch (very common during HMR — `Module not found: 'foo'` repeated) → React warning "Each child in a list should have a unique key" + the second occurrence shares the first's reconciled state (CopyButton "Copied" tick bleeds across rows).
- **Root cause:** `key={\`${error.branchId}-${error.content}\`}` is not unique under repeat errors.
- **Next step:** add `error.id` to `ParsedError` upstream (uuid per parse) and key by that. As a quick fix: `key={\`${error.branchId}-${idx}-${hashOfContent}\`}` using `useId` or the index.
- **Risk if ignored:** subtle UI state leaks between rows; React warning fatigue masks future real warnings.
- **Tags:** `#bug` `#editor` `#bottom-bar`

### F-333 — `CopyButton` setTimeout not cleared on unmount

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [apps/web/client/src/app/project/\[id\]/_components/bottom-bar/errors-console.tsx:66-72](apps/web/client/src/app/project/[id]/_components/bottom-bar/errors-console.tsx#L66)
- **Symptom:** Close the errors popover within 1.5s of clicking Copy → React fires `setCopied(false)` on an unmounted component → "Can't perform a React state update on an unmounted component" warning + held closure.
- **Next step:** store timeout id in a `useRef` and clear it in a cleanup effect; or migrate the copy-flash UX to a `useEffect` driven by `copied` state.
- **Tags:** `#bug` `#editor` `#bottom-bar`

### F-301 — `formatRelativeTime` returns `"NaNm ago"` on invalid date

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [apps/web/client/src/app/project/\[id\]/_components/right-panel/comments-tab/index.tsx:14-25](apps/web/client/src/app/project/[id]/_components/right-panel/comments-tab/index.tsx#L14)
- **Symptom:** If `comment.createdAt` arrives as malformed string (Convex serialization edge case), `new Date(...).getTime()` is `NaN` → time label renders `"NaNm ago"`.
- **Root cause:** no `Number.isNaN(d.getTime())` guard, no future-date guard either (negative `diff`).
- **Next step:** `if (Number.isNaN(d.getTime())) return ''; if (diff < 0) return 'in the future';`. Better yet, swap to `Intl.RelativeTimeFormat`.
- **Risk if ignored:** broken time label across the comment list whenever the upstream serialization changes.
- **Tags:** `#bug` `#editor` `#comments`

### F-360 — Invite-member toast leaks raw Convex error message

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [apps/web/client/src/app/project/\[id\]/_components/members/invite-member-input.tsx:35-37](apps/web/client/src/app/project/[id]/_components/members/invite-member-input.tsx#L35)
- **Symptom:** When `api.projectInvitationActions.create` throws, the raw `error.message` is shown in the toast description. Convex errors can include stack frames, table names, and request IDs.
- **Root cause:** `description: error instanceof Error ? error.message : String(error)` — verbatim pass-through.
- **Next step:** map known error codes (`USER_ALREADY_INVITED`, `INVALID_EMAIL`, `NO_INVITE_CAP`, …) to user-readable strings; only show raw `message` in `NODE_ENV !== 'production'`.
- **Risk if ignored:** internal API names + request IDs visible to end users on every error; unprofessional + small info leak.
- **Tags:** `#bug` `#editor` `#members` `#error-handling`

### F-360 — Invite-member email not normalized client-side (trim + lowercase)

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [apps/web/client/src/app/project/\[id\]/_components/members/invite-member-input.tsx:27-32](apps/web/client/src/app/project/[id]/_components/members/invite-member-input.tsx#L27)
- **Symptom:** `"  Foo@Bar.COM  "` is sent verbatim → server-side dedupe may store it as a different invitation than `foo@bar.com` → pending-invites list shows both rows.
- **Next step:** `inviteeEmail: email.trim().toLowerCase()` before the mutation call. Verify server canonicalizes too.
- **Tags:** `#bug` `#editor` `#members`

### F-402 — NonProjectSettingsModal missing `'use client'`, ARIA, focus trap

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [apps/web/client/src/components/ui/settings-modal/non-project.tsx:1, 104-167](apps/web/client/src/components/ui/settings-modal/non-project.tsx#L1)
- **Symptom (latent):** file uses `useEffect` / `addEventListener` / `observer` / `useStateManager` but doesn't start with `'use client'`. Today every caller is already a client component, so it works; the moment a server component tries to render `<NonProjectSettingsModal />` Next.js refuses. **Symptom (active):** modal has no `role="dialog"`, no `aria-modal`, no focus trap, no initial focus, no focus return — keyboard users tab into the page behind the modal, screen readers don't announce it as a dialog.
- **Next step:** (a) prepend `'use client';`. (b) replace hand-rolled `motion.div` shell with `Dialog` from `@weblab/ui/dialog` (Radix gives focus trap + ARIA + ESC + overlay click for free). Keep slide animation via Radix `forceMount` + existing motion variants.
- **Risk if ignored:** a11y bug (real users today) + latent build break (future regression).
- **Tags:** `#bug` `#editor` `#modal` `#a11y` `#settings`

### F-402 — Settings modal backdrop click closes mid-edit without confirmation

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [apps/web/client/src/components/ui/settings-modal/non-project.tsx:100](apps/web/client/src/components/ui/settings-modal/non-project.tsx#L100)
- **Symptom:** Backdrop click handler dismisses the modal unconditionally. A user typing in an AI/GitHub/Editor tab loses unsaved input on a stray click.
- **Next step:** add `isDirty` state to `useStateManager` settings; gate close with a confirm dialog when any tab is dirty.
- **Tags:** `#bug` `#editor` `#modal` `#ux`

### F-318 — `useDropdownControl` effect omits `isOpen` from deps → stale closure race

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [apps/web/client/src/app/project/\[id\]/_components/editor-bar/hooks/use-dropdown-manager.tsx:137-143](apps/web/client/src/app/project/[id]/_components/editor-bar/hooks/use-dropdown-manager.tsx#L137)
- **Symptom:** Two rapidly-opened dropdowns can leave one stuck open even though the manager thinks it's closed. The reproducer is racy and hard to catch in QA — most users will dismiss-and-retry rather than report.
- **Root cause:** `useEffect` compares `shouldBeOpen !== isOpen` but only depends on `[openDropdownId, id, isOverflow]`. Stale closure when `isOpen` changes via `handleOpenChange` without one of those deps changing.
- **Next step:** add `isOpen` to deps (acceptable — sync direction is openDropdownId → isOpen, not the reverse, so no loop) OR move `isOpen` into a ref read inside the effect.
- **Risk if ignored:** sporadic "the picker won't close" reports the team won't be able to reproduce.
- **Tags:** `#bug` `#editor` `#editor-bar` `#hook`

### F-300 — `activeBranch.id` accessed without null guard (Interactions tab)

- **Resolved:** 2026-05-28 (backlog user-flow sweep) — verified fixed: [list-view.tsx:96,107](apps/web/client/src/app/project/[id]/_components/right-panel/interactions-tab/list-view.tsx#L96) and [timeline-editor.tsx:60-64](apps/web/client/src/app/project/[id]/_components/right-panel/interactions-tab/timeline/timeline-editor.tsx#L60) now use `activeBranch?.id` + early return. Stale entry.
- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [list-view.tsx:96 + 106](apps/web/client/src/app/project/[id]/_components/right-panel/interactions-tab/list-view.tsx#L96) + [timeline-editor.tsx:60](apps/web/client/src/app/project/[id]/_components/right-panel/interactions-tab/timeline/timeline-editor.tsx#L60)
- **Symptom:** `const branchId = editorEngine.branches.activeBranch.id;` — during branch switch `activeBranch` is transiently `null` → TypeError uncaught.
- **Next step:** `const branchId = editorEngine.branches.activeBranch?.id; if (!branchId) return;` in all three sites.
- **Tags:** `#bug` `#editor` `#interactions`

### F-300 — Interactions tab couples to deprecated `style-tab-v2`

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [list-view.tsx:11](apps/web/client/src/app/project/[id]/_components/right-panel/interactions-tab/list-view.tsx#L11) and [timeline-editor.tsx:23](apps/web/client/src/app/project/[id]/_components/right-panel/interactions-tab/timeline/timeline-editor.tsx#L23) import from `../style-tab-v2/sections/*`.
- **Symptom:** Catalog row F-262 tags `style-tab-v2` as `#deprecated`. Whoever deletes it will silently break F-300.
- **Next step:** lift `Section` and `ElementHeaderSection` into a shared `right-panel/_shared/` directory; update both imports.
- **Tags:** `#tech-debt` `#editor` `#cross-feature-coupling`

### F-300..F-402 — Pervasive raw `<button>` + hardcoded English

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** (representative) [comments-tab/index.tsx:63-84, 99-133](apps/web/client/src/app/project/[id]/_components/right-panel/comments-tab/index.tsx#L63), [errors-console.tsx:76-90](apps/web/client/src/app/project/[id]/_components/bottom-bar/errors-console.tsx#L76), [restart-sandbox-button.tsx:254](apps/web/client/src/app/project/[id]/_components/bottom-bar/restart-sandbox-button.tsx#L254), [terminal-area.tsx:132, 160](apps/web/client/src/app/project/[id]/_components/bottom-bar/terminal-area.tsx#L132), [preview-theme-toggle.tsx:54](apps/web/client/src/app/project/[id]/_components/bottom-bar/preview-theme-toggle.tsx#L54), [timeline-editor.tsx:252](apps/web/client/src/app/project/[id]/_components/right-panel/interactions-tab/timeline/timeline-editor.tsx#L252)
- **Symptom:** Raw `<button>` elements with bespoke Tailwind utility classes (color, radius, height overrides) where canonical `<Button>` from `@weblab/ui/button` is required. Also hardcoded English strings throughout (e.g. `'Open'`, `'Resolved'`, `'Toggle Terminal'`, `'Sandbox restarted successfully'`, `'Forking...'`, `'Remove?'`, `'Settings'`).
- **Root cause:** CLAUDE.md button-enforcement + i18n rules not consistently applied during these features' build-out.
- **Next step:** sweep in one PR per feature: replace each raw `<button>` with the appropriate `<Button>` variant (add new variants to `@weblab/ui/button` rather than per-call className overrides), and lift every English string into `apps/web/client/messages/*` under `editor.panels.edit.tabs.*` keys.
- **Risk if ignored:** non-English locales render English; design-system audit will keep flagging the same files.
- **Tags:** `#tech-debt` `#design-system` `#i18n` `#button-enforcement`

### F-334 — Preview theme toggle `postMessage` uses wildcard targetOrigin

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [apps/web/client/src/app/project/\[id\]/_components/bottom-bar/preview-theme-toggle.tsx:33](apps/web/client/src/app/project/[id]/_components/bottom-bar/preview-theme-toggle.tsx#L33)
- **Code:** `frame.contentWindow?.postMessage({ type: THEME_MESSAGE_TYPE, theme }, '*');`
- **Symptom:** Theme broadcast goes to every iframe regardless of origin. For sandboxed iframes that load arbitrary user code, `'*'` is the wrong default — anyone listening for `'weblab:preview-theme'` gets a free signal that they're embedded in Weblab.
- **Next step:** track the expected sandbox origin per frame; pass it as the second arg. Same-origin sandbox iframes can use `'/'` (same-origin only).
- **Tags:** `#bug` `#editor` `#security` `#defense-in-depth`

### F-332 — Terminal theme update doesn't `refresh()` xterm buffer

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [apps/web/client/src/app/project/\[id\]/_components/bottom-bar/terminal.tsx:91-96](apps/web/client/src/app/project/[id]/_components/bottom-bar/terminal.tsx#L91)
- **Symptom:** Toggling app theme while a terminal has existing output keeps the old colors in the buffer; only new writes use the new theme.
- **Next step:** after `xterm.options.theme = …`, call `terminalSession.xterm.refresh(0, terminalSession.xterm.rows - 1)`.
- **Tags:** `#bug` `#editor` `#terminal`

### F-360 — MemberRow avatar `alt={initials}` is meaningless to screen readers

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [apps/web/client/src/app/project/\[id\]/_components/members/member-row.tsx:68](apps/web/client/src/app/project/[id]/_components/members/member-row.tsx#L68)
- **Symptom:** `<AvatarImage src={user.avatarUrl} alt={initials} />` — screen readers announce `"V B"` instead of the actual member name.
- **Next step:** `alt={displayName}` OR `alt=""` (decorative, with name covered by sibling text).
- **Tags:** `#bug` `#editor` `#a11y` `#members`

### F-313 — Editor-bar `restart-sandbox-button.tsx` comment cites CodeSandbox

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [apps/web/client/src/app/project/\[id\]/_components/bottom-bar/restart-sandbox-button.tsx:14-17](apps/web/client/src/app/project/[id]/_components/bottom-bar/restart-sandbox-button.tsx#L14)
- **Symptom:** Comment says `"Real cold-boot times run 30–60s on CodeSandbox"`. CSB was archived 2026-05-24 (CLAUDE.md). Misleads future readers — Vercel Sandbox cold boots are typically 5–15s; the 60s ceiling is over-provisioned.
- **Next step:** rewrite the comment for Vercel Sandbox; consider reducing the ceiling to 30s with a separate slow-path warning toast.
- **Tags:** `#docs` `#brand-leak` `#editor`

### F-134 — invalid Convex ID on settings/access shows generic boundary error (not invalid-id)

- **Discovered:** 2026-05-28 (bug-hunt F-120..F-135)
- **Severity:** LOW (downgraded 2026-05-28 after tracing — **not a hard crash / white-screen**).
- **Where:** [apps/web/client/src/app/project/[id]/settings/access/page.tsx:35](apps/web/client/src/app/project/[id]/settings/access/page.tsx#L35)
- **Symptom:** `const projectId = params.id as Id<'projects'>;` is an unchecked cast. A non-Convex id (e.g. `/project/abc/settings/access`) makes the client `useQuery` throw `ArgumentValidationError`. **This is caught by the parent `/project/[id]/error.tsx` boundary**, which renders "We couldn't open this project" + a "Back to projects" escape. So the user is not stranded — they just get a generic message rather than the dedicated "Invalid project ID" copy.
- **Why not fixed this pass:** the natural fix (validate id shape before the hook) is risky — Convex exposes no client-side `Id` validator, and a hand-rolled regex (`length === 32`, charset) would risk rejecting **valid** ids if Convex's id format ever changes, which is strictly worse than the current graceful fallback. The server-component F-131 fix could be reused only if settings/access were converted to fetch server-side first.
- **Next step (low priority):** when the F-131 `classifyProjectLoadError` helper is mature, give settings/access its own segment `error.tsx` that runs the same classifier on `error.message` and renders `ProjectLoadError variant="invalid-id"` for validator errors. Pure additive, no fragile up-front regex.
- **Risk if ignored:** a typo'd settings deep-link shows "couldn't open this project" instead of "invalid link". Minor copy mismatch; user always has an escape button.
- **Tags:** `#ux` `#auth-gated` `#convex` `#low`

### F-125 — `<iframe>` template preview missing `sandbox` attribute

- **Discovered:** 2026-05-28 (bug-hunt F-120..F-135)
- **Where:** [apps/web/client/src/app/projects/templates/[id]/page.tsx:159-165](apps/web/client/src/app/projects/templates/[id]/page.tsx#L159-L165)
- **Symptom:** `<iframe src={template.previewUrl} …>` has no `sandbox` attribute. `previewUrl` is currently static template data (low risk today), but loading any third-party URL into an iframe without `sandbox` gives that page full access to the parent origin via the `window.top` handle once anti-clickjacking headers permit.
- **Next step:** add `sandbox="allow-scripts allow-same-origin allow-forms"` (or stricter — most marketing pages only need `allow-scripts`). Verify the live previews still render. If a specific template needs an exception, add a per-template opt-out rather than removing the attribute.
- **Risk if ignored:** if `previewUrl` ever becomes user-controlled (e.g. user-submitted templates), this is a stored-XSS / clickjacking vector. Even with static data, an upstream demo host serving malicious JS can pivot through the frame.
- **Tags:** `#security` `#defense-in-depth` `#auth-gated`

### F-120..F-135 import/create surface dead-ends at sandbox provisioning (Figma, Local, Templates, Prompt)

- **Discovered:** 2026-05-28 (bug-hunt F-120..F-135). **Corrected scope** from the
  original "Figma card despite #disabled" framing — the dead-end is **not
  Figma-specific**.
- **Where:** every create/import path that needs a sandbox:
  [import/figma/_context/index.tsx:89](apps/web/client/src/app/projects/import/figma/_context/index.tsx#L89) (`forkSandbox` throws),
  [import/local/_context/index.tsx:146](apps/web/client/src/app/projects/import/local/_context/index.tsx#L146) (`forkSandbox` throws),
  [components/store/create/manager.ts](apps/web/client/src/components/store/create/manager.ts) (`startCreate` / `startPublicGitHubTemplate` throw `UNAVAILABLE_MESSAGE`).
- **Symptom:** the import hub shows three equal cards (local / GitHub / Figma). All of
  them — plus prompt-create and template-create — walk the user through a real-looking
  wizard and then throw at the **finalize / provisioning** step. Figma's PAT path is
  genuinely intended to work (only the OAuth *callback* is `#disabled` per
  [callback/figma/page.tsx](apps/web/client/src/app/callback/figma/page.tsx)); the
  wizard stubs out at `forkSandbox`, identical to local import.
- **Root cause:** this is the tracked `TODO(sandbox-port)` — the legacy `api.sandbox.*`
  tRPC routes have no Convex equivalents yet — compounded by the **Vercel 402 blocker**
  (see that backlog entry). Gating one card (Figma) would be inconsistent and mask the
  real, broader gap.
- **Next step:** do NOT band-aid individual cards. Land the sandbox-port (or the
  snapshot-resume fast path via `VERCEL_BLANK_SNAPSHOT_ID`) so all paths provision, OR —
  if create stays disabled for a release — gate **all** sandbox-dependent entry points
  behind one flag and show a single consistent "create is temporarily unavailable" state
  (the prompt hero already does this via `UNAVAILABLE_MESSAGE`). Track under the existing
  sandbox-port / Vercel-402 entries.
- **Risk if ignored:** users complete a multi-step wizard (local folder pick / Figma frame
  select / template choose) and get an opaque error at the last step — wasted intent across
  every create surface, not just Figma.
- **Tags:** `#bug` `#ux` `#auth-gated` `#sandbox` `#tracked`

### F-134 — no client-side email validation before invite send

- **Discovered:** 2026-05-28 (bug-hunt F-120..F-135)
- **Where:** [apps/web/client/src/app/project/[id]/settings/access/page.tsx:184-190](apps/web/client/src/app/project/[id]/settings/access/page.tsx#L184-L190)
- **Symptom:** `disabled={!inviteEmail.trim() || isCreatingInvite}` only blocks an empty string. Strings like `"not an email"` reach `createInviteAction`, which then surfaces whatever server-side validation Convex returns (currently undefined behavior).
- **Next step:** validate with a cheap regex (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) or `zod.string().email().safeParse()` before enabling the button. Mirror the validation Convex applies on `projectInvitations.create` so the user sees one consistent message.
- **Risk if ignored:** noisy "Failed to send invite" toasts with no actionable detail. Possible cost on transactional email provider if invalid addresses get retried.
- **Tags:** `#bug` `#ux` `#auth-gated`

### ESLint config — `react-hooks/exhaustive-deps` rule unregistered at inline disable sites

- **Discovered:** 2026-05-28 (bug-hunt F-120..F-135)
- **Where:** repo-wide. Confirmed sites: [apps/web/client/src/app/projects/import/local/_components/verify-project.tsx:36](apps/web/client/src/app/projects/import/local/_components/verify-project.tsx#L36), [apps/web/client/src/app/projects/_components/select/use-screenshot-backfill.ts:127](apps/web/client/src/app/projects/_components/select/use-screenshot-backfill.ts#L127).
- **Symptom:** `bunx eslint <file>` reports `warning: Definition for rule 'react-hooks/exhaustive-deps' was not found  react-hooks/exhaustive-deps` on every `// eslint-disable-next-line react-hooks/exhaustive-deps` comment. The rule is registered in [tooling/eslint/react.js](tooling/eslint/react.js) and the flat config in [apps/web/client/eslint.config.js](apps/web/client/eslint.config.js) spreads `reactConfig`, so the rule should be loaded. The fact that ESLint reports the disable directive as referencing an unknown rule means a later flat-config layer is shadowing the plugin map for the file.
- **Next step:** add an explicit `plugins: { 'react-hooks': hooksPlugin }` to whichever layer in `apps/web/client/eslint.config.js` is shadowing it (likely the storybook layer added last). Verify by re-running `bunx eslint` on the two files above — the "Definition for rule … was not found" should disappear. While there, audit `@next/next/no-img-element` — same symptom across `projects/_components/select/*.tsx` (multiple sites).
- **Risk if ignored:** every inline `eslint-disable-next-line react-hooks/exhaustive-deps` is currently a no-op. If the rule were to actually fire, several real dep-array bugs may be hiding behind suppressions that don't suppress.
- **Tags:** `#infra` `#lint` `#tech-debt`

### F-128 — GitHub setup.tsx still relies on `any`-typed responses on multiple paths

- **Discovered:** 2026-05-28 (bug-hunt F-120..F-135)
- **Where:** [apps/web/client/src/app/projects/import/github/_components/setup.tsx](apps/web/client/src/app/projects/import/github/_components/setup.tsx) lines 40, 51, 67-73
- **Symptom:** `(org: any)`, `(repo: any)`, and `.includes(...)` chains on optional GitHub API fields. The `filteredRepositories` filter was hardened this session (`?.` on `owner` / `name` / `full_name`), but the surrounding handlers (`handleOrganizationSelect`, `handleRepositorySelect`) still rely on the same untyped shape, and downstream sorting/display will throw if the shape drifts.
- **Next step:** import the typed shape from the GitHub OAuth client (`@octokit/rest` or whatever the connector uses), replace `any` with `RestEndpointMethodTypes["repos"]["listForAuthenticatedUser"]["response"]["data"][number]`, drop the unsafe member-access warnings, and add a runtime fall-back for repos with `owner: null`.
- **Risk if ignored:** silent regressions when GitHub adds / nulls a field; archived & transferred repos are most likely to surface this.
- **Tags:** `#bug` `#tech-debt` `#integration`

### CreateManager mutates `this.error` outside `runInAction`

- **Discovered:** 2026-05-28 (bug-hunt F-120..F-135)
- **Where:** [apps/web/client/src/components/store/create/manager.ts:122,143,205](apps/web/client/src/components/store/create/manager.ts#L122)
- **Symptom:** `this.error = null` runs in async function body before the explicit `runInAction(...)` block. Only a problem if MobX strict mode is enabled — current setup is not strict, but auto-binding via `makeAutoObservable` does enforce strict-mode rules in some MobX builds.
- **Next step:** wrap each pre-check assignment in `runInAction(() => { this.error = null; })` for consistency with the rest of the file. Cheap, no behavior change.
- **Risk if ignored:** if MobX is ever configured with `enforceActions: 'always'`, every entry point starts crashing on the first line.
- **Tags:** `#tech-debt`

### F-453 — `PostHogProvider` static import defeats consent-gated dynamic-import claim

- **Discovered:** 2026-05-28 (validate-feature F-450..F-453 deeper pass)
- **Where:** [apps/web/client/src/components/telemetry-provider.tsx:9](apps/web/client/src/components/telemetry-provider.tsx#L9)
- **Symptom:** Cold load of `/pricing` (anonymous, no `weblab.consent` cookie) fetches `_next/static/chunks/node_modules_posthog-js_*.js` regardless. The file's own comment claims "Dynamic import for posthog-js keeps the SDK out of the critical-path bundle on landing/login/dashboard until cookie consent fires" — partially false because `import { PostHogProvider as PHProvider } from 'posthog-js/react'` is static.
- **Next step:** `const PHProvider = lazy(() => import('posthog-js/react').then(m => ({ default: m.PostHogProvider })))`, wrap the provider return in `<Suspense fallback={children}>`. Verify chunk does NOT appear in `_next/static/chunks` on anon `/pricing`.
- **Risk if ignored:** ~50KB posthog-js shipped on every landing/login/marketing surface for visitors who never consent. Privacy and performance regression.
- **Tags:** `#tech-debt` `#perf` `#privacy` `#telemetry`

### ~~F-453 — Cookie consent read only at mount; no runtime re-init~~ FALSE ALARM (resolved 2026-05-28)

- **Resolved:** `apps/web/client/src/app/_components/cookie-consent.tsx:52-56` calls `window.location.reload()` inside `onAccept`. The next mount runs the init effect with the consent cookie present, so SDKs DO initialize on accept. No code change needed.

### ~~F-451 — Pricing table CTA flickers for signed-in users while query loads~~ FIXED (2026-05-28)

- **Resolved:** `pricing-table/index.tsx` now distinguishes `authResolving` (null cookie OR loading user) from `isUnauthenticated`. Passes `isAuthLoading` prop to FreeCard + ProCard. CTAs render a disabled loading spinner while auth is resolving so the signed-in visitor cannot accidentally trigger the auth modal during the flicker window.

### F-452 — Avatar dropdown Convex queries fire unconditionally

- **Discovered:** 2026-05-28 (validate-feature F-450..F-453 deeper pass)
- **Where:** [apps/web/client/src/components/ui/avatar-dropdown/index.tsx:53](apps/web/client/src/components/ui/avatar-dropdown/index.tsx#L53), [apps/web/client/src/components/ui/avatar-dropdown/plans.tsx:19-20](apps/web/client/src/components/ui/avatar-dropdown/plans.tsx#L19-L20)
- **Symptom:** `useQuery(api.users.me, {})`, `useQuery(api.subscriptions.get, {})`, `useQuery(api.usage.get, {})` all run unconditionally. Parent routes currently gate the avatar render behind `isSignedIn`, so this is safe today — but the components carry no defensive auth-cookie gate of their own. Any future surface that mounts them in an unauthenticated context (Storybook, design-system page, marketing) flooded with 401s.
- **Next step:** mirror the `useHasAuthCookie() === true ? {} : 'skip'` pattern from `use-subscription.tsx` and `telemetry-provider.tsx`.
- **Risk if ignored:** defensive layer missing; first leak surfaces as a console flood when someone embeds the avatar somewhere new.
- **Tags:** `#tech-debt` `#auth-gated`

### ~~F-450 — Legacy promotion clipboard handler shows false success~~ FIXED (2026-05-28)

- **Resolved:** Handler is now async with try/catch on `navigator.clipboard.writeText`. On reject, falls back to a programmatic `document.execCommand('copy')` via a hidden textarea. Toast reflects real outcome — `toast.success('Copied to clipboard')` only on confirmed write, `toast.error('Could not copy code')` with a "select and copy manually" hint if both paths fail. Promo code revenue path no longer at risk.

### F-450 — `legacy-promotion.tsx` imports from `framer-motion` while siblings use `motion/react`

- **Discovered:** 2026-05-28 (validate-feature F-450..F-453 deeper pass)
- **Where:** [apps/web/client/src/components/ui/pricing-modal/legacy-promotion.tsx:6](apps/web/client/src/components/ui/pricing-modal/legacy-promotion.tsx#L6)
- **Symptom:** This file imports `motion`, `AnimatePresence` from `framer-motion`. Every other file in the pricing UI (`index.tsx`, `free-card.tsx`, `pro-card.tsx`, `enterprise-card.tsx`) imports from `motion/react`. Both libs ship to the bundle for one feature.
- **Next step:** replace `from 'framer-motion'` with `from 'motion/react'` in legacy-promotion.tsx. Confirm `bun build` removes the `framer-motion` chunk if no other importer remains.
- **Risk if ignored:** wasted bundle size; future drift as one lib's API evolves and the other stagnates.
- **Tags:** `#tech-debt` `#perf`

### F-453 — React-DOM dev warning on cold pricing load (source unknown)

- **Discovered:** 2026-05-28 (validate-feature F-450..F-453 deeper pass)
- **Where:** unknown — fires 8× on cold `/pricing` anon load. Warning text is React-DOM's "Can't perform a React state update on a component that hasn't mounted yet." Not present in any of the four F-450..F-453 files.
- **Symptom:** Dev console pollution. No user-visible effect, but indicates a render-time `setState` side-effect in a sibling provider (motion, radix, clerk, or telemetry-provider's own dynamic-import closures racing strict-mode remount).
- **Next step:** add `Error.captureStackTrace` shim in dev to surface the offending component, or bisect by progressively unmounting providers in `layout.tsx`.
- **Risk if ignored:** real race condition may produce stale state in prod under load. Currently masked because the warning is dev-only.
- **Tags:** `#bug` `#react`

### F-437 — Uploaded favicon / OG image path uses raw `file.name`

- **Discovered:** 2026-05-28 (validate-feature F-420..F-439 deeper pass)
- **Where:** [apps/web/client/src/components/ui/settings-modal/site/index.tsx:88,101](apps/web/client/src/components/ui/settings-modal/site/index.tsx#L88-L101)
- **Symptom:** `faviconPath = \`/${uploadedFavicon.name}\`` and the OG path are built from the raw `File.name`. If the user picks a file with spaces, unicode, parens, or path-separator characters in the name, the metadata URL ends up un-encoded and may fail to resolve in production (or, with crafted names like `../foo.png`, produce odd URLs).
- **Next step:** sanitize the filename before constructing the URL — e.g. `encodeURIComponent(stripDirectorySegments(file.name))` — or read the canonical path returned by `editorEngine.image.upload(...)` instead of reconstructing it on the client.
- **Risk if ignored:** broken favicon / OG image after upload for any user whose filename isn't `[a-z0-9.-]`.
- **Tags:** `#bug` `#editor` `#cms`

### F-360 — `projectInvitations.accept` does not trim whitespace before email lookup

- **Resolved:** 2026-05-28 (backlog user-flow sweep) — `isEmailMatch` now trims both sides ([projectInvitations.ts:14-15](apps/web/client/convex/projectInvitations.ts#L14)) so the accept-path comparison is whitespace-insensitive (fixes legacy rows too); `create` now canonicalizes with `.trim().toLowerCase()` and the legacy fallback uses the trimmed value, so new rows can't store stray whitespace.
- **Discovered:** 2026-05-28 (validate-feature F-360 deeper pass)
- **Where:** [apps/web/client/convex/projectInvitations.ts:421](apps/web/client/convex/projectInvitations.ts#L421)
- **Symptom:** `args.inviteeEmail.toLowerCase()` is used as the key to look up the `users` row by email. If the upstream caller (sign-in flow, accept page) passes the email with leading/trailing whitespace — easy to do when a user pastes from another app — the lookup misses and the invitation can never be accepted by that account.
- **Next step:** `const lcEmail = args.inviteeEmail.trim().toLowerCase();` (and apply the same trim everywhere `inviteeEmail` is read/written). Match the canonical form Clerk's `clerkWebhooks.ts` writes when it normalizes user emails.
- **Risk if ignored:** silent invite-accept failures with no obvious user-facing diagnostic.
- **Tags:** `#bug` `#convex` `#auth`

### Vercel Sandbox returns 402 (Payment Required) — dev team on hobby plan

- **Discovered:** 2026-05-28 (validate-feature F-300..F-361 + F-400..F-402 run)
- **Where:** [apps/web/client/convex/projectActions.ts:239](apps/web/client/convex/projectActions.ts#L239) `VercelSandboxProvider.createProject` call → `@vercel/sandbox` SDK `inferScope` → `POST /v11/projects` returns 402
- **Symptom:** Console floods with `[CONVEX A(projectActions:createBlank)] Server Error … Status code 402 is not ok at async handler (../convex/projectActions.ts:239:16)` after the user clicks **Start blank → Next.js** or **Start blank → Static HTML**. Project never created, dashboard stays in "Start your first project" state.
- **Root cause:** Vercel team `team_06tI3EaV5vk3s9b5gwGlnMJA` (`ludvighedin15-gmailcoms-projects`) is on the **`hobby`** billing plan (`/v2/teams?limit=20` → `"billing":{"plan":"hobby","planIteration":"plus"}`). Vercel Sandbox is a paid feature. The SDK's `inferScope` (in `node_modules/@vercel/sandbox/dist/auth/project.cjs`) auto-creates a default project via `POST /v11/projects` inside `tryTeam`; the hobby plan rejects that with 402. The SDK's `isSkippableTeamError` treats 402 as "skip team", but with one explicit team it has nothing to skip to.
- **Side observation:** Direct `POST /v1/sandboxes?teamId=…` with the same token returned HTTP 200 (sandbox actually provisioned). The 402 is specifically on the project auto-create step inside `inferScope`. The SDK ignores `VERCEL_PROJECT_ID` from `getCredentials()` — it always builds its own "vercel-sandbox-default-project".
- **Adjacent fix already applied during this run:** the three `VERCEL_*` env vars in `.env.local` are double-quoted (e.g. `VERCEL_TOKEN="vcp_…"`). Previous `bunx convex env set` stored the quotes inside the value, so the SDK saw an invalid token and returned 403. Stripping quotes + re-setting via `… | tr -d '"'` cleared the 403 layer — the 402 underneath is the real blocker.
- **Next step:** (a) upgrade the team to Pro, OR (b) point `VERCEL_TEAM_ID` / `VERCEL_PROJECT_ID` at a different team that has Sandbox enabled, OR (c) bake a snapshot via `scripts/create-vercel-template.mjs` and set `VERCEL_BLANK_SNAPSHOT_ID` so `VercelSandboxProvider.createProject` takes the snapshot-resume fast path (`packages/code-provider/src/providers/vercel-sandbox/index.ts:496`) which bypasses `inferScope`.
- **Risk if ignored:** every project-create path on dev (F-121, F-122, F-135) is broken; no one can validate any `#editor` feature against dev Convex. Editor entry F-131 unreachable through normal flow.
- **Tags:** `#bug` `#infra` `#blocker` `#convex` `#vercel` `#billing`

### Convex dev deployment was stale before validate-feature run (now pushed)

- **Discovered:** 2026-05-28 (validate-feature F-300..F-361 + F-400..F-402 run)
- **Where:** dev Convex deployment `avid-gnat-539`
- **Symptom:** `projectActions:createBlank` threw `CSB_API_KEY not configured at ../convex/projectActions.ts:198:24` even though source line 198 is a comment and `CSB_API_KEY` is not referenced in `apps/web/client/convex/**`.
- **Root cause:** source contains the CodeSandbox→Vercel migration (commits `5e8dca441` + `de3dc9269`, 2026-05-24) but the dev Convex deployment had never been pushed since. Resolved this run via `bunx convex dev --once` from `apps/web/client`.
- **Next step:** Add a "post-rebase / post-merge" step to `docs/agent-context/development-setup.md` documenting that backend changes under `apps/web/client/convex/**` are not picked up by Next.js HMR — they require `bunx convex dev` to be running OR a one-shot `--once` push. Consider a `predev` hook in `apps/web/client/package.json` that runs `bunx convex dev --once`.
- **Risk if ignored:** every agent / contributor will lose hours to "I edited the Convex function but the error still references the old code" until they find this trap.
- **Tags:** `#docs` `#dx` `#convex` `#infra`

### Convex dev deployment missing VERCEL_* env vars (now set)

- **Discovered:** 2026-05-28 (validate-feature F-300..F-361 + F-400..F-402 run)
- **Where:** dev Convex deployment `avid-gnat-539`
- **Symptom:** After the Convex deploy fix above, `createBlank` then threw `VERCEL_TOKEN not configured. Vercel Sandbox is the only runtime; set VERCEL_TEAM_ID, VERCEL_PROJECT_ID, and VERCEL_TOKEN` at `convex/projectActions.ts:227`.
- **Root cause:** `bunx convex env list` showed only `CLERK_JWT_ISSUER_DOMAIN` + `CLERK_WEBHOOK_SECRET`. The Vercel-migration commits added Convex-side reads of three new env vars but the deployment env was never updated. Set this run via `bunx convex env set VERCEL_TOKEN/VERCEL_TEAM_ID/VERCEL_PROJECT_ID` (values pulled from `apps/web/client/.env.local`).
- **Next step:** Add the three Vercel env vars to the canonical Convex env list in `docs/agent-context/development-setup.md` (currently undocumented). Consider a tiny `bunx convex env set` script that reads from `.env.local` for shared dev vars.
- **Risk if ignored:** any future spin-up of a fresh Convex deployment, or any rotation of the dev env, has to re-discover this manually.
- **Tags:** `#docs` `#dx` `#convex` `#infra`

### Test-plan coverage gap — F-300..F-361 + F-400..F-402 have 0 unit tests

- **Discovered:** 2026-05-28 (validate-feature F-300..F-361 + F-400..F-402 run)
- **Where:** `docs/test-plan.md` rows T-300 / T-301 / T-310..T-313 / T-330..T-334 / T-340..T-344 / T-360 / T-361 / T-400..T-402
- **Symptom:** Every test row in scope is type `E` (end-to-end via preview) or `M` (manual). Zero `U` (unit) or `I` (integration) coverage for 32 features.
- **Next step:** Add `U` tests for pure utilities in `editor-bar/utils/` (F-319) and pure helpers in `editor-bar/hooks/` (F-318) — these are testable without a live editor. Add RTL + Convex test-client `I` tests for F-301 (`projectComments` / `commentReplies`) and F-360 (`projectInvitations` / `projectMembers`) which exercise Convex mutations directly without the editor.
- **Risk if ignored:** every validation pass on these 32 features blocks on Phase 3 — when Phase 3 infra breaks (as it did this run), validation has no fallback signal.
- **Tags:** `#test-gap`

### F-471 — `toolCallCount` over-counts `tool-input-start` and other trigger events

- **Discovered:** 2026-05-28 (deeper bug-hunt pass on F-470..F-479)
- **Where:** [apps/web/client/src/app/api/chat/route.ts:524-526](apps/web/client/src/app/api/chat/route.ts#L524)
- **Symptom:** `(responseMessage?.parts ?? []).filter((p) => p.type?.startsWith('tool-')).length` counts every `tool-*` part — including `tool-input-start`, `tool-input-delta`, `tool-input-available`, etc. — as a "tool call" recorded in `aiUsageEvents.toolCallCount`.
- **Root cause:** AI SDK stream parts are a discriminated union; only `tool-call` / `tool-result` represent semantic invocations. The substring filter is too permissive.
- **Next step:** narrow to the actual call/result variants, or count distinct `toolCallId`s.
- **Risk if ignored:** inflated tool-call metrics in usage dashboards; cost-attribution per turn skewed; no user-facing impact.
- **Tags:** `#bug` `#telemetry`

### F-473 — `chat-images/[id]` double-allocates the response buffer

- **Discovered:** 2026-05-28 (deeper bug-hunt pass on F-470..F-479)
- **Where:** [apps/web/client/src/app/api/chat-images/[id]/route.ts:31-32](apps/web/client/src/app/api/chat-images/[id]/route.ts#L31)
- **Symptom:** `Buffer.from(entry.b64, 'base64')` decodes into a Buffer, then `new Uint8Array(buffer)` copies that into a fresh Uint8Array — two allocations of the same payload, doubling peak memory for large images.
- **Next step:** `return new Response(buffer, ...)` (Node 18+ undici accepts `Buffer` directly), or `Buffer.from(entry.b64, 'base64').buffer` to hand off the underlying `ArrayBuffer`.
- **Risk if ignored:** memory churn at scale; harmless functionally.
- **Tags:** `#perf`

### F-474 — `X-Trace-Id` exposed to client on `inline-edit`

- **Discovered:** 2026-05-28 (deeper bug-hunt pass on F-470..F-479)
- **Where:** [apps/web/client/src/app/api/ai/inline-edit/route.ts:253-256](apps/web/client/src/app/api/ai/inline-edit/route.ts#L253)
- **Symptom:** Server-generated `traceId` is returned in the response headers. Trace IDs are tied to Langfuse spans + usage events and are not strictly secret, but exposing them to the client lets anyone correlate their session with internal observability data and (combined with another bug) potentially poison telemetry across users.
- **Next step:** decide policy — either drop the header in production, or keep it only when an opted-in dev/debug header is present on the request.
- **Risk if ignored:** low — observability surface only. Worth a policy call.
- **Tags:** `#security` `#observability`

### F-471 — `USAGE_LIMIT_REACHED` is detected via substring match

- **Discovered:** 2026-05-28 (deeper bug-hunt pass on F-470..F-479)
- **Where:** [apps/web/client/src/app/api/chat/helpers/usage.ts:92](apps/web/client/src/app/api/chat/helpers/usage.ts#L92)
- **Symptom:** `error.message.includes('USAGE_LIMIT_REACHED')` is how the route discovers that Convex hit the cap. If Convex wraps the error differently in a future runtime (already does in different layers), the substring miss flips the code to the "transient error, don't penalize the user" branch — silently granting free LLM responses to everyone over quota.
- **Next step:** throw a typed `ConvexError` from `usage.increment` and `instanceof` check it, OR pin the message format with an explicit reserved prefix and an integration test that boots Convex and asserts the message shape.
- **Risk if ignored:** future Convex upgrade silently disables the quota cap.
- **Tags:** `#bug` `#billing` `#convex` `#brittle`

### F-472 — Summarize refunds the user credit even when the LLM was actually called

- **Discovered:** 2026-05-28 (deeper bug-hunt pass on F-470..F-479)
- **Where:** [apps/web/client/src/app/api/chat/summarize/route.ts:162-164](apps/web/client/src/app/api/chat/summarize/route.ts#L162)
- **Symptom:** `summarizeConversation()` runs the LLM (cost incurred at OpenRouter). If it returns `null` (e.g. truncation produced no usable summary), `refundOnce()` reverts the user's quota deduction. The user pays nothing, but Weblab still pays OpenRouter.
- **Root cause:** the refund path treats "no result" as "no work done"; in reality it means "work done, result discarded".
- **Next step:** distinguish "no summary produced" (refund) from "summary attempted but LLM returned empty / parse failed" (keep deduction; log + metric). Or accept the asymmetry and document it as a policy choice.
- **Risk if ignored:** small cost leak proportional to summarizer flakiness.
- **Tags:** `#bug` `#billing` `#design-question`

### F-479 — Invalid date strings in `banner.startsAt` / `banner.endsAt` fail open

- **Discovered:** 2026-05-28 (deeper bug-hunt pass on F-470..F-479)
- **Where:** [apps/web/client/src/app/api/promo-resume/route.ts:37-42](apps/web/client/src/app/api/promo-resume/route.ts#L37)
- **Symptom:** `new Date('not-a-date')` returns `Invalid Date`. `Invalid Date > now` and `Invalid Date < now` both evaluate `false` (NaN comparison), so a banner whose `startsAt` or `endsAt` is a malformed string is treated as currently active. A bad commit to `promo-banners.ts` could re-enable an expired promo without anyone noticing.
- **Next step:** validate `startsAt` / `endsAt` at the `PromoBanner` schema layer (zod / TS guard), and bail out (fallback redirect) on `Number.isNaN(date.getTime())` here.
- **Risk if ignored:** stale promo banners silently extend; low blast radius today.
- **Tags:** `#bug` `#billing` `#defensive`

### F-471 / F-474 — `code` field on 501 response is a string while the rest of the API uses numbers

- **Discovered:** 2026-05-28 (deeper bug-hunt pass on F-470..F-479)
- **Re-checked:** 2026-05-28 (user-stopping-bug fix pass) — **not user-stopping after all.**
- **Where:** [apps/web/client/src/app/api/chat/route.ts:306](apps/web/client/src/app/api/chat/route.ts#L306), [apps/web/client/src/app/api/ai/inline-edit/route.ts:182](apps/web/client/src/app/api/ai/inline-edit/route.ts#L182), [apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-messages/error-message.tsx:27](apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-messages/error-message.tsx#L27)
- **Reality:** the client `error-message.tsx` falls through any non-402 case to `errorMessage = parsed.error || chatError.toString();`, so the helpful "Provider X routing is not yet implemented on hosted web. Use the desktop app for CLI providers." text DOES render correctly. The mismatch is API consistency hygiene, not a broken user flow.
- **Next step (low priority):** still worth standardizing the field shape (`code: number`, optional `errorCode: string`) so the client can branch deliberately rather than rely on fall-through.
- **Risk if ignored:** none today; brittle if the client component grows additional branches.
- **Tags:** `#tech-debt` `#api-consistency`

### F-471 — Non-EDIT chat types skip the atomic usage increment

- **Discovered:** 2026-05-28 (validate-feature F-470..F-479 run)
- **Where:** [apps/web/client/src/app/api/chat/route.ts:338-350](apps/web/client/src/app/api/chat/route.ts#L338)
- **Symptom:** `incrementUsage` only fires when `chatType === ChatType.EDIT && !isLocalModel`. Every other chat type (`ASK`, `CREATE`, `PLAN`, …) is gated only by the upstream `checkMessageLimit` read.
- **Root cause:** original design assumed only EDIT incurs paid spend; ASK/CREATE/PLAN now also burn OpenRouter tokens.
- **Next step:** decide policy with product. Either (a) increment on every non-local chat type, or (b) keep current rule and document explicitly. If (a), mirror inline-edit's refund-on-failure path.
- **Risk if ignored:** concurrent attackers can fan out ASK/PLAN requests under the daily limit and burn OpenRouter spend with only a read-then-act precheck protecting the budget.
- **Tags:** `#bug` `#billing` `#concurrency`

### F-471 / F-472 — TOCTOU between `checkMessageLimit` and `incrementUsage`

- **Discovered:** 2026-05-28 (validate-feature F-470..F-479 run)
- **Where:** [apps/web/client/src/app/api/chat/route.ts:187](apps/web/client/src/app/api/chat/route.ts#L187), [apps/web/client/src/app/api/chat/summarize/route.ts:53](apps/web/client/src/app/api/chat/summarize/route.ts#L53), [apps/web/client/src/app/api/chat/helpers/usage.ts:18](apps/web/client/src/app/api/chat/helpers/usage.ts#L18)
- **Symptom:** A user at `limit - 1` can race N concurrent requests; all pass the precheck, only one increment lands, the rest stream free.
- **Root cause:** `checkMessageLimit` is a read-then-act gate; the only atomic gate is the increment mutation itself.
- **Next step:** drop the precheck (rely solely on `incrementUsage`'s `USAGE_LIMIT_REACHED`) OR precheck + atomic increment on every paid path.
- **Risk if ignored:** quota bypass under load — small but consistent revenue leak.
- **Tags:** `#bug` `#billing` `#concurrency`

### ~~F-472 — Background summarizer charges credit every time client fires~~ FIXED (2026-05-28)

- **Discovered:** 2026-05-28 (validate-feature F-470..F-479 run)
- **Resolved:** 2026-05-28 (user-stopping-bug fix pass)
- **Where:** [apps/web/client/src/app/api/chat/summarize/route.ts](apps/web/client/src/app/api/chat/summarize/route.ts)
- **Fix:** Added two cheap server-side gates in front of the LLM call:
  1. Same-tip skip — read `conversations.getSummary` and 204 immediately if `upToMessageId` already matches the last incoming message id.
  2. Per-process cooldown — `Map<conversationId, number>` with 60s minimum interval; redundant fires within the window 204 without charging the user.
- **Caveat:** the cooldown is in-process; multi-replica deployments could still fire once per replica per cooldown window. That is acceptable today and far below the unbounded burst the buggy/malicious client could previously generate.

### F-475 — Tab-complete metering is fire-and-forget AFTER generation

- **Discovered:** 2026-05-28 (validate-feature F-470..F-479 run)
- **Where:** [apps/web/client/src/app/api/ai/tab-complete/route.ts:177](apps/web/client/src/app/api/ai/tab-complete/route.ts#L177)
- **Symptom:** Increment is `void` and runs after `generateTabCompletion` resolves. A fast keystroke spammer never sees the limit because dozens of in-flight requests resolve before any increment lands.
- **Next step:** either gate up-front (precheck + atomic increment), or add a per-user in-flight cap so concurrent completions can't exceed a small constant N.
- **Risk if ignored:** cheap concurrent abuse with no daily-cap pressure.
- **Tags:** `#bug` `#billing` `#concurrency`

### F-476 — In-memory rate limit on transcription is per-process, not per-user

- **Discovered:** 2026-05-28 (validate-feature F-470..F-479 run)
- **Where:** [apps/web/client/src/app/api/transcribe/helpers/rate-limit.ts:12](apps/web/client/src/app/api/transcribe/helpers/rate-limit.ts#L12)
- **Symptom:** Counter lives in `Map` on each Node replica. On Railway with N replicas a user gets `N × 10`/min instead of 10/min. Compounded by the fact that transcription has no daily quota — only this anti-spam limiter — so cost cap is effectively `N × 10 × MAX_AUDIO_BYTES`/minute per attacker.
- **Next step:** move to Convex (`api.rateLimits.*` already used by chat) so the limit is global. While there, add a daily Whisper-spend counter so the cost ceiling does not scale with replicas.
- **Risk if ignored:** unbounded Whisper / OpenRouter spend under abuse; documented in code as "not a replacement for distributed rate limiting" but ops cap is the only safety net today.
- **Tags:** `#bug` `#billing` `#infra`

### ~~F-471 — Chat path: `aiUsageEvents.insert` + `replaceConversationMessages` awaited inside `onFinish` with no timeout~~ FIXED (2026-05-28)

- **Discovered:** 2026-05-28 (validate-feature F-470..F-479 run)
- **Resolved:** 2026-05-28 (user-stopping-bug fix pass)
- **Where:** [apps/web/client/src/app/api/chat/route.ts](apps/web/client/src/app/api/chat/route.ts)
- **Fix:** Added `runWithTimeout()` helper (8s) wrapping both `fetchMutation(api.messages.replaceConversationMessages, …)` and `built.finalizeUsage(…)` inside `onFinish`. On timeout the helper resolves `undefined` and logs `[chat] <label> exceeded …ms; closing stream and continuing best-effort` so the response can close even when Convex stalls. Persistence becomes best-effort under degraded backend conditions, which is the right tradeoff: users no longer see a finished bubble that "never completes."

### F-471 — Chat: client-supplied `messages` array has no schema on shape

- **Discovered:** 2026-05-28 (validate-feature F-470..F-479 run)
- **Where:** [apps/web/client/src/app/api/chat/route.ts:133-142](apps/web/client/src/app/api/chat/route.ts#L133); also `summarize/route.ts:33`
- **Symptom:** `messages: z.array(z.any())` — only byte-bounds enforced. If anything downstream trusts `role: 'system'` from the user-supplied array, a caller can inject system prompts.
- **Next step:** narrow schema to `{ role: 'user' | 'assistant'; parts: ... }`. Confirm `buildChatRequest` / `toDbMessage` re-validate or strip roles.
- **Risk if ignored:** prompt injection vector if any builder ever forwards role verbatim.
- **Tags:** `#security` `#chat`

### F-477 — `/api/email-capture` is unauthenticated with no rate-limit or captcha

- **Discovered:** 2026-05-28 (validate-feature F-470..F-479 run)
- **Where:** [apps/web/client/src/app/api/email-capture/route.ts](apps/web/client/src/app/api/email-capture/route.ts)
- **Symptom:** Anyone can POST any volume of junk emails into n8n. Validation only catches bad shapes; not bots.
- **Next step:** Cloudflare Turnstile or hCaptcha on the marketing form + per-IP rate-limit at the edge. Soft-fail to "captured locally only" on captcha failure.
- **Risk if ignored:** n8n list pollution and outbound `fetch` amplification from Weblab IP.
- **Tags:** `#abuse` `#marketing`

### F-470..F-479 — Most REST routes have no automated test coverage

- **Discovered:** 2026-05-28 (validate-feature F-470..F-479 run)
- **Where:** [docs/test-plan.md](docs/test-plan.md) section 22 — T-471, T-472, T-473, T-474, T-475, T-476, T-477, T-478, T-479 all marked `[ ]`.
- **Symptom:** 8 of 10 REST features rely on Clerk/Convex/Supabase context and have no Bun-level tests.
- **Next step:** add a thin integration harness that mocks Clerk's `auth()`, Convex's `fetchQuery`/`fetchMutation`, and Supabase to exercise the POST/GET surface with synthetic bodies. Pattern lives in [apps/web/client/test/setup.ts](apps/web/client/test/setup.ts) for tRPC; extend for Convex/Clerk.
- **Risk if ignored:** regressions in chat / inline-edit / tab-complete / transcribe / promo-resume land silently until users feel them.
- **Tags:** `#test-gap`

### F-330..F-335 — Bottom-bar unguarded null/undefined access risks runtime crash

- **Resolved:** 2026-05-28 (backlog user-flow sweep) — the one genuinely-unguarded write, [terminal-area.tsx:82](apps/web/client/src/app/project/[id]/_components/bottom-bar/terminal-area.tsx#L82), now guards `sandbox?.session` before assigning. The `terminal-area.tsx:55` access is inside a try/catch (`continue` on throw — safe), and `restart-sandbox-button.tsx:177` `activeBranch.sandbox.id` is type-safe (`Branch.sandbox` is non-optional in [branch.ts:39](packages/models/src/project/branch.ts#L39)), so neither can crash the editor.
- **Discovered:** 2026-05-28 (validate-feature F-300..F-361 + F-420..F-439 run)
- **Where:**
  - [apps/web/client/src/app/project/[id]/_components/bottom-bar/terminal-area.tsx:55](apps/web/client/src/app/project/[id]/_components/bottom-bar/terminal-area.tsx#L55) — `branches.activeBranch.id` accessed inside try/catch (caught) but only by accident.
  - [apps/web/client/src/app/project/[id]/_components/bottom-bar/terminal-area.tsx:83](apps/web/client/src/app/project/[id]/_components/bottom-bar/terminal-area.tsx#L83) — `sandbox.session.activeTerminalSessionId =` assigns into possibly-undefined `.session`; only `sandbox` itself is null-checked.
  - [apps/web/client/src/app/project/[id]/_components/bottom-bar/restart-sandbox-button.tsx:178](apps/web/client/src/app/project/[id]/_components/bottom-bar/restart-sandbox-button.tsx#L178) — `activeBranch.sandbox.id` dereferences a sub-field that may be undefined depending on Branch shape.
- **Symptom:** if a branch is mid-init (no session yet) or has no `sandbox` sub-record, the terminal-switch / restart paths throw `Cannot read properties of undefined`.
- **Root cause:** missing optional-chain / explicit guards on intermediate fields.
- **Next step:** add `if (!sandbox?.session) return;` guards before writes, and `?.` on `activeBranch.sandbox?.id`. Verify Branch.sandbox type in [@weblab/models](packages/models) before deciding which is nullable.
- **Risk if ignored:** terminal cycle hotkey and Restart Sandbox button can crash the editor during sandbox cold-boot.
- **Tags:** `#bug` `#editor`

### F-422 — Account-tab accepts unvalidated first/last name input

- **Discovered:** 2026-05-28 (validate-feature F-420..F-439 run)
- **Where:** [apps/web/client/src/components/ui/settings-modal/account-tab.tsx:48-57](apps/web/client/src/components/ui/settings-modal/account-tab.tsx#L48-L57)
- **Symptom:** any length / character sequence accepted; no trim, no max length, no script-tag stripping before save.
- **Next step:** zod-validate `firstName`/`lastName` (1..64 chars, trimmed) on submit; toast on invalid; mirror Convex `users.update` validator.
- **Tags:** `#flag` `#validation`

### F-424 — Appearance-tab still leaves DOM out of sync on save failure

- **Discovered:** 2026-05-28 (validate-feature F-420..F-439 run)
- **Where:** [apps/web/client/src/components/ui/settings-modal/appearance-tab.tsx:85-103](apps/web/client/src/components/ui/settings-modal/appearance-tab.tsx#L85-L103)
- **Symptom:** optimistic `data-accent` / `data-density` / `data-font-size` mutations are not reverted on `updateSettingsMutation` failure. User now sees a toast (fix applied), but visually the change "stuck" until reload.
- **Next step:** snapshot prior attr values before mutation, restore in `catch`.
- **Tags:** `#flag` `#ux`

### F-427 — GitHub-tab silently clears repo list on fetch failure (no toast / retry)

- **Discovered:** 2026-05-28 (validate-feature F-420..F-439 run)
- **Where:** [apps/web/client/src/components/ui/settings-modal/github-tab.tsx:83-87](apps/web/client/src/components/ui/settings-modal/github-tab.tsx#L83-L87)
- **Symptom:** on `getOrgs` / `getReposWithApp` rejection, `orgs` and `repos` are set to `[]` with no user feedback — looks identical to "GitHub App has no repos".
- **Next step:** preserve error, show inline retry surface (similar to installation-check retry at line 168-180).
- **Tags:** `#flag` `#integration` `#ux`

### F-431 — Subscription-tab uses unsafe `(response as { url?: string })` cast

- **Discovered:** 2026-05-28 (validate-feature F-420..F-439 run)
- **Where:** [apps/web/client/src/components/ui/settings-modal/subscription-tab.tsx:40](apps/web/client/src/components/ui/settings-modal/subscription-tab.tsx#L40)
- **Symptom:** Convex action result is cast without runtime check; if shape ever changes, redirect will navigate to `undefined`.
- **Next step:** validate shape with `if (!result?.url) throw new Error(...)` before redirect.
- **Tags:** `#flag` `#billing`

### F-435 — Account deletion UI calls a not-yet-implemented Convex mutation (always toasts "unavailable")

- **Discovered:** 2026-05-28 (validate-feature F-420..F-439 run)
- **Where:** [apps/web/client/src/components/ui/settings-modal/user-delete-section.tsx:45-56](apps/web/client/src/components/ui/settings-modal/user-delete-section.tsx#L45-L56)
- **Symptom:** the destructive flow ends with `toast.error('Account deletion is temporarily unavailable...')`. UI implies deletion succeeded after the second-confirm step, but nothing happens.
- **Next step:** either gate the Delete button behind a "coming soon" disabled state OR ship the `users.delete` Convex mutation (server-side cleanup of projects, conversations, storage, subscriptions). The `// TODO(convex):` comment already flags this in code.
- **Risk if ignored:** users will repeatedly try, file support tickets, and assume their data is being deleted when it isn't.
- **Tags:** `#bug` `#user-trust`

### F-427 — `disconnectGitHub` button shows confirm dialog then no-ops

- **Discovered:** 2026-05-28 (validate-feature F-420..F-439 run)
- **Where:** [apps/web/client/src/components/ui/settings-modal/github-tab.tsx:123-133](apps/web/client/src/components/ui/settings-modal/github-tab.tsx#L123-L133)
- **Symptom:** Disconnect → Confirm → toast "Disconnect is temporarily unavailable". User cannot actually revoke connection from the app.
- **Next step:** implement `users.disconnectGitHub` Convex mutation that revokes the GitHub App installation and clears `providerConnections` row; until then disable the button instead of pretending it works.
- **Tags:** `#bug` `#integration`

### GitHub connect — Convex env required per deployment + single Setup-URL caveat

- **Discovered:** 2026-05-29 (debugging "Failed to generate GitHub installation URL").
- **Root cause (fixed):** `githubActions.*` run in the Convex Node runtime and read `GITHUB_APP_ID`/`GITHUB_APP_SLUG`/`GITHUB_APP_PRIVATE_KEY`/`GITHUB_INSTALL_STATE_SECRET` from the **Convex** env store (separate from Next.js `.env.local`). Both deployments were missing all four → `generateInstallationUrlAction` threw. Set on dev `avid-gnat-539` and prod `rapid-crab-113` via [scripts/set-convex-github-env.mjs](apps/web/client/scripts/set-convex-github-env.mjs).
- **Open caveat:** the single GitHub App (id `3588674`) has one post-install Setup URL. It can only point at one host, so the install callback (`/callback/github/install` → `handleInstallationCallbackUrl`) lands on one deployment. **Local-dev connect won't complete** unless the Setup URL targets localhost; prod (weblab.build) is the supported target. A separate dev GitHub App would be needed for local end-to-end testing.
- **Next step:** confirm the GitHub App Setup URL = `https://weblab.build/callback/github/install`; optionally register a second dev App for localhost. New deployments must run the provisioner (or set the 4 env vars) before GitHub connect works.
- **Tags:** `#integration` `#config` `#convex`

### F-491 — `checkout` allows multiple active subscriptions per user; downstream `.unique()` queries crash billing portal

- **Resolved:** 2026-05-28 (backlog user-flow sweep) — both halves landed: (1) `checkout` now calls `_findActiveSubscriptionForCaller` first and throws `ALREADY_SUBSCRIBED` ([subscriptionActions.ts:73-79](apps/web/client/convex/subscriptionActions.ts#L73)), preventing new duplicates; (2) defense-in-depth — `_findActiveSubscriptionForCaller` + `_findActiveProSubscriptionForPromo` now use `.take(2)` + pick-first + `console.warn` instead of `.unique()`, so a pre-existing duplicate no longer throws and locks the user out of the billing portal / promo.
- **Discovered:** 2026-05-28 (validate-feature F-490..F-501 deep pass)
- **Where:** [apps/web/client/convex/subscriptionActions.ts:52-91](apps/web/client/convex/subscriptionActions.ts#L52-L91) (`checkout` action) +
  [apps/web/client/convex/lib/stripeWebhook.ts:630-647](apps/web/client/convex/lib/stripeWebhook.ts#L630-L647) (`_findActiveSubscriptionForCaller`) +
  [stripeWebhook.ts:587-598](apps/web/client/convex/lib/stripeWebhook.ts#L587-L598) (`_findActiveProSubscriptionForPromo`)
- **Symptom (chain):**
  1. User double-clicks **Subscribe** on the pricing modal, or two browser tabs race. `checkout` action does not check for an existing active subscription, so both calls create Stripe Checkout Sessions and both complete.
  2. Stripe fires two `customer.subscription.created` events. `_handleSubCreated` is idempotent only on `stripeSubscriptionItemId` (different items per sub) → two rows inserted in `subscriptions` with `status='active'`.
  3. User opens **Settings → Subscription → Manage** → `manageSubscription` action calls `_findActiveSubscriptionForCaller` which does `.query('subscriptions').withIndex('by_user_status', q => q.eq('userId', userId).eq('status', 'active')).unique()`. With 2 rows the `.unique()` throws `Unique constraint failed`. Billing portal never opens. User cannot cancel or change the duplicate.
  4. Same throw blocks `startPromoCheckout` for affected users (`_findActiveProSubscriptionForPromo` also `.unique()`s on `by_user_status`).
- **Root cause:** missing idempotency guard at the `checkout` entry point; helper queries assume the invariant "≤1 active sub per user" that the entry point doesn't enforce.
- **Next step:**
  - In `checkout` (subscriptionActions.ts:54) call `_findActiveSubscriptionForCaller` (or an equivalent internal query) first; if a row exists, throw `ALREADY_SUBSCRIBED` and surface a friendly message in [pro-card.tsx:52](apps/web/client/src/components/ui/pricing-modal/pro-card.tsx#L52).
  - Defense-in-depth: change the two `.unique()` calls on `by_user_status` to `.first()` + log when more than one is found, so a future repeat doesn't lock the user out of the portal.
- **Risk if ignored:** support tickets from double-billed users who also can't open the billing portal to fix it themselves. Revenue impact + churn.
- **Tags:** `#bug` `#billing` `#critical`

### F-491 — `update` action does not catch already-released schedule from Stripe; upgrade/downgrade aborts

- **Resolved:** 2026-05-28 (backlog user-flow sweep) — verified fixed: the `release` call is now wrapped in try/catch that swallows `invalid_request_error` ([subscriptionActions.ts:183-194](apps/web/client/convex/subscriptionActions.ts#L183)), mirroring `releaseSubscriptionSchedule`, so an already-released schedule no longer aborts the plan change. Stale entry.
- **Discovered:** 2026-05-28 (validate-feature F-490..F-501 deep pass)
- **Where:** [apps/web/client/convex/subscriptionActions.ts:156-158](apps/web/client/convex/subscriptionActions.ts#L156-L158)
- **Symptom:** User changes plan via the pricing modal while a previously scheduled downgrade is in-flight. `update` action sees `owned.stripeSubscriptionScheduleId` and calls `stripe.subscriptionSchedules.release(scheduleId)` without try/catch. If Stripe reports the schedule is already in `'released'` state (e.g. the scheduled phase fired and Stripe auto-released it just before this request, or the user released it manually from the portal), Stripe throws `StripeInvalidRequestError`. The action aborts; user sees a generic toast. Our DB still references the now-dead `stripeSubscriptionScheduleId`, so the next attempt repeats the failure.
- **Root cause:** inconsistent error handling — `releaseSubscriptionSchedule` ([line 314-323](apps/web/client/convex/subscriptionActions.ts#L314-L323)) already handles this exact case by swallowing `invalid_request_error`; the `update` action does not.
- **Next step:** wrap the `release` call in the same try/catch used by `releaseSubscriptionSchedule`; on swallowed error, fall through to the normal upgrade/downgrade path. Add a clearing patch (`_clearScheduleChange`) so our DB drops the stale schedule id.
- **Risk if ignored:** users with pending schedules get permanently stuck — every plan change attempt aborts before reaching Stripe.
- **Tags:** `#bug` `#billing`

### F-491 — `startPromoCheckout` returns `not_authenticated` for users that are signed in but missing email

- **Discovered:** 2026-05-28 (validate-feature F-490..F-501 deep pass)
- **Where:** [apps/web/client/convex/subscriptionActions.ts:228-231](apps/web/client/convex/subscriptionActions.ts#L228-L231)
- **Symptom:** `_resolveCallerUserId` returns `null` only when there is no authenticated identity; an authenticated user without `email` returns a user object whose `email` is `undefined`. The check `if (!caller?.email)` then returns `errorCode: 'not_authenticated'`. Frontend renders a misleading "Please sign in" message even though the user is signed in.
- **Root cause:** error code conflates two states (no identity vs identity-without-email).
- **Next step:** split the check —
  ```ts
  if (!caller) return { errorCode: 'not_authenticated' };
  if (!caller.email) return { errorCode: 'missing_email' };
  ```
  Add the new code to the promo banner's typed error handler.
- **Risk if ignored:** support burden + confused users on the promo flow.
- **Tags:** `#bug` `#billing` `#ux`

### F-501 — `NAMED_FUNCTION_RE` / `DEFAULT_FUNCTION_RE` miss `export async function` (Next.js server components dropped)

- **Discovered:** 2026-05-28 (validate-feature F-490..F-501 deep pass)
- **Where:** [apps/web/server/src/router/routes/components.ts:25,42](apps/web/server/src/router/routes/components.ts#L25)
- **Symptom:** Every Next.js App Router server component (`export default async function Page()`, `export async function generateMetadata()` is correctly skipped because lowercase, but `export async function HeroSection()` would be dropped). Regex anchors `function` immediately after `export\s+(default\s+)?`, so the `async` keyword between `export` and `function` is never matched.
- **Root cause:** regex written before App Router conventions were considered.
- **Next step:** allow optional `async\s+` between `export` and `function`:
  ```ts
  const NAMED_FUNCTION_RE = /export\s+(?:async\s+)?function\s+([A-Z][A-Za-z0-9_]*)\s*[(<]/gm;
  const DEFAULT_FUNCTION_RE = /export\s+default\s+(?:async\s+)?function\s+([A-Z][A-Za-z0-9_]*)\s*[(<]/gm;
  ```
  Add unit tests for both async forms to [`__tests__/components.test.ts`](apps/web/server/src/router/routes/__tests__/components.test.ts).
- **Risk if ignored:** users importing a Next.js App-Router project see an incomplete component list in the editor's component picker (F-501 → editor → component browser).
- **Tags:** `#bug` `#editor` `#test-gap`

### F-501 — `scanDirectory` has no symlink-cycle guard; malicious project dir can OOM the Fastify server

- **Discovered:** 2026-05-28 (validate-feature F-490..F-501 deep pass)
- **Where:** [apps/web/server/src/router/routes/components.ts:132-159](apps/web/server/src/router/routes/components.ts#L132-L159)
- **Symptom:** `walk()` recurses on every `entry.isDirectory()` without tracking visited inodes or skipping symlinks. A project containing a symlink that points at an ancestor (`src/loop -> ../..`) causes infinite recursion → V8 stack overflow → process restart, or runaway memory before that.
- **Root cause:** missing `entry.isSymbolicLink()` skip + missing visited-set.
- **Next step:** filter symlinks before recursing:
  ```ts
  if (entry.isSymbolicLink()) continue;
  if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) await walk(join(current, entry.name));
  ```
  Optional: track visited real paths via `fs.realpath` + Set as defense-in-depth.
- **Risk if ignored:** SANDBOX_BASE_DIR is operator-controlled today, so exposure is low — but the moment user-uploaded projects are scanned with this code path (or an attacker controls a file the scanner traverses), one symlink takes the Fastify server down. Latent denial-of-service.
- **Tags:** `#bug` `#security` `#sandbox`

### F-491 — Stripe webhook accepts only one `v1=` signature; rotation will reject valid requests

- **Discovered:** 2026-05-28 (validate-feature F-490..F-501 run)
- **Where:** [apps/web/client/convex/http.ts:112-117](apps/web/client/convex/http.ts#L112-L117) — `verifyStripeSignature`
- **Symptom:** during a Stripe webhook signing-secret rotation Stripe sends
  `Stripe-Signature: t=…,v1=oldSig,v1=newSig`. The current parser builds
  `Object.fromEntries(...)` so only the LAST `v1` survives. If our held
  secret signs the FIRST entry, verification fails and Stripe retries until
  rotation finishes.
- **Root cause:** `Object.fromEntries` collapses duplicate keys.
- **Next step:** split header → keep an array of `v1` values; HMAC the
  payload once → return true if any candidate matches via constant-time
  compare. Add a test that feeds two `v1=` entries.
- **Risk if ignored:** ~5-minute window of dropped events on every rotation,
  silent until alerted by Stripe dashboard.
- **Tags:** `#bug` `#billing` `#webhook`

### F-491 — Stripe webhook lacks `evt.id` idempotency; replays grant duplicate credits

- **Resolved:** 2026-05-28 (CodeRabbit-fix pass) — added a `stripeEventLog`
  table (`by_event_id`) and an `alreadyProcessed()` guard at the top of every
  `_handleSub*` mutation; `event.id` is threaded through `http.ts`. Dedup is
  transactional (log insert + handler work in one mutation), so a failed
  handler rolls back the log row and Stripe still retries genuine failures;
  Convex OCC closes the concurrent-duplicate race. Table kept bounded by a
  daily `purgeStaleStripeEvents` cron (7-day TTL, Stripe retries ≤3 days).
  Note: the live risk was lower than stated below — existing state-guards
  (priceId/periodEnd patches) plus OCC already prevented most duplicates in the
  Convex runtime; this makes idempotency explicit and future-proof.
- **Discovered:** 2026-05-28 (validate-feature F-490..F-501 run)
- **Where:** [apps/web/client/convex/http.ts:235-270](apps/web/client/convex/http.ts#L235-L270) +
  [apps/web/client/convex/lib/stripeWebhook.ts:220-401](apps/web/client/convex/lib/stripeWebhook.ts#L220-L401)
- **Symptom:** `customer.subscription.updated` pro-rated upgrade branch
  (`stripeWebhook.ts:268`) and renewal branch (`handleSubscriptionRenewed`,
  `stripeWebhook.ts:379`) both `ctx.db.insert('rateLimits', …)`. Stripe
  retries 5xx for up to 3 days and can double-deliver even on 2xx
  (documented behavior). Each replay inserts another full-quota rateLimits
  row → user receives N× credits.
- **Root cause:** no event-id dedupe at the webhook entry point.
  `_handleSubCreated` is idempotent (item-id upsert) but the `Updated`
  paths are not.
- **Next step:** introduce a `stripeEventLog` table indexed by
  `stripeEventId` (= `evt.id` from raw payload). In the webhook handler,
  attempt an insert before dispatch; on uniqueness conflict, return 200
  early.
- **Risk if ignored:** duplicate credits granted on every Stripe retry,
  inflated `rateLimits.left` for affected users, silent revenue leak.
- **Tags:** `#bug` `#billing` `#webhook` `#idempotency`

### F-492 — catalog row claims GitHub webhook but no HTTP handler exists

- **Discovered:** 2026-05-28 (validate-feature F-490..F-501 run)
- **Where:** [docs/feature-catalog.md:531](docs/feature-catalog.md#L531) +
  [docs/test-plan.md:383](docs/test-plan.md#L383) (T-492) vs
  [apps/web/client/convex/http.ts](apps/web/client/convex/http.ts) (only
  `/clerk-webhook` and `/webhooks/stripe` exist) and
  [apps/web/client/convex/githubActions.ts](apps/web/client/convex/githubActions.ts)
  (OAuth + installation callback + PR create actions only).
- **Symptom:** F-492 is unreachable. T-492 ("Replay GitHub event → Convex
  action invoked") cannot execute — no `/github-webhook` route is mounted
  anywhere in the repo.
- **Root cause:** either (a) GitHub webhook was never ported, or (b) the
  catalog row is mis-tagged and should describe the OAuth/installation
  actions, not a webhook.
- **Next step:** decide intent. If a webhook IS planned, scaffold a
  `/webhooks/github` httpAction that verifies the `X-Hub-Signature-256`
  HMAC and dispatches at minimum `installation.created` / `installation.deleted`.
  Otherwise rewrite the catalog row + T-492 to describe the existing
  OAuth/install/PR actions and drop the `#webhook` tag.
- **Risk if ignored:** misleading inventory — agents and humans assume
  GitHub event sync exists when it doesn't.
- **Tags:** `#docs` `#bug` `#integration`

### F-500 — tRPC `sandbox` router is a hello-world stub; no production caller

- **Discovered:** 2026-05-28 (validate-feature F-490..F-501 run)
- **Where:** [apps/web/server/src/router/routes/sandbox.ts](apps/web/server/src/router/routes/sandbox.ts) +
  mount [apps/web/server/src/router/index.ts:6](apps/web/server/src/router/index.ts#L6)
- **Symptom:** `create`, `start`, `stop`, `status` return `"hi <input>"`
  or canned objects. Every `sandbox.*` reference in
  `apps/web/client/**/sandbox/**` targets `api.sandbox.*` (Convex
  namespace, not yet ported — search `TODO(sandbox-port)`). The Fastify
  tRPC sandbox router is mounted but not called from any production code
  path.
- **Root cause:** placeholder left after the CodeSandbox → Vercel +
  Convex migration; never wired to a real lifecycle.
- **Next step:** either delete the router (and the F-500 catalog row), or
  ship a real implementation that calls the Vercel Sandbox provider in
  [packages/code-provider](packages/code-provider/src/providers/vercel-sandbox/index.ts).
- **Risk if ignored:** dead code in the tRPC surface; agents wire new
  features to a stub thinking it works; bloats `AppRouter` type.
- **Tags:** `#tech-debt` `#sandbox`

### ~~F-131 — invalid project ID maps to "unknown" variant instead of "invalid-id"~~ FIXED (2026-05-28)

- **Resolution:** Extracted the catch-block classification into a pure
  `classifyProjectLoadError(message)` helper
  ([apps/web/client/src/app/project/[id]/_adapters/classify-load-error.ts](apps/web/client/src/app/project/[id]/_adapters/classify-load-error.ts))
  that checks `does not match validator` / `argumentvalidationerror` **first**,
  returning the existing `invalid-id` variant. `page.tsx` now short-circuits
  to `<ProjectLoadError variant="invalid-id" />` for malformed ids and skips
  the pointless offline-cache lookup. Verified by
  `classify-load-error.test.ts` (12 cases incl. invalid-id precedence over a
  co-occurring "not found" substring). Was: malformed id → `unknown` variant
  leaked the raw validator string in a `<pre>`.

### F-122 — unauth bounce sends user to `/w/new` instead of `/sign-in`

- **Discovered:** 2026-05-26 (validate-feature F-120..F-135 run)
- **Where:** [apps/web/client/src/app/projects/creating/page.tsx](apps/web/client/src/app/projects/creating/page.tsx) — middleware + `useAuthContext` interplay
- **Symptom:** unauthenticated user navigates to
  `/projects/creating?templateId=…` and lands on `/w/new` (workspace create
  page) instead of `/sign-in?returnUrl=%2Fprojects%2Fcreating…` like every
  sibling under `/projects/*`.
- **Root cause:** unclear. Either middleware exempts `/projects/creating`,
  or the client component's auth modal logic redirects via
  `localStorage`/`localforage` state before the sign-in redirect fires.
- **Next step:** repro with a fresh incognito profile (cleared cookies +
  localStorage). Compare middleware matcher against `/projects/creating`
  vs `/projects/new`. Fix divergence so all `/projects/*` routes share the
  same unauth path.
- **Risk if ignored:** confusing UX — magic-link / OAuth callbacks for the
  "create from template" flow land on the wrong landing page.
- **Tags:** `#bug` `#auth-gated` `#routing`

### Missing test-plan rows for F-126, F-130, F-132, F-133

- **Discovered:** 2026-05-26 (validate-feature F-120..F-135 run)
- **Where:** [docs/test-plan.md](docs/test-plan.md)
- **Symptom:** four features in the catalog have no `T-XXX` test row.
  - **F-126** `/projects/import` (import hub) — no nav/render test.
  - **F-130** `/project` (bare index) — no listing/redirect test.
  - **F-132** `/project/[id]/loading.tsx` — no skeleton test.
  - **F-133** `/project/[id]/error.tsx` — no error-boundary render test.
- **Next step:** add minimal `T-XXX` rows. For F-132 / F-133, write
  integration tests that force the loading / error state (throttle a query;
  render `error.tsx` with `new Error('boom')`).
- **Risk if ignored:** silent regressions in the loading skeleton and error
  fallback — both surface to users on slow networks and crashes.
- **Tags:** `#test-gap` `#docs`

### `bun test` does not auto-load `apps/web/client/.env.local`

- **Discovered:** 2026-05-26 (validate-feature F-120..F-135 run)
- **Where:** [apps/web/client/src/components/store/create/manager.test.ts](apps/web/client/src/components/store/create/manager.test.ts) and any test that transitively imports [apps/web/client/src/env.ts](apps/web/client/src/env.ts)
- **Symptom:** running `bun test src/components/store/create/manager.test.ts`
  from `apps/web/client/` fails with `Invalid environment variables: …
  OPENROUTER_API_KEY: expected string, received undefined` even though
  `.env.local` contains the key. Tests only pass after explicit
  `set -a; source .env.local; set +a`.
- **Root cause:** Bun loads `.env.local` from CWD, but tooling expectation
  (per Bun docs) doesn't align here — likely because the test file imports a
  module that reads `process.env` at module-load time before Bun's loader
  sequence applies.
- **Next step:** either (a) add a `bunfig.toml` `[test]` preload that sources
  the env, or (b) add a `tests/setup.ts` that calls `dotenv.config({ path:
  '.env.local' })` and wire it via `bun test --preload`. Document in
  [CLAUDE.md](CLAUDE.md) test section.
- **Risk if ignored:** every new contributor and every fresh CI shell hits
  the same false-failure; signal-to-noise on local test runs degrades.
- **Tags:** `#infra` `#dev-loop`

### Lint warnings inside F-120..F-135 scope (0 errors, 7 warnings)

- **Discovered:** 2026-05-26 (validate-feature F-120..F-135 run)
- **Where:**
  - [apps/web/client/src/components/store/create/manager.ts:34](apps/web/client/src/components/store/create/manager.ts#L34) — `readActiveWorkspaceId` defined but unused.
  - [apps/web/client/src/app/projects/import/local/page.tsx:8](apps/web/client/src/app/projects/import/local/page.tsx#L8) — `Icons` imported but unused.
  - [apps/web/client/src/app/projects/import/local/_context/index.tsx](apps/web/client/src/app/projects/import/local/_context/index.tsx) — 1 `react-hooks/exhaustive-deps` (`validateProject`), 1 unused `startOrphanSandbox`, 3 `@typescript-eslint/no-explicit-any` at lines 303, 435, 441.
  - [apps/web/client/src/app/projects/layout.tsx:19](apps/web/client/src/app/projects/layout.tsx#L19) — `||` should be `??` per `prefer-nullish-coalescing`.
- **Next step:** delete unused symbols, tighten the three `any`s, and fix the
  `??` swap. The exhaustive-deps warning needs a real look — adding the dep
  may trigger a re-validation loop, so verify before changing.
- **Risk if ignored:** `bun lint --max-warnings 0` (CI gate) will keep
  failing on any touch to these files.
- **Tags:** `#tech-debt` `#lint`

### Node 22 stream compat noise in Convex client logs

- **Discovered:** 2026-05-26 (validate-feature F-120..F-135 run)
- **Where:** server logs during any failed `fetchQuery` call from the editor route.
- **Symptom:** `TypeError: controller[kState].transformAlgorithm is not a
  function` appears in stderr next to legitimate request errors. Originates
  inside the Convex client's `Response` body handling on Node ≥ 22.
- **Root cause:** undici / Node-internal stream API drift; not in our code.
- **Next step:** bump `convex` SDK once upstream ships the fix, or pin Node
  to 20.x in `engines` and Railway/Vercel runtime config if the noise gets
  worse. Track upstream issue.
- **Risk if ignored:** log noise only — does not block requests. Becomes a
  real problem if real errors get hidden behind the spam.
- **Tags:** `#tech-debt` `#infra` `#noise`

---

## Resolved

### 2026-05-28 — User-stopping fixes from F-300..F-402 bug-hunt

Fixed in this session (code-level verified: `bun typecheck` exit 0, scoped lint 0 errors). Frontend re-validation still blocked by the Vercel hobby-plan 402 (project create), so these are logic-traced + type-checked, not yet clicked through the editor.

- **F-335** restart button stuck after abort — [restart-sandbox-button.tsx:214](apps/web/client/src/app/project/[id]/_components/bottom-bar/restart-sandbox-button.tsx#L214). Added `setRestarting(false)` + `setRestartElapsedSec(0)` + `restartGraceUntilRef.current = null` before the abort `return`.
- **F-300** `activeBranch.id` null crash (3 sites) — [list-view.tsx:96+106](apps/web/client/src/app/project/[id]/_components/right-panel/interactions-tab/list-view.tsx#L96), [timeline-editor.tsx:60](apps/web/client/src/app/project/[id]/_components/right-panel/interactions-tab/timeline/timeline-editor.tsx#L60). Switched to `activeBranch?.id` + early-return / persist guard.
- **F-318** dropdown stale-closure (picker stuck open) — [use-dropdown-manager.tsx:143](apps/web/client/src/app/project/[id]/_components/editor-bar/hooks/use-dropdown-manager.tsx#L143). Added `isOpen` to effect deps (no loop — setState only fires when they disagree).
- **F-313** ImgSelected unreachable — [editor-bar/index.tsx](apps/web/client/src/app/project/[id]/_components/editor-bar/index.tsx) (imported + `TAG_TYPES[IMG]=['img']` + dispatch branch) and [img-selected.tsx](apps/web/client/src/app/project/[id]/_components/editor-bar/img-selected.tsx) (wired functional `ImgFit` / object-fit control; deliberately omitted the no-op `ImageBackground` stub). `<img>` now gets a real image-specific toolbar.
- **F-361** fork / createBlankSandbox silent fail — [branch-controls.tsx:37+52](apps/web/client/src/app/project/[id]/_components/branch/branch-controls.tsx#L37). Added `toast.error(...)` in both catch blocks (honors the `#disabled` "clear error" contract).
- **F-402** missing `'use client'` (latent build break) — [non-project.tsx:1](apps/web/client/src/components/ui/settings-modal/non-project.tsx#L1).
- **F-301** `formatRelativeTime` → `"NaNm ago"` — [comments-tab/index.tsx:16](apps/web/client/src/app/project/[id]/_components/right-panel/comments-tab/index.tsx#L16). Added `Number.isNaN` + negative-diff guards.

**Still Open (intentionally deferred — cosmetic or broad, NOT user-stopping):** F-402 backdrop-close dirty-check + ARIA/focus-trap (broad — needs Radix Dialog swap + state-manager `isDirty`); F-333 duplicate keys / CopyButton timeout; F-360 error-leak / email-normalize; F-334 wildcard postMessage; F-332 xterm refresh; pervasive raw-`<button>` + i18n sweep; ImageBackground dead stub; F-313 catalog row should note object-fit-only scope.
