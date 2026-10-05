# Weblab Feature Test Plan

> Companion to [feature-catalog.md](./feature-catalog.md). Every row references a feature by stable `F-XXX` ID — so grep `F-280` to find every test that touches the chat tab.
>
> **Tools:** Bun test (unit + integration), Playwright (E2E, not yet committed — see [Open Questions](#open-questions)), `gstack`/`browse` MCP for manual smoke.
>
> **Status column:** `[ ]` not written · `[~]` partial · `[x]` written + passing.

---

## How to read

| Column | Meaning |
|---|---|
| **ID** | Test row ID (`T-XXX`); independent from feature ID |
| **Targets** | Feature IDs from [feature-catalog.md](./feature-catalog.md) this test covers |
| **Scope** | `U` unit · `I` integration · `E` E2E browser · `M` manual smoke · `V` visual regression |
| **How** | Command or click flow |
| **Pass** | What "passes" looks like |

---

## How to update

Pair every catalog row with at least one test row here. New feature in catalog → new row in this doc. Use the same section name as the catalog so navigation stays parallel.

Append IDs `T-XXX` monotonically — never reuse.

---

## 0. Infrastructure

| Tool | Command | Notes |
|---|---|---|
| Bun test (all) | `bun test` | |
| Bun test (file) | `bun test path/to/file.test.ts` | |
| Bun test (coverage, CI) | `bun test --timeout 30000 --coverage` | |
| Typecheck | `bun typecheck` | pre-merge |
| Lint | `bun lint` | `--max-warnings 0` |
| Format | `bun format` | bulk normalize |
| Dev server | `bun dev` | port 3000 |
| Backend | `bun backend:start` | local Supabase |
| Convex dev | `bunx convex dev` | required for backend-touching tests |
| Browser smoke (agent) | `gstack` or `browse` MCP | snapshots + asserts |
| Independent review | `claude-review diff --json` | mandatory pre-merge |

### Gaps blocking full execution

- [ ] No Playwright/Cypress harness committed → can't run `E` rows yet. **Decision needed before Phase 1.**
- [ ] No seeded test user / workspace / project fixture → blocks every `E`.
- [ ] No Convex provider mock for unit tests of Convex-touching code.
- [ ] No Stripe test-mode keys wired into CI env.
- [ ] No visual regression tool (Percy / Chromatic / Playwright snapshots).
- [ ] Vercel Sandbox provider not mocked → CI can't smoke `code-provider` integration end-to-end.

---

## 1. Public / Marketing routes

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-001 | F-001 | E + V | Browse `/` incognito | Hero renders, CTA links work, Lighthouse perf ≥ 80, a11y ≥ 95, visual snapshot stable | `[ ]` |
| T-002 | F-002 | M | Visual scan | Founder card, values grid, hiring section, no broken images | `[ ]` |
| T-003 | F-003, F-004 | E | Browse `/blog` + one slug | Featured + grid render; MDX OK; JSON-LD valid (schema.org) | `[ ]` |
| T-004 | F-005, F-761 | U + E | Snapshot on `lib/changelog-entries.ts`; browse `/changelog` | All entries with date + tags | `[ ]` |
| T-005 | F-006 to F-017 | M | Visual + click each card | 11 competitor cards link to subpage; each subpage renders | `[ ]` |
| T-006 | F-018 | E | Click each download button and the Mac installer links in the README | Apple Silicon + Intel downloads and the linked Mac release assets resolve | `[ ]` |
| T-007 | F-019 | E | Open each section + question | Smooth scroll, active-section highlight, accordion open/close | `[ ]` |
| T-008 | F-020 … F-025 | M + E | Visual scan + FAQ accordions | Each features subpage renders w/o overflow | `[ ]` |
| T-009 | F-026 … F-028 | M | Visual on each SEO landing | All render w/o crash | `[ ]` |
| T-010 | F-029, F-450, F-451 | E (test mode) | Click each plan CTA | Stripe checkout (test) opens; Contact mailto valid | `[ ]` |
| T-011 | F-030, F-031 | M | Visual | TOC links + sections present | `[ ]` |
| T-012 | F-032 | E | Visit | Redirects to `/projects` | `[ ]` |
| T-013 | F-033 … F-036 | M | Visual + click each card | 3 cards render; Coming Soon badges accurate; per-workflow pages render | `[ ]` |
| T-014 | F-037 | M | Visual | Hero, compliance, badges, subprocessors render | `[ ]` |
| T-015 | F-038 | E | Click each anchor + external | Anchors scroll; external links 200 | `[ ]` |
| T-016 | F-039 | E | Disable network → visit | Offline page renders | `[ ]` |
| T-017 | F-040, F-041 | M | Visual + confirm `#deprecated` | Marked stale; no inbound links from current marketing nav | `[ ]` |
| T-018 | F-042, F-043 | E | Visit non-existent route + throw in client | 404 returns 404; error boundary catches | `[ ]` |
| T-019 | F-044 | I | Render w/ providers | No hydration mismatch; theme dark default | `[ ]` |
| T-020 | F-045 | M | Visit localhost + non-localhost | Localhost: open. Non-localhost: gated by `DESIGN_SYSTEM_PASSWORD` | `[ ]` |

---

## 2. Marketing components

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-050 | F-051 | I | Mock Clerk, open/close, submit email | No crash; correct Clerk method calls | `[ ]` |
| T-051 | F-052 | U | Mount cookie banner | Shows once; persists dismissal in localStorage | `[ ]` |
| T-052 | F-057, F-753 | M | Devtools → Application after deploy; reload `/sign-in` in a returning-user browser and in a fresh browser | SW registered; old cache namespace purged; `/sign-in` hydrates without React #418; Next chunks refetch network-first and still fall back from cache offline | `[~]` |
| T-053 | F-062 | E | Open promo banner link | Routes through `/api/promo-resume` → checkout | `[ ]` |
| T-054 | F-066 (`locale-switcher`) | I | Switch locale | next-intl reloads with new strings | `[ ]` |
| T-055 | F-066 (`theme-switcher`) | U | Toggle | `<html data-theme>` flips; persists | `[ ]` |

---

## 3. Auth, Onboarding & Callbacks

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-080 | F-080, F-081 | E + I | Visit signed-out + mock Clerk SDK; compare `/sign-in` server HTML vs hydrated DOM with blank/unset `NEXT_PUBLIC_AUTH_PROVIDERS` | OAuth + email forms render; form is at most 360px wide; all enabled provider buttons stay in one row with short labels and no overflow at 320px; OAuth button list matches across SSR/client; no React #418; correct Clerk method per path | `[~]` |
| T-081 | F-082 | E | Submit valid + invalid OTP; activation refresh; missing OTP stash with signed-in session; unsafe return URL | Valid → safe next route across refresh; invalid → error; no signed-in loop or external return | `[ ]` |
| T-082 | F-083 | E (mocked OAuth) | Hit with code+state | New sign-ups → `/profile-setup`; existing → `/projects` | `[ ]` |
| T-083 | F-084 | E | Visit `/sign-up?returnUrl=/projects` | Redirects to `/sign-in?returnUrl=/projects` and unified auth form renders | `[ ]` |
| T-084 | F-085 | U | returnUrl sanitization | Strips dangerous protocols; passes internal | `[ ]` |
| T-085 | F-086 | E | Trigger OAuth failure | Error code displayed | `[ ]` |
| T-086 | F-087 | E | Complete profile | Required fields enforced; persists to `users` (F-580) | `[ ]` |
| T-087 | F-088 | M | Visit | Configuration-error copy shown (currently `#disabled`) | `[ ]` |
| T-088 | F-089 | E (mocked GH) | Hit after App install | Confirmation shown; provider connection (F-582) written | `[ ]` |
| T-089 | F-090, F-091 | E (test mode) | Stripe success + cancel | Success: subscription row appears (F-619); cancel: graceful return | `[ ]` |
| T-090 | F-092, F-093 | E | Use seeded invite token | Accept adds member (F-587/F-544); decline rejects; expired → error | `[ ]` |

---

## 4. Workspace & Settings

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-100 | F-100, F-562 | E | Submit name | Workspace + slug created; switcher updates | `[ ]` |
| T-101 | F-101 | E | Visit signed-out | Redirected to `/sign-in` | `[ ]` |
| T-102 | F-102, F-548 | E + I | List + create + filter + sort | Projects from Convex; filters work | `[ ]` |
| T-844 | F-802, F-803 | U (mock handler DB) | `convex/lib/cloudPilot.test.ts`, `cloudPilot-handlers.test.ts`, `src/lib/cloud-pilot/draft.test.ts`, `src/components/cloud-pilot/template.test.tsx` | Reject unsafe content, permissions and reference mismatches and archived content; disabled writes; retry-safe create; stale save protection; preserve unsaved draft on errors/remote updates. Mock checks do not prove Convex transactions or deployed auth. | `[x]` 33 source tests; latest handler guard rechecked |
| T-845 | F-802, F-803 | E (isolated Railway/Convex test environment) | Real Clerk accounts; create/edit/save/reopen; separate browser sessions; competing saves; disconnect; pause backend; account isolation | Live API acceptance and independent browser sessions passed. Deployed web sign-in/create/save/reopen/conflict/denied access passed. Unsupported template metadata is covered by T-844; two physical computers not exercised. See `docs/notes/2026-10-01-cloud-pilot-qa.md`. | `[x]` Old form technical scope only; product acceptance withdrawn |
| T-843 | F-102 | U + E | `select/project-card-utils.test.ts`; in grid/list/table, create a folder from a site's menu, move/remove it, reload; hover a local site name; open details by right-click and ellipsis, copy the path; simulate failed folder storage | Single assignment persists on this device, peers and source files stay unchanged; a failed create keeps the dialog open; details show existing metadata, local paths copy exactly, cloud sites have no invented local path. Browser checks pending. | `[ ]` |
| T-103 | F-103 | E | Edit name + slug + delete | Persists via Convex; slug uniqueness enforced | `[ ]` |
| T-104 | F-104, F-555 | E (test mode) | Open Stripe portal | Portal session URL returned | `[ ]` |
| T-105 | F-105, F-587 | E | Change role; remove | Convex membership updates; non-owner can't promote | `[ ]` |
| T-106 | F-106, F-592 | E | Resend + revoke | Convex `projectInvitations` reflects state | `[ ]` |
| T-107 | F-108 | E | Edit personal settings | `userSettings` (F-581) persists | `[ ]` |

---

## 5. Projects Dashboard, Create, Import

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-120 | F-120 | E | Visit | Cookie-based slug resolution; redirect to `/w/[slug]/projects` | `[ ]` |
| T-121 | F-121, F-135 | E | New project blank | Vercel sandbox scaffolds Next.js; routes to `/project/[id]` | `[ ]` |
| T-121a | F-121 | M (desktop) | Open `/projects/new` in the local release and try every visible create entry | Existing Git folder opening is available; unsupported blank/cloud creation does not mutate disk or provision a sandbox; preview starts only on explicit request and reports port collision. | `[ ]` |
| T-786 | F-786 | M (desktop) | Drag an existing dirty Git folder into the window; repeat with empty folder and dock drop | Source, Git HEAD, index, and untracked files stay unchanged on open; empty folder stays empty; file drop is rejected; dock-drop on cold launch opens after sign-in. | `[ ]` |
| T-828 | F-795 | U + E (desktop) | Plan preparation twice on a dirty Next.js App Router and multi-page static HTML Git repo, review exact diffs, apply, force a preflight conflict and a later-write failure; also try Next.js without `public/` and static HTML without a dev script | Planning writes nothing; IDs remain stable; every supported page loads the same reviewed local bridge; conflicts fail before writing; rollback restores only this attempt's files and lists any residue; unsupported folder shapes refuse clearly; no install or preview start occurs. | `[ ]` |
| T-829 | F-786, F-796 | U + E (desktop) | Open dirty/staged independent and linked-worktree Git projects, edit each private copy, review and export a patch, apply it on a disposable clone or worktree, reopen changed source, edit and export again; interrupt a native write before journal commit | Original HEAD/index/files and linked-worktree pointer stay unchanged by Weblab; patches contain only reviewed Weblab edits and apply cleanly; stale or unrelated edits block export; a new private copy preserves the old one; interrupted edits recover into handoff without silent loss. | `[ ]` |
| T-830 | F-786 | U + E (desktop) | Open locked existing Next.js Git projects without `node_modules`, using Bun, npm v2/v3, Yarn v1, and pnpm v9 locks in turn; install through the editor; cancel and retry; attempt an ambiguous lockfile, replaced generated lock, concurrent preview start, and an interrupted install with and without Weblab edits | Bun installs only in the private copy without lifecycle scripts or forwarded app credentials; source files, index, and original lockfile bytes remain unchanged; temporary migrated locks are removed only when owned; uncertain installs never overlap, reopen makes a fresh copy when unchanged, journaled edits still export as a patch, and preview starts after install. | `[ ]` |
| T-831 | F-222, F-315, F-786 | U + E (desktop) | On a prepared Tailwind Next.js repo, change opacity and layer visibility, then reload and undo/redo; fail a queued style transaction and start a second gesture while the first is saving; on plain static HTML, attempt style panel, opacity, and layer visibility edits | Supported changes write source and survive reload; undo/redo returns the expected visible state. A failed transaction restores preview and refuses overlapping style input; static HTML style attempts do not queue history, change preview or eye state, or mutate the private copy until a durable CSS writer exists. | `[ ]` |
| T-832 | F-786 | U + E (desktop) | Open existing Next.js Git projects with a wired Tailwind v4 App Router stylesheet, dependency-only Tailwind, plain CSS/CSS Modules, and static HTML; change or remove a supported project's PostCSS/layout/CSS wiring after open; attempt font-stack and named-token edits above base | Visual styles write source only in the wired private branch and survive reload/undo; unsupported or changed setups and responsive values without a durable writer reject style panel, direct action, and responsive source writes before preview/history/source changes, while code/text work remains available. | `[ ]` |
| T-833 | F-797, F-798 | U | AI guard math + config (`convex/lib/aiGuardMath.test.ts`, `convex/lib/aiGuardConfig.test.ts`, `convex/lib/transcribeRateLimit.test.ts`) | Multi-window request limiter (20/min, 400/h) blocks with correct retry; per-user spend blocks at hourly cap (retry when oldest slot ages out) and daily cap (retry at UTC midnight), resets next day; forged costs clamped, per-user fleet share capped; budget crossing logs once at 80% and 100%; continuation cap allows 5 then rejects, resets on fresh turn; env overrides + junk fallbacks; transcribe limiter unchanged on the generic core | `[x]` |
| T-834 | F-471, F-797 | U | Next guard helpers + client cap (`api/chat/helpers/ai-guard-response.test.ts`, `use-chat/continuation-cap.test.ts`, `api/transcribe/helpers/cost.test.ts`, `packages/models/src/llm/__tests__/max-output-tokens.test.ts`) | 503 for kill switch/budget, 429 for user limits, `{ error, code }` body + Retry-After; turn key from last user message, continuation when last message is assistant; client allows 5 auto-continuations then stops; Whisper estimate bounded; chat output cap 32k ≤ context window | `[x]` |
| T-835 | F-797, F-471, F-474, F-475, F-513 | E (auth) | With `bunx convex env set AI_DISABLED true`: send a chat message, inline edit, tab complete, ask for a title/suggestions; then unset. Then set `AI_REQUESTS_PER_MINUTE=2` and send 3 quick chat messages; set `AI_FREE_DAILY_USD=0.0001` as a free user and send one | Paused: every surface shows "AI is paused right now. Please try again later." and no model call is logged. Rate: third message shows "You're sending AI requests very quickly. Try again in … seconds." Spend: next message shows the usage-limit message with a retry time. Chat error bubble renders each message. | `[ ]` manual |
| T-836 | F-471, F-797 | E (auth + project) | Ask the agent for a task needing many client tool steps (e.g. edit 8 files one by one) | After 5 automatic continuations the chat stops and a toast says it paused; sending "continue" resumes. A forged 6th continuation POST gets 429 with the continuation message. | `[ ]` manual |
| T-122 | F-122 | E | Watch creation | Phases progress; error surfaces if failure | `[ ]` |
| T-123 | F-123 | M | Submit prompt | AI plan returned (F-687) | `[ ]` |
| T-124 | F-124, F-125 | E | Browse marketplace + click template | Template detail loads | `[ ]` |
| T-125 | F-127 | M | Upload zip | Local import succeeds | `[ ]` |
| T-126 | F-128, F-533 | E (mocked GH) | OAuth + repo list + clone | Repo cloned into sandbox | `[ ]` |
| T-127 | F-129, F-531 | M | Figma OAuth (currently `#disabled`) | Error copy shown | `[ ]` |
| T-819 | F-129 | U | `scaffoldFigmaProjectFiles` over frames incl. name collisions (`packages/figma/test/scaffold.test.ts`) | One component file per frame + `src/app/page.tsx`; colliding names de-duped (`Hero`, `Hero2`, `Hero3`); page imports stay in sync | `[x]` |
| T-820 | F-129 | E (real PAT + Figma file) | `/projects/import` → Figma card → paste URL + PAT → Fetch Frames → select → Create Project | Next.js sandbox provisioned, one editable component per frame overlaid, editor opens with frames rendered | `[ ]` |
| T-128 | F-131, F-159 | E | Visit invalid id | Variant-specific error (not-found / unauthorized / invalid) | `[ ]` |
| T-129 | F-134, F-537, F-594 | E | Toggle page access | Convex `pageAccess` row written; non-member loses access | `[ ]` |
| T-130 | F-135 | U | Drive `CreateManager` phases | Each phase transitions correctly | `[ ]` |
| T-809 | F-782, F-540 | E | Clone a website from a URL (and from a screenshot) via the dashboard dialog | Scrape succeeds; project provisions; editor opens and the AI receives the clone prompt + screenshot. Pure helpers covered by `clone-prompt.test.ts` (U, passing). | `[ ]` |

---

## 6. Editor Shell

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-150 | F-150 | E | Open seeded project | Loads < 5 s; no crash | `[ ]` |
| T-151 | F-151 | E | Resize to 375 px | Mobile layout switches; tab switcher works | `[ ]` |
| T-152 | F-152 | M | First-time-user fixture | Tooltips in order; dismiss persists | `[ ]` |
| T-153 | F-153, F-154, F-155 | M | Toggle devtools offline | Banner shows; panel fallback; bootstrap path used on reload | `[ ]` |
| T-154 | F-156 | E | Edit page settings | Persists to `frames` (F-597) or `projectSettings` (F-591) | `[ ]` |
| T-155 | F-157 | E | Clone | New project appears in list | `[ ]` |
| T-156 | F-158 | E | Press `?` | Modal opens; groups visible | `[ ]` |
| T-157 | F-160 | I | Throw inside canvas | Boundary catches; rest of editor stays usable | `[ ]` |

---

## 7. Canvas & Preview

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-170 | F-170, F-641 | E | Pinch + scroll | Zoom % matches UI; pan smooth | `[ ]` |
| T-171 | F-171, F-172 | M | Multi-breakpoint | Each frame renders independently | `[ ]` |
| T-172 | F-173, F-703 | I | Mount frame + assert handshake | `frame-connection` resolves; preload-script attaches | `[ ]` |
| T-173 | F-176 | E | Drag handle | Snap to breakpoint (F-646) | `[ ]` |
| T-174 | F-177 | E | Drag select, place pin, two-session cursors | Selection rect; pin position correct; remote cursor visible | `[ ]` |
| T-175 | F-178 | E | Click recenter | Viewport centers | `[ ]` |
| T-176 | F-179 | M | Visual | Rulers render at correct scale | `[ ]` |
| T-177 | F-181 | U + E | Press Z/V/H/C | Tool changes; suppressed in input focus | `[ ]` |
| T-178 | F-182 | E | Open preview overlay | Resizable; theme toggle works | `[ ]` |

---

## 8. Top Bar

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-200 | F-201 | E | Edit name | Persists | `[ ]` |
| T-201 | F-202, F-662 | E | Click → select branch | Editor reloads for branch (F-590) | `[ ]` |
| T-202 | F-204 | E | Click Design / Code / Preview | Panels swap; URL stable | `[ ]` |
| T-203 | F-205, F-667 | E (mocked GH) | Commit / push / pull | Files persist; Octokit asserted; conflicts surface | `[ ]` |
| T-204 | F-208 | E | Open diff | Pre-publish diff renders | `[ ]` |
| T-205 | F-209, F-549, F-721 | E (mocked Freestyle) | Publish + history | Deploy stub returns; row in `deployments` (F-613) | `[ ]` |
| T-206 | F-209, F-527, F-549 (disabled-flow) | I + M | Call deployment create, run, unpublish, and redeploy; try publish in UI | Each server action fails before creating a row or starting external work; UI reports unavailable. | `[ ]` |

---

## 9. Left Panel — Design

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-220 | F-222 | E | Drag node | DOM reorders; lock prevents drag | `[ ]` |
| T-221 | F-223 | E | Type filter | Component list filters | `[ ]` |
| T-222 | F-224, F-649 | E | Drag into canvas | Element inserts at drop | `[ ]` |
| T-223 | F-225, F-655, F-553 | E | Upload + bulk delete | Asset persists / removes via Convex storage | `[ ]` |
| T-224 | F-226, F-640, F-639 | E | Edit color token; pick font | CSS vars update; font loads | `[ ]` |
| T-839 | F-800 | U | Color class binding (`tokens/color-binding.test.ts`) | Finds `bg-brand` / `text-(--x)` / palette bindings, ignores variants and sizes, swaps color classes without touching others | `[x]` |
| T-840 | F-800 | E (auth + local project) | Open Variables tab, create a color, bind it to a fill with the connect button, edit it from the hover pencil, then detach | Chip shows the variable; edit updates globals.css and canvas; detach leaves the same color as a literal class | `[ ]` manual |
| T-225 | F-227, F-666 | E | Create / delete / rename pages | Persists; routes update | `[ ]` |
| T-226 | F-229 | E | Switch branch | Editor reloads (T-201 ref) | `[ ]` |
| T-227 | F-230 | E | Search | Filters across layers + assets | `[ ]` |
| T-228 | F-232 | E | Adjust zoom | Canvas zooms | `[ ]` |

---

## 10. Left Panel — Code

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-250 | F-250, F-637 | E | Switch to Code mode + edit | Monaco mounts; debounced `CodeManager.write` fires | `[ ]` |

---

## 11. Right Panel — Style

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-260 | F-260 | E | Click tabs | Resize persists between switches | `[ ]` |
| T-261 | F-264 | E + U | Set padding `12px` / bg color | AST round-trip preserves; CSS applies | `[ ]` |
| T-262 | F-261…F-263 | M | Confirm `#deprecated` flag visible to anyone reading | Tab variants not active by default | `[ ]` |

---

## 12. Right Panel — Chat (AI)

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-280 | F-280 | M | Open chat | No empty-state crash | `[ ]` |
| T-281 | F-282 | U | Type `/` and `@` | Slash and mention pickers appear | `[ ]` |
| T-282 | F-283 | I | Mock streamed response | Markdown + code blocks render incrementally | `[ ]` |
| T-283 | F-284 | E | Select element → send | Context pill attached; backend gets context | `[ ]` |
| T-284 | F-285, F-637 | E | Receive diff → Accept / Reject | Apply via `CodeManager.write`; reject keeps file clean | `[ ]` |
| T-285 | F-286 | U | Switch model | Persists per conversation (F-599) | `[ ]` |
| T-286 | F-287 | M | New conversation | Suggested prompts (F-513) render | `[ ]` |
| T-287 | F-288, F-522 | E | New conv → switch → delete | Convex `conversations` reflects state | `[ ]` |
| T-288 | F-290 | I | Trigger render error in chat | Error boundary catches; chat unmounts cleanly | `[ ]` |
| T-289 | F-291 | U | Mount composer in two surfaces | Same behavior across both | `[ ]` |
| T-810 | F-292 | U | `waitForChatReady` ready / late-attach / timeout | Resolves once the action wires up; rejects after the budget (`wait-for-chat-ready.test.ts`) | `[x]` |
| T-811 | F-292 | E | Select element → corner AI button → type + Send | Popover shows the tag header; chat panel reveals and the edit streams against the element | `[ ]` |
| T-812 | F-292 | E | Corner AI button → Add to chat | Chat reveals + input focused, element attached as a context pill, nothing sent | `[ ]` |
| T-813 | F-783 | U | `@weblab/figma-clipboard` encode → decode round-trip (`packages/figma-clipboard/test/encode.test.ts`) | HTML has `(figmeta)`/`(figma)` markers; decoded `NODE_CHANGES` tree has correct types/size/fills/text/corner-radius; hidden + zero-size nodes skipped | `[x]` |
| T-814 | F-783 | E | Select an element → Copy to Figma (any of the 4 surfaces) → `Cmd/Ctrl+V` into a real Figma file | Pastes as a **selectable, editable** frame/text/shape (not a flat image) at the right size with the right fill/text; repeat with a frame selected (frame toolbar Figma button + right-click) | `[ ]` |
| T-815 | F-785 | U | Component registry + prompt + skill wiring (`packages/ai/test/prompt/component-registry.test.ts`) | `COMPONENT_REGISTRY` items well-formed, no dup lib+name, correct ui/watermelon-ui import folder; `COMPONENT_REGISTRY_PROMPT` lists every import path + has default-stack / never-hardcode / tokens / existing-project / escape-hatch text + points at `read_skill("shadcn")`; `DESIGN_SYSTEM_PROMPT` keeps Rule 0 + existing-project-wins + defaults-not-censorship + never-introduce-new-color; nextjs stable block carries `<design-system>`+`<component-registry>`+`<anti-slop-checklist>`+a sample import path; static-html omits `<component-registry>`/`<shadcn-block-catalog>`; provider path injects all three; checklist is the final block; embedded `shadcn` skill exists with catalog + install patterns in its body | `[x]` |
| T-837 | F-799 | U | CLI mapping + helpers (`apps/desktop/cli/cli-events.test.js`, `apps/web/client/src/lib/cli-chat/{session,tool-label}.test.ts`) | Claude stream-json → text/reasoning deltas once, tool_use/tool_result → `data-cli-tool` cards (never AI SDK tool parts), new step after tool results, sub-agent events skipped, session id captured; args keep acceptEdits + Bash disallowed and never bypassPermissions; Codex deltas/items map to chunks, file-change approvals accepted only inside the folder (moves and grantRoot refused), commands declined; sign-in probe parsing; resume only when the previous reply came from the stored session | `[x]` |
| T-838 | F-799 | M (desktop) | On a local project pick Claude Code, ask for a text change, then a follow-up; repeat with Codex; press Stop mid-turn; sign out of the CLI and retry; open a cloud project and open the picker | Reply streams in chat with action cards; the file change shows in the canvas/code without reload; follow-up remembers context; Stop ends the turn and leaves no `claude`/`codex app-server` child running; signed-out CLI shows "not signed in, run …" in chat; handoff lists the CLI edits; cloud project shows both providers disabled with "Open a local folder to use …" | `[ ]` |
| T-841 | F-801 | U + E (desktop) | Unit-test issue classification, safe prompt, and read-only CLI approvals; in desktop fail the native binding or preview port and stall each setup phase for 30 seconds, click Fix startup with both providers, switch branch mid-send, and add queued chat messages | Button appears only on local setup failures or slow setup; diagnosis uses the active private copy, sends no raw log or old chat history, cannot edit on the first turn, lists proposed files, and never sends to a different branch. After explicit chat approval the private copy can be edited and Try again retries the preview. Unready providers explain sign-in. | `[ ]` E / `[x]` U |
| T-846 | F-804, F-805, F-812 | U + real file/Git fixtures | `apps/desktop/release/{authorize,ipc,policy,store,vercel,service}.test.js`, `release-snapshot.test.js`, `src/lib/local-publishing.test.ts` | Fresh bound session; origin/current-frame/cancel; frozen clean bytes, omitted credentials; split protected preview/production, uncertain request no retry, exact rollback and sticky outside routing review | `[~]` source authorization/intent/renderer checks pass; provider/package and coordinator pending |
| T-847 | F-804, F-805, F-812 | M (new package + disposable Vercel project) | Customer account connect, full review, preview, failed build, live switch, close before/after POST, restart, revoked role/account switch, outside publish, restore previous version | No false saved/live claim or duplicate sent request; original source and other projects unchanged; aliases and actual website match reviewed release | `[ ]` source is not provider/package proof |
| T-848 | F-517, F-806, F-809 | U (registered handlers + serialization) | `convex/lib/cmsRevision.test.ts`, `cmsFieldConfig.test.ts`, `src/lib/cms-draft-state.test.ts` | CAS conflict; native-only writes; active/archive before bounded pagination; archive retains values/slug; repair changed schema without deleting old fields; restored draft; frozen references only eligible target collection; v2 frozen public choice/reference/link config, no private metadata or silent legacy normalization | `[~]` latest cmsRevision27 pass; v2 configuration source review and final web-client typecheck pass; deployed transaction/UI proof pending |
| T-849 | F-807, F-808, F-810, F-811, F-515 | U (mock provider + registered action/mutation) | `convex/lib/sanityAdapter.test.ts`, `sanityPilotContract.test.ts` | Draft CAS, raw metadata preservation, deterministic new draft; reserved scheduler ownership/capability/source pin; unknown never resends; revoked access or credential rotation blocks; atomic mapping rechecks/tombstone guards | `[x]` 32 checks; mocked HTTP is not Sanity/Convex runtime proof |
| T-850 | F-806–F-811, F-517 | M (authorized CMS test backend + website) | Blog/template CRUD, image original upload, ready revision freeze, competing save, archive/repair/restore, publish website only, optional publish Sanity documents, each separate rollback | Frozen content/assets/routes and exactly reviewed documents affect only selected target; draft or archive is not live until review; prior deployed content survives unrelated draft edits | `[ ]` runtime binder/assets/customer modes/document publish incomplete |
| T-851 | F-514, F-380 | U + M (preview) | `apps/web/preload/script/api/cms-overlay.test.ts`; archive bound item, remove binding, apply HMR/source change, repeat list | Removed content restores original DOM nodes/src/background; no stale overlay, lost listeners or overwritten later source; repeat remains correct | `[~]` focused overlay14/14; new bundle/browser proof pending |
| T-852 | F-813 | U + M (native session/navigation) | `src/lib/working-level.test.ts`; full-page Simple/Advanced first-open choice, keyboard/retained-modal focus, settings next-entry latch, owner switch, pending initialization, refused dirty buffers, failed text/history persistence and arbitrary route exit | No hidden full engine in Content/pending; old buffers retained until safe handoff; no project access granted by preference | `[~]` 16 source fixtures passed; package/page-exit proof pending |
| T-853 | F-634, F-250, F-813 | U (real managers, injected source/storage/UI geometry) | `editor/teardown.test.ts`, `text/session.test.ts`, `action/rebase-recovery.test.ts` | All-history admission, held-B/late-A checkpoint, strict actual storage receipt, source drift, cached rich text, normal-blur local lease, failed responsive intention cannot disappear during teardown | `[~]` latest teardown19 + text8 + rebase9 pass, including local text lease; web-client typecheck passes; package/UI boundaries pending |
| T-854 | F-814 | U + M (actual native editor) | `src/lib/code-drafts.test.ts`; actual EditorView/React integration, native leave/back/quit, source drift and normalized cloud save | Parallel/owner-isolated drafts; final filtered dispatch and Undo filter:false; failed quota/forward rollback keeps accepted prior; stale props cannot overwrite later buffer; Save-and-close never removes newer edit | `[~]` latest19 non-DOM fixtures pass; independent source review and web-client typecheck complete; actual view/package proof unchecked |

| T-855 | F-815 | U | `packages/file-system/src/durable-source.test.ts`, `code-fs-local.test.ts`, `fs-cloud-cache.test.ts`, `sandbox/cloud-source.test.ts` | Atomic writes before cache/index acknowledgment, fresh copied IDs, delayed cleanup fencing, source conflict and actor-safe retry, exact binary/preparation recovery, cloud cache isolation/disposal without native persistence changes, truthful acknowledged-save state | `[x]` source fixtures and actual ZenFS isolation/lifecycle checked including reversed-copy-order and download-only preparation recovery; customer browser lifecycle remains in T-858 |
| T-856 | F-816 | U + E (isolated backend) | `convex/lib/cloudEditor-handlers.test.ts`, `cloudEditor.test.ts`, `cloudEditorUploads.test.ts`, `cloudEditorCleanup.test.ts`, `cloudEditorTemplate.test.ts` | Scope/actor/CAS, limits, retry receipts, staged upload ownership, exact deleted-branch cleanup, pinned two-page template; real concurrent requests and authorization | `[~]` handlers/validators/uploads/template/cleanup checked; isolated real source CRUD, binary image and concurrent CAS checked; full visual acceptance pending |
| T-857 | F-817 | U + E (browser/runtime) | `cloudPreviewGateway.test.ts`, `src/lib/cloud-editor/preview-url.test.ts`; desktop/phone/popout/HMR | HTTP/assets/WS deny missing/expired/wrong capabilities; no token persistence, cross-origin leak or legacy restore; runtime replacement preserves page and saved content | `[~]` gateway6 and URL6 checked; browser/runtime pending |
| T-858 | F-815–F-817 | E (original product brief) | Real Weblab editor, invited customer, allowed fields/properties/templates/blocks, preview/publish/rollback and constrained AI | Visual edit→save→reload; client cannot unlock design; separate publish grant; reviewed immutable release; failed publish preserves live; rollback and constrained chat | `[ ]` builder inline save/readback/hard reload, Undo/Redo, responsive font size and Home/About navigation live-checked 2026-10-02; multiline paste/readback checked. Customer OTP returns to the project and the real canvas opens after the cache fix. An approved text edit exposed compiler-empty JSX spacing rejection. The reviewed fix passes captured-candidate and real source checks; customer browser save/reload remains unaccepted. Original-brief customer workflow and publishing remain unfinished |
| T-859 | F-818 | U | `convex/lib/cloudEditorAccess.test.ts` | Current membership and grant both required; role downgrade cannot restore management; creator safeguards and separate publish flag | `[x]` 10 source cases; customer UI and real invited-account flow pending |
| T-860 | F-818 | U | `convex/lib/cloudContentContract.test.ts` | Strict whole-file AST validation outside approved literal values; safe direct page targets, owned image paths, exact choices; real parser/formatter multiline output; comparison-only empty newline spacing with atomic fingerprint refresh | `[x]` contract/handler subset 38 cases / 291 assertions; real CodeFS formatter compatibility and exact failed browser candidate checked; repeated save/Undo preserves existing approval metadata |
| T-861 | F-819, F-818 | U + M (isolated customer session) | `cloudEditorContent-handlers.test.ts`, `cloudContentContract.test.ts`, `action/cloud-attribute.test.ts`, `sandbox/cloud-source.test.ts`, `sandbox/cloud-recovery.test.ts`; designer field approval then customer canvas edit | Reject unapproved assets/links/classes, style/code/path/contract drift, cross-file identity collisions and role revocation; exact retries; preserve recovery protocol and actor/generation-pinned attribute history; confirmed failed-text reload without replay, exact journal CAS, cancelled/failed navigation retains download; localized label serialization; no customer startup source writes; save/reload/undo on actual canvas | `[~]` 38 contract/handler, previous 56 action/history/source/recovery and final 73 source/text/history cases checked; real-customer text/class/link/image/alt save/retry/restore, unauthorized changes and access revocation checked; customer browser acceptance pending |
| T-862 | F-820, F-816 | U + M (isolated runtime) | `cloudEditor-preview-allowance.test.ts`, `cloudPreviewGateway.test.ts`, `cloudEditorCleanup.test.ts`; two accounts and removed-member preview | One-use actor reservation, canceled allowance, no customer dependency preparation, no save-triggered VM start; opaque tickets, current HTTP/WS authorization, active-stream cutoff within polling+timeout bound, exact cleanup | `[~]` allowance source fixtures checked; gateway/live acceptance pending |
| T-863 | F-821, F-813 | U + M | `sanity-blog-recovery.test.ts`, `working-level.test.ts`; Content/Full native handoff and modal | Persist-before-accept, owner/scope/writer isolation, storage failure, unknown create/save intent, exact receipt rebase, newer typing, long typing and near256KiB document, structural suffix/replay, corrupt intent and field maximum rejection, inactive modal/style menu | `[~]` recovery19 + unchanged working-level17 source fixtures checked; final type/lint RAM-stopped143, mounted app/quit acceptance pending |
| T-864 | F-822–F-824, F-804 | U | `sanityBlog-handlers.test.ts` registered handlers with fixture auth/DB | Real capability checks, stale provider/local/connection pins, capture-once baseline, idempotent create, archive/restore and reserved slug, bounded draft pages/cleanup and false live gate | `[~]` 10 source cases checked, including selected export/publication list and structural CAS/refusal without writes; real Convex transaction/deployed acceptance pending |
| T-865 | F-822 | U | `sanityBlogContract.test.ts`, `sanityBlogReader.test.ts` | Actual source schema, preserved unknown metadata/PT/image/SEO, stable paragraph keys, styles/decorators with reserved annotations refused, encoded existing Unicode URL, strict new URLs, GET-only fixed-host DNS/response bounds and published cursor | `[x]` contract19 + unchanged reader11 focused fixtures checked; source evidence |
| T-866 | F-821–F-824 | M + guarded integration | a customer copy; Node published GET reader | All198 distinct published records via cursor, three raw captures and local title edits preserving every other field; no original/provider writes; full open/save/reopen/archive desktop loop | `[~]` reader proof passed, original remains clean; installed/backend/UI/frozen release proof pending |
| T-867 | F-825 | U + M | `cloudContentImage*.test.ts`, `images/decode.test.ts`, `sandbox/cloud-images.test.ts`, `action/cloud-attribute.test.ts` | Decode/size/ownership rejection, exclusive save lease, successful receipt despite refresh failure, no-op cleanup, uncertain-send retention, upload/undo/reload on canvas | `[~]` focused source checks pass; actual customer browser and deployed decoder pending |
| T-868 | F-826 | U + M | `cloudEditorInvitations.test.ts`, `cloudEditorAccess.test.ts`; real invited/removed accounts | Verified email and issuer authority, independent publish grant, revocation including aliases, concurrent claims, telemetry token exclusion | `[~]` 26 invite/access/image regression cases pass; deployed invitation handoff pending |
| T-869 | F-827 | U + M | `cloudStudio*.test.ts`, `sandbox/cloud-source.test.ts`, Journal draft recovery fixtures | Atomic source/CMS receipt, generation/item CAS, approved slots and page conflicts, immutable live baseline, semantic unknown recovery, per-writer draft retention | `[~]` 62 Studio/source cases pass; latest draft helpers and mounted end-to-end flow pending |
| T-875 | F-833, F-828 | U + M | `cloud-releases/review-launch.test.ts`; local browser with mounted actual launch component and deferred dummy Clerk/Convex | Direct anchor to populated launch; StrictMode one issue; account switch/sign-out/unmount discard stale completion; manual retry uses new ticket; exact cross-origin POST Origin and body; no secret URL | `[~]` six focused cases and mounted/local POST proof pass. Live authenticated launcher and production response headers pending |
| T-876 | F-057, F-753, F-039 | U + M | `_components/sw-private-cache.test.ts`; actual worker in local browser | Only anonymous allowlisted assets cached; private/project/API/RSC/query denial; old owned cache purged, unrelated cache retained; cookie omitted; offline copy matches reopening limits | `[~]` eight focused cases and browser cache/cookie proof pass. Production migration and localized fallback remain pending |
| T-870 | F-828 | U + M + provider | `cloudBackups.test.ts`, `cloudRelease*.test.ts`, `cloud-releases/{state,review-proxy,review-routing,review-session}.test.ts`, `cloudEditorCleanup.test.ts` | Immutable artifact/asset closure, destination lock and uncertain provider response, exact confirmation baseline and persisted retry identity, provider system-variable exclusion and live CDN credential-exposure probe, strict public Host routing behind the reverse proxy, Clerk-free review routing, composed provider/proxy replay and redacted fixed-stage failures, and one-use ticket/cookie/current-revocation checks, retention/deletion and authorized named-backup discovery, actual publish/rollback/restore | `[~]` actual private HTML/JS/CSS, exact no-store/CSP, alias isolation, denied/replayed/revoked/expired ticket cases pass after reviewed telemetry/header fixes. Customer review click stalled atabout:blank in T3; cause unestablished. Customer publish/rollback, natural15-minute session expiry and opened restored-copy remain unproved. Evening resources stopped/deleted; no beta acceptance |
| T-871 | F-829 | U + packaged M | `desktop-profile.test.js`, `desktop-handoff.test.ts`, `desktop-handoff-handler.test.ts`, `package.test.js`; clean beta package and OS auth callback | Immutable origin, isolated data/protocol/cookies, bootstrap refusal, no signing/publish hooks; real sign-in and package metadata match | `[~]` 59 earlier source cases checked; current profile/engine41 pass, real installed SDK fixture; unsigned Mac package built/launched and metadata checked; OS callback/connected proof pending |
| T-872 | F-830, F-822 | U + connected I | `native-content-export.test.ts`, `sanityBlog-handlers.test.ts`; hosted bearer export | Current project rights and exact draft/connection pins, bounded stalled/malformed requests, no cookies/provider writes/raw leakage | `[~]` export7 and handler10 source cases checked; private hosted backend activation pending |
| T-873 | F-831, F-805, F-813 | U + private-copy M | `freeze.test.js`, `sanity-site-install.test.js`, `sanity-content.test.js`, `ipc.test.js`, `sanity-publication-selection.test.ts`, `local-publishing.test.ts`; Content/Full saved draft selection and cancelled/restarted preparation | Preserve all fixed site queries/routes and SDK image crop; disable writers before mutation; refuse third bytes, stale pins and foreign scope; retained recovery stays gated until verified fresh preparation; only owned complete assets enter release | `[~]` engine15, installer21, coordinator17 and UI/helper/IPC28 source cases checked; actual private blog save/archive/restore/reopen observed; automatic instrumentation exposed mirror/history refusal. Guarded handoff preparation18, history14 and mirror4 source fixtures pass with type/lint and independent review; repair activation, real Full preparation, outside-edit refusal/reopen, actual SDK/image capture and install/build remain pending |
| T-874 | F-832 | U + isolated backend M | `convex/lib/nativeReleaseState.test.ts`; actual registered worker/concurrent transactions later | Global account/project exclusion, exact retry pins and identity, cancel/send history, original scheduler terminal proof, closed send gate | `[~]`19 synthetic registered-handler cases, current shared typecheck and scoped lint checked; independent review accepted. Actual Convex transaction/scheduling and native/provider integration pending |
| T-883 | F-842 | U + packaged M | `apps/desktop/preview-env.test.js`; in the desktop app open a private copy whose site reads an env value, add it under Settings → Project → Preview keys, then remove it | Tests pass. Preview restarts and renders with the value; the name is listed without its value; removing it restarts the preview without it; reserved names such as `PATH` and `NODE_OPTIONS` are refused; nothing appears in the project folder or the handoff plan |

| T-816 | F-787 | U+E | Pop-out preview helpers (`canvas/frame/preview-url.test.ts`) + manual flow | **U (automated):** `toPreviewableUrl` substitutes single/multiple `[slug]` segments, leaves static URLs; `getPopoutRoute` → `/project/<id>/preview`; `openPreviewWindow` routes cloud (`vercel.run`)→wrapper route, local (`localhost`)→raw previewable URL, window-mode passes `width=1280`, tab-mode omits sizing. **E (manual):** top-bar "Open preview window" → tab + window both load the live site; edit in editor → popout **hot-reloads** without manual refresh; toggle Auto-recover off then force sandbox cold-boot/recycle → dead page (off) vs reconnect-chip + auto-reload (on); local project popout opens raw `localhost` URL | `[x]` U / `[ ]` E |
| T-817 | F-788 | U | Component system parser transforms (`packages/parser/test/component-discover.test.ts`, `component-props.test.ts`, `component-extract.test.ts`) | Discovery: TS-typed + destructured + HOC-wrapped + `export {}` specifier components; prop types (text/number/switch/image/link), bindings (text-child/attr/visibility/slot-site), plain-map + cva variants, spread + unsupported props. Prop codegen: text/image/switch creation w/ defaults hoisted, duplicate + dynamic-text rejection, rest-element ordering, instance attr parsing. Extract: subtree → new component file w/ hoisted props + copied imports, closure-capture hard fail, suggested extractions. Variants: addVariantProp → `cn(base, map[variant])`, member add/update, single-literal → union promotion. Detach: master inlined w/ instance values, variant resolved to classes, children spliced, import dropped on last usage | `[x]` |
| T-818 | F-789 | U+E | HTML stamping engine (`packages/parser/test/component-html-stamp.test.ts`) + manual flow | **U (automated):** manifest → ComponentDef; stampInstance substitutes props, scopes oids (`oid~instance`), resolves `{{variant:class}}`, honors `data-wb-if`, fills slots (instance content keeps page oids); restampPage preserves props/slots and is idempotent (2nd pass = no diff); detach removes markers + re-oids; stripComponentMarkers cleans publish output; extractHtmlComponent builds partial + stamped replacement. **E (manual, static-HTML project):** create component from selection → partial appears in `weblab/components/`; edit master partial → all stamped instances re-render w/ per-instance props intact | `[x]` U / `[ ]` E |

---

## 13. Right Panel — Interactions & Comments

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-300 | F-300, F-654 | E | Add onClick → toast | Behavior wires; preview fires | `[ ]` |
| T-301 | F-301, F-524, F-525 | E | Add comment + reply + resolve | Convex `projectComments` (F-607) + `commentReplies` (F-608) updated | `[ ]` |

---

## 14. Editor Bar

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-310 | F-310 | E | Select different element types | Correct variant renders (F-311 to F-314) | `[ ]` |
| T-311 | F-315 | U | Pick from each dropdown | CSS prop applies; AST diff matches | `[ ]` |
| T-312 | F-316, F-317 | U | Enter advanced value | Validates + applies | `[ ]` |
| T-313 | F-320 | E | Resize narrow | Hidden controls move into overflow menu | `[ ]` |

---

## 15. Bottom Bar

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-330 | F-330 | E | Click each tool | Cursor + canvas mode update | `[ ]` |
| T-331 | F-331, F-332 | I | Run `echo hi` | Terminal shows "hi" | `[ ]` |
| T-331a | F-331, F-331a, F-331b | M | Open terminal; toolbar still visible; type `echo hi` in input row + Enter; click `+` for a 2nd tab; close it; drag-reorder; drag top edge to resize | Toolbar stays; command runs in PTY; tabs add/close/reorder; height changes + persists across reopen | `[ ]` |
| T-331b | F-331b, F-480 | M | Toggle AI on; type "list files in this folder" + Enter (preview); Enter again to run; enable auto-run in settings; repeat | First Enter previews a command in the box; second Enter runs it; auto-run runs immediately | `[ ]` |
| T-480 | F-480 | I | POST `/api/ai/terminal-command` `{instruction:"install three.js", projectId}` | 200 `{ command }` ≈ `bun add three`; 401/403/402 enforced; sanitized single line | `[ ]` |
| T-481 | F-481, F-018 | I | GET `/api/download/mac`, `/api/download/windows`, `/api/download/linux`, `/api/download/bogus`; click Download on `/download` | First three 302 to the matching `releases/latest/download` asset (browser saves the file, no GitHub page); `bogus` → 404; page links never point at github.com pages | `[ ]` |
| T-332 | F-333, F-665 | E | Inject runtime error in preview | Listed w/ stack; Quick-Fix opens chat w/ context | `[ ]` |
| T-333 | F-334 | E | Toggle theme | Preview iframe `data-theme` flips | `[ ]` |
| T-334 | F-335, F-658 | M | Click restart | Sandbox session resets; frame reconnects | `[ ]` |

---

## 16. Context Menus, Palettes, Search

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-340 | F-340, F-633 | E | Copy / paste / duplicate / delete / group / convert-to-component | DOM updates; AST diff correct; group inserts wrapper | `[ ]` |
| T-341 | F-341 | E | Drag from palette | Inserts at drop | `[ ]` |
| T-342 | F-342 | E | Cmd-K → search "publish" | Runs the publish flow | `[ ]` |
| T-343 | F-343 | E | Cmd-P → search file | Opens in code panel | `[ ]` |
| T-344 | F-344 | E | Project search query | Returns matching content | `[ ]` |

---

## 17. Members & Branches

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-360 | F-360, F-542 | E | Invite by email; remove member | Convex `projectInvitations` + `projectMembers` reflect | `[ ]` |
| T-361 | F-361, F-512 | M | Fork branch on Vercel (currently `#disabled`) | Clear error per `TODO(sandbox-fork)` | `[ ]` |
| T-362 | F-634, F-662 | I | Undo on branch A → switch B | History scoped per branch | `[ ]` |

---

## 18. CMS Workspace

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-380 | F-381, F-518 | E | List collections | Renders seeded collections | `[ ]` |
| T-381 | F-382, F-516 | E | Connect mock source | Source appears; auth challenge handled | `[ ]` |
| T-382 | F-383, F-519 | E | Add field | Schema persists in `cmsFields` (F-603) | `[ ]` |
| T-383 | F-384, F-385, F-517 | E | List, filter, sort, edit, save | Pagination works; validation enforces | `[ ]` |
| T-384 | F-386, F-514 | E | Bind text field → heading | Preview replaces text with bound value | `[ ]` |
| T-385 | F-387, F-520 | E | Define `/[slug]` route | Dynamic page generated | `[ ]` |
| T-386 | F-388 | E | Map external → internal | Mapping saved | `[ ]` |
| T-387 | F-389, F-516 | E | Connect-source wizard | Validates URL + auth | `[ ]` |
| T-388 | F-390 | E | New collection wizard | Schema created | `[ ]` |
| T-389 | F-391 | E | Edit URL | Persists + re-tests | `[ ]` |
| T-390 | F-392, F-703 | I | Trigger render | Preview iframe receives data via penpal | `[ ]` |

---

## 19. Editor Modals (general)

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-400 | F-400, F-450, F-555 | E (test mode) | Trigger upgrade | Stripe checkout opens | `[ ]` |
| T-401 | F-401, F-420…F-439 | E | Open every tab | No crash; persistence per tab (see 20) | `[ ]` |
| T-402 | F-402, F-421 | E | Open from marketing | Non-project shell loads | `[ ]` |

---

## 20. Settings Modal — tabs

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-420 | F-422 | E | Edit name/email; delete (F-435) | `users` (F-580) updates; delete prompts confirmation | `[ ]` |
| T-421 | F-423, F-687 | E | Switch model, paste provider key | Persists in `userSettings` (F-581); chat uses new model | `[ ]` |
| T-422 | F-424 | E | Toggle theme + density | `<html>` reflects | `[ ]` |
| T-423 | F-425 | E | Toggle autosave / snap / lint | `userSettings` updates; editor obeys | `[ ]` |
| T-424 | F-426, F-427, F-533 | E (mocked GH) | Connect GitHub | OAuth → `providerConnections` (F-582) | `[ ]` |
| T-425 | F-428 | E | Pick locale | F-754 next-intl reloads | `[ ]` |
| T-426 | F-429 | E | Toggle prefs | Persists | `[ ]` |
| T-427 | F-430 | E | Rebind key | Persists in `userSettings` | `[ ]` |
| T-428 | F-431, F-555, F-619 | E (test mode) | Open portal | Portal URL returned | `[ ]` |
| T-429 | F-432, F-555 | E (test mode) | Submit cancel reasons | Sub status → canceled (F-619) | `[ ]` |
| T-430 | F-433, F-552 | E | Toggle skill | `skills` (F-616) updates | `[ ]` |
| T-431 | F-434 | E | Open versions | Empty state when none; renders list when present | `[ ]` |
| T-432 | F-436 | E | Edit project meta | `projects` (F-589) updates | `[ ]` |
| T-433 | F-437 | E | Edit favicon + OG | `projectSettings` (F-591) updates | `[ ]` |
| T-434 | F-438, F-528, F-609 | E (mock DNS) | Attach + verify custom domain | Verification state machine transitions | `[ ]` |
| T-438 | F-438, F-530 | U | Weblab preview subdomain validation (`convex/lib/previewSlug.test.ts`) | Accepts 3–48-char lowercase labels; rejects too-short/long, leading/trailing hyphen, spaces/underscores/dots/non-ascii, empty, and all reserved slugs | `[x]` |
| T-807 | F-780 | E | Site Access tab | Members list renders; role change persists via `projectMembers.updateRole`; invite-by-email calls `projectInvitationActions.create`; revoke removes pending invite; last-manager guard surfaces error | `[ ]` |
| T-808 | F-781 | E | SEO tab file editors | robots.txt / llms.txt / sitemap.xml load from `public/` (or default), edit, Save → `activeSandbox.writeFile`; AI-bot quick-insert appends standard block | `[ ]` |

---

## 21. Pricing Modal, Avatar Dropdown

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-450 | F-450 | E (test mode) | Click tier | Stripe checkout opens | `[ ]` |
| T-451 | F-451 | M | Compare `/pricing` vs modal | Same data source | `[ ]` |
| T-452 | F-452 | E | Open avatar menu | Profile / settings / theme / sign-out work | `[ ]` |
| T-453 | F-453, F-615 | M | Submit feedback | Gleap captures; `feedbacks` populated | `[ ]` |

---

## 22. REST API Routes

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-470 | F-470 | U | `GET /api/health` | `{ ok: true }` | `[x]` |
| T-471 | F-471, F-522, F-523, F-624 | I | POST chat | Stream returns; messages persisted; `aiUsageEvents` row | `[ ]` |
| T-472 | F-472 | I | POST summarize | 204; `conversations.setSummary` invoked | `[ ]` |
| T-473 | F-473 | I | GET image by id | Per-user cache isolation; 404 on miss | `[ ]` |
| T-474 | F-474 | I | POST inline-edit failure | Refund issued | `[ ]` |
| T-475 | F-475 | I | POST tab-complete past rate limit | 429 returned | `[ ]` |
| T-476 | F-476 | I | POST transcribe oversize | 413 returned | `[ ]` |
| T-771 | F-476 | U | Transcribe rolling-window helper (`convex/lib/transcribeRateLimit.test.ts`) | 10 requests/minute enforced; boundary expiry does not reset the whole bucket | `[x]` |
| T-477 | F-477, F-724 | I | POST email-capture with + without N8N env | Captured either way; forwarded when env set | `[ ]` |
| T-478 | F-478, F-716 | I | GET local models with non-loopback URL | SSRF guard rejects | `[ ]` |
| T-479 | F-479, F-555, F-720 | E (test mode) | GET promo-resume | Routes to checkout or `/pricing` based on subscription | `[ ]` |
| T-770 | F-479 | U | `isStripeCheckoutUrl` helper guard | Accepts Stripe https hosts; rejects look-alike domains, non-https, malformed URLs | `[x]` |

---

## 23. Webhooks

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-490 | F-490, F-545, F-580 | I | Replay Clerk events | `users` row created/updated | `[ ]` |
| T-491 | F-491, F-555, F-619 | I | Replay Stripe events | `subscriptions` reflects each event type | `[ ]` |
| T-492 | F-492, F-533 | I | Replay GitHub event | Convex action invoked; no crash on unknown event | `[ ]` |

---

## 24. tRPC (vestigial)

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-500 | F-500 | I | Call every sandbox lifecycle, file, setup, and command procedure as signed-in and signed-out users | All procedures fail without reading or changing a sandbox; no caller-supplied sandbox ID reaches the provider. | `[ ]` |
| T-501 | F-501 | U | `listProjectComponents` on fixture project | Returns components via regex | `[ ]` |
| T-502 | F-482, F-693 | U | `bun --filter @weblab/mcp test` — agent connector + tools + schemas (`packages/mcp/src/agent/*.test.ts`): mocked-fetch happy paths, Bearer/URL wiring, status→error-code mapping (401/403/404/400/5xx/network/bad-shape), zod input validation, confirm-gate, UNSUPPORTED stubs, env config | 32 tests pass; every error maps to the documented code; unsupported tools never hit the network | `[x]` |
| T-503 | F-482, F-693 | I | API-first QA harness against a live deployment: seed fixtures (`bunx convex run agentTestSeed:seed`) then `bun packages/mcp/src/agent/qa-runner.ts` with `WEBLAB_AGENT_API_URL` + `WEBLAB_AGENT_API_TOKEN` (+ `WEBLAB_QA_FOREIGN_PROJECT_ID`). 15 checks: onboarding/health, returning-user list, read state, ready/pending/failed status, NOT_FOUND/INVALID_INPUT/PERMISSION_DENIED, AUTH_FAILED, BACKEND_UNAVAILABLE, write-gate + logs UNSUPPORTED | 15/15 pass; exit 0; report at `docs/agent-memory/api-agent-qa-report.md` | `[x]` |

---

## 25. Convex Functions — per-module smoke

> One row per module; smoke = "call the most-used exported function with a seeded fixture and assert it doesn't throw and returns expected shape."

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-510 | F-510 | I | `aiUsageEvents.insert` + `conversationTotals` | Row persisted, total reflects | `[ ]` |
| T-511 | F-511, F-512 | I | `branches.create` + `branchActions.createBlank` | Branch + initial frame written | `[ ]` |
| T-513 | F-513 | I | `chatActions.generateTitle` w/ mock LLM | Title returned | `[ ]` |
| T-514 | F-514…F-521 | I | One CRUD op per CMS module | Each round-trips | `[ ]` |
| T-522 | F-522, F-523 | I | `conversations.upsert` + `messages.replaceConversationMessages` | Persisted; reads return | `[ ]` |
| T-524 | F-524, F-525 | I | `comments.create` + `commentReplies.create` + `comments.resolve` | Thread state transitions | `[ ]` |
| T-526 | F-526 | I | Trigger a cron tick (local) | Job runs w/o crash | `[ ]` |
| T-527 | F-527 | I | `deployments.getByType` | Returns seeded rows | `[ ]` |
| T-528 | F-528 … F-530 | I | Domain create + verify (mock DNS) | State machine completes | `[ ]` |
| T-531 | F-531 | M | Figma OAuth path (currently `#disabled`) | Returns disabled error | `[ ]` |
| T-532 | F-532 | I | `frames` CRUD | Breakpoint field round-trips | `[ ]` |
| T-533 | F-533 | I | GH webhook stub | Event branch coverage | `[ ]` |
| T-534 | F-534, F-535 | I | Hosting connection lifecycle | Token stored + revoked | `[ ]` |
| T-536 | F-536 | I | HTTP router | Webhook entries respond | `[ ]` |
| T-537 | F-537 | I | `pageAccess` CRUD | ACL persists; non-member rejected | `[ ]` |
| T-538 | F-538 | I | `ping` | OK | `[ ]` |
| T-539 | F-539, F-623 | I | Multi-session cursor write | Both sessions see other | `[ ]` |
| T-540 | F-540 … F-548 | I | Project lifecycle | Create / read / update / member / settings round-trip | `[ ]` |
| T-549 | F-549, F-550 | I | Publish action (mock Freestyle) | `deployments` row | `[ ]` |
| T-551 | F-551, F-552 | I | Skill registry + execution | Returns deterministic result for mock skill | `[ ]` |
| T-553 | F-553, F-554 | I | Upload + sign URL | URL returned; resolves blob | `[ ]` |
| T-555 | F-555, F-556, F-619 | I | `startPromoCheckout` (test mode) | Session URL returned | `[ ]` |
| T-557 | F-557, F-621 | I | Increment usage past cap | 429 on next call (F-475) | `[ ]` |
| T-826 | F-557 | U | Token-cost credit math (`convex/lib/creditCost.test.ts`) | Per-tier creditValueUsd (T1 0.125, T11 ~0.01875), usd→credits, reconciledBucketLeft floor/cap — 16 cases | `[x]` |
| T-827 | F-557 | I | `reconcileUsage` re-bases reserved credit to real cost | Pro bucket `left` adjusts by (actual−reserved) cost; free rewrites `usageRecords.amount`; one-time (replay = no-op); cost 0 → full refund; never throws to user | `[ ]` |
| T-560 | F-560, F-559 | I | User read + internal helpers | No PII leak across users | `[ ]` |
| T-562 | F-562 | I | Workspace CRUD | Slug uniqueness enforced | `[ ]` |
| T-565 | F-565, F-710 | I | Clerk JWT verification | Valid JWT accepted; spoofed rejected | `[ ]` |

---

## 26. Convex schema sanity

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-580 | F-580 … F-624 | U | Schema typecheck on `schema.ts` | `bunx convex codegen` passes; no drift | `[ ]` |
| T-581 | F-588 | I | Mutation that writes audit log | Row appears | `[ ]` |

---

## 27. Editor Store Managers

Per manager (F-630 … F-670), at least one unit test asserting:
1. State machine ordering (e.g. `HistoryManager.push / undo / redo`)
2. Branch scoping (per-branch managers isolate)
3. Event-emit shape stable (frame events, presence)

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-630 | F-630 | U | Compose engine + assert all managers attached | Engine `.managers` has expected keys | `[ ]` |
| T-634 | F-634 | U | Push / undo / redo / hydrate | Stack order + size correct | `[ ]` |
| T-637 | F-637 | U | Write debounce + `groupRequestByFile` | Same file batched | `[ ]` |
| T-642 | F-642, F-646 | U | Breakpoint binding | Frame drag past threshold snaps | `[ ]` |
| T-646 | F-646 | U | Breakpoint helpers | Correct width buckets | `[ ]` |
| T-648 | F-648 | U | `mouseover` / `shiftClick` / `clearSelectedElements` | Selection state matches expected | `[ ]` |
| T-656 | F-656 | U | Font search index | Returns expected matches | `[ ]` |
| T-658 | F-658 | U | Provider lifecycle | State machine reaches `ready` via mock | `[ ]` |
| T-661 | F-661 | U | Streaming buffer | Partial chunks render in order | `[ ]` |

---

## 28. Shared Packages

Per package (F-680 … F-705) at least one smoke test.

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-680 | F-680 | U | `APP_NAME === 'Weblab'` | True | `[ ]` |
| T-687 | F-687 | U | Provider router picks correct adapter per model | True per model | `[ ]` |
| T-689 | F-689 | U | AST round-trip on Onlook legacy fixtures | Output stable | `[ ]` |
| T-691 | F-691 | I | Vercel `scaffoldNextProject` | File tree matches expected | `[ ]` |
| T-700 | F-700 | M | Every export has demo on `/design-system` | Manual review | `[ ]` |
| T-703 | F-703 | I | Penpal handshake timeout | Surfaces error after threshold | `[ ]` |

---

## 29. Integrations

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-710 | F-710 | E | OAuth + OTP smoke per provider | Both reach `/projects` | `[ ]` |
| T-720 | F-720 | E (test mode) | Complete subscription | Plan reflected; webhook landed | `[ ]` |
| T-722 | F-722 | M | Real Vercel sandbox provision | Frame boots within budget | `[ ]` |
| T-723 | F-723 | M | Assert no production caller | grep for `codesandbox` imports = 0 outside `#deprecated` files | `[ ]` |
| T-725 | F-725 | M | Open devtools | PostHog events flush | `[ ]` |

---

## 30. Admin

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-730 | F-730 | E | Visit as non-admin | Redirect or 403 | `[ ]` |
| T-731 | F-731, F-510 | E | Visit as admin | Aggregate stats render | `[ ]` |

---

## 31. Dev / Internal

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-740 | F-740 | M | Visit `/dev/convex-smoke` | Convex connection OK | `[ ]` |
| T-741 | F-741 | U | `examples/sanity-pilot/test/content.test.ts`, `test/pages.test.tsx`, `test/studio.test.tsx`, `packages/parser/test/sanity-pilot.test.ts`, local style capability tests | Published fetch never falls back; filters/routes render; schema matches reader; singleton Studio menus/public props; isolated layout styling preserves CMS expressions. | `[x]` 34 focused checks, 2026-10-01; fixture/source proof only; standalone typecheck/build passed |
| T-742 | F-741 | M | Disposable Studio and guarded installed engine; publish/restore title, save/reload h1 desktop size, pending undo/redo, same-visit saved undo, apply local source patch | CMS expressions survive and subsequent publication retains design; desktop62px/mobile36px; article/filter/rich text/missing404 render | `[x]` bounded assisted engine proof, 2026-10-01; native folder startup, handoff-copy build, image upload and hosted publish excluded. Editor reload loses undo; source chip and CMS text policy remain open limits. |
| T-743 | F-741 | M | Disposable Sanity `k73ltzd4/production`; real `loadContent` before/after/restore of published home title, without token or code edits | Home and two posts validate; published edits reach the read-only loader. | `[x]` 2026-10-01; HTTP/content proof only; scoped typecheck/build passed |

---

## 32. Cross-Cutting

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-750 | F-750 | U | Strip required env → boot | Throws | `[ ]` |
| T-754 | F-754 | E | Switch locale | UI strings change; no missing keys | `[ ]` |
| T-755 | F-754 | U | Hardcoded-string scan | grep `>[A-Z][a-z]+ ` excluding `messages/*` = 0 | `[ ]` |
| T-756 | F-756 | E | Visit incognito | `data-theme="dark"` | `[ ]` |
| T-757 | F-680 | U | No "Onlook" leak | grep `Onlook` outside allowlist = 0 | `[ ]` |
| T-758 | F-758 | U | Snapshot SEO helpers | Canonical / OG / twitter as expected | `[ ]` |
| T-759 | F-759 | U | Build + GET `/sitemap.xml` | XML response includes expected static/blog URLs and build prerender succeeds | `[ ]` |
| T-763 | F-763 | U | Import via `@/` and `~/` | Resolve identically | `[ ]` |

---

## Phased Execution

### Phase 1 — Critical path (Week 1)
1. T-080 / T-081 / T-150 / T-121 — sign-in → create blank → editor loads → first edit. Single Playwright spec.
2. T-471 / T-491 — chat API + Stripe webhook integration.
3. T-689 / T-691 — parser round-trip + Vercel scaffolder.

### Phase 2 — Editor (Week 2)
4. T-261 / T-282 / T-284 — style edit + chat streaming + diff accept.
5. T-380 … T-390 — CMS bind + render.
6. T-634 / T-642 — history + breakpoints.

### Phase 3 — Marketing + visual regression (Week 3)
7. T-001 / T-008 / T-010 / T-020 — snapshots on `/`, `/features`, `/pricing`, `/design-system`.
8. Lighthouse CI on marketing routes.

### Phase 4 — Integrations (Week 4)
9. T-491 / T-720 — Stripe replay.
10. T-088 / T-126 — GitHub OAuth fixture.
11. T-434 / T-528 — domain verify with mock DNS.

---

## Skills & Image Generation (added 2026-05-29)

| ID | Covers | Test | Status |
|---|---|---|---|
| T-800 | Credit bucket selection (`selectDeductionBucket`) | unit `apps/web/client/convex/lib/usageMath.test.ts` — expiry, single-bucket-needed, carry-over priority, tie-break, legacy needed=1 | ✅ automated |
| T-801 | Amount summation / cap predicate / credit normalize (`sumUsageAmount`, `isAtOrOverCap`, `normalizeCredits`) | unit `apps/web/client/convex/lib/usageMath.test.ts` | ✅ automated |
| T-802 | OpenRouter image data-URL parse (`parseImageDataUrl`) | unit `packages/ai/src/image/providers.test.ts` — png/jpeg/http→null/malformed/newline | ✅ automated |
| T-803 | `reserveImage` guards (daily free 2 / pro 50, burst 3/min, free credit-pool gate, per-turn 4, revert refund) | needs `convex-test` harness | ⬜ TODO (see Open Questions) |
| T-804 | Image gen happy path — Nano Banana via OpenRouter + GPT Image direct render inline and charge 5 credits; failure reverts | manual (chat turn, needs `OPENROUTER_API_KEY`) | ⬜ manual |
| T-805 | Skill import upload (.md + .zip), Upload-is-default tab order, drag highlight, auto-preview → Import | manual (auth-gated Skills tab) | ⬜ manual |
| T-806 | Built-in skills appear default-on in the agent skill menu; client bundle excludes skill bodies (`embedded-summaries.ts` has no `content`) | partial — bundle split asserted; menu manual | ✅ partial |

---

## 30. AI Wireframes (Relume-style)

| ID | Feature | Type | Scenario | Expected | Status |
|---|---|---|---|---|---|
| T-821 | F-794 | U | Block registry integrity (`packages/wireframe-blocks/src/registry.test.ts`) | Unique ids; every `defaultContent` parses its Zod schema; all 13 categories present; every meta block has a renderer + no orphan renderers; `coerceBlockId` never returns an invalid id (real id, category name, garbage+category, garbage) | `[x]` |
| T-822 | F-793, F-794 | U | Code emit (`packages/wireframe-blocks/src/emit.test.ts`) | `normalizeSlug`/`pagePathForSlug` dedupe collisions; `emitPageFile` imports each block once + inlines content + valid empty `<main>`; `buildEmitFiles` yields a bootable set (page per page, `_ui`, every used block) with self-contained sources (no `@/components/ui`, `@weblab/*`, `lucide-react`, `next/image`); style-guide globals applied | `[x]` |
| T-823 | F-792 | U | Order/slug helpers (`convex/lib/wireframeOrder.test.ts`) | `slugify` (never empty), `dedupeSlug`, `nextOrder`, `moveInArray` (immutable + clamped), `reindex` dense 0..n | `[x]` |
| T-824 | F-791, F-790 | U | Style-guide helpers (`packages/wireframe-blocks/src/style-guide.test.ts`) | `asStyleGuideTokens` narrows JSON; `styleGuideToCssVars` emits set tokens + body font only; `styleGuideToGlobalsAppend` produces `:root` override + font rules, empty for `{}` | `[x]` |
| T-825 | F-790, F-791, F-793 | E (auth + project) | Complete brief, sitemap, wireframes, and style guide; then try Create code locally and via direct cloud action | Design data persists; export reports unavailable before any local multi-file write, cloud provisioning, or dependency install. | `[ ]` manual |
| T-880 | F-840 | U + E | `convex/lib/signInAllowlist.test.ts`; build with `NEXT_PUBLIC_SITE_MODE=local` → visit `/`, `/pricing`, `/download`, `/sign-in` signed out, signed in as a non-listed account, signed in as owner | Unit: allowlist parsing + env gate. E2E: hero shows Download for Mac only; `/pricing` → `/`; download is one Mac button; new email on OTP form shows invite-only error; non-listed account sees invite-only panel; owner reaches `/projects` | `[ ]` manual (unit `[x]`) |
| T-881 | F-841 | U + M | `cd apps/desktop-local && pnpm install && pnpm test`; install the notarized DMG on a clean Mac | All package tests pass; app opens with no Gatekeeper warning, opens a local site folder, edits apply to source | `[ ]` manual |
| T-882 | F-841 | U + M | Run the dropdown, viewport and update tests; open an HTML sketch with JavaScript-built `<option>` elements in the Mac app | Show/Hide appears at the right of Style, selecting an option exposes its styles without changing the form value, wheel pan stays steady, and a newer Mac DMG is offered in the app | `[ ]` manual |

---

## Open Questions

- [ ] E2E runner — Playwright (recommended) vs Cypress?
- [ ] Visual regression — Percy / Chromatic / Playwright snapshots?
- [ ] Stripe test keys in CI env?
- [ ] Vercel Sandbox CI fixture — recorded API or handwritten?
- [ ] Test data — seeded user or factory-on-demand?
- [ ] Convex test harness — `convex-test` package usage standardized?
