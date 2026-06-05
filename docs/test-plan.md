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
| T-006 | F-018 | E | Click each download button | Apple Silicon + Intel URLs return 200 | `[ ]` |
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
| T-052 | F-057 | M | Devtools → Application | SW registered | `[ ]` |
| T-053 | F-062 | E | Open promo banner link | Routes through `/api/promo-resume` → checkout | `[ ]` |
| T-054 | F-066 (`locale-switcher`) | I | Switch locale | next-intl reloads with new strings | `[ ]` |
| T-055 | F-066 (`theme-switcher`) | U | Toggle | `<html data-theme>` flips; persists | `[ ]` |

---

## 3. Auth, Onboarding & Callbacks

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-080 | F-080, F-081 | E + I | Visit signed-out + mock Clerk SDK | OAuth + email forms render; correct Clerk method per path | `[ ]` |
| T-081 | F-082 | E | Submit valid + invalid OTP | Valid → next route; invalid → error | `[ ]` |
| T-082 | F-083 | E (mocked OAuth) | Hit with code+state | New sign-ups → `/profile-setup`; existing → `/projects` | `[ ]` |
| T-083 | F-084 | E | Visit `/sign-up` | Clerk hosted form renders | `[ ]` |
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
| T-122 | F-122 | E | Watch creation | Phases progress; error surfaces if failure | `[ ]` |
| T-123 | F-123 | M | Submit prompt | AI plan returned (F-687) | `[ ]` |
| T-124 | F-124, F-125 | E | Browse marketplace + click template | Template detail loads | `[ ]` |
| T-125 | F-127 | M | Upload zip | Local import succeeds | `[ ]` |
| T-126 | F-128, F-533 | E (mocked GH) | OAuth + repo list + clone | Repo cloned into sandbox | `[ ]` |
| T-127 | F-129, F-531 | M | Figma OAuth (currently `#disabled`) | Error copy shown | `[ ]` |
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
| T-206 | F-209 (disabled-flow) | M | Try `project.fork` / `branch.fork` / `publish` on Vercel | Clear error per `TODO(sandbox-fork)` / `TODO(publish-vercel)` | `[ ]` |

---

## 9. Left Panel — Design

| ID | Targets | Scope | How | Pass | Status |
|---|---|---|---|---|---|
| T-220 | F-222 | E | Drag node | DOM reorders; lock prevents drag | `[ ]` |
| T-221 | F-223 | E | Type filter | Component list filters | `[ ]` |
| T-222 | F-224, F-649 | E | Drag into canvas | Element inserts at drop | `[ ]` |
| T-223 | F-225, F-655, F-553 | E | Upload + bulk delete | Asset persists / removes via Convex storage | `[ ]` |
| T-224 | F-226, F-640, F-639 | E | Edit color token; pick font | CSS vars update; font loads | `[ ]` |
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
| T-815 | F-785 | U | Component registry + prompt wiring (`packages/ai/test/prompt/component-registry.test.ts`) | `COMPONENT_REGISTRY` items well-formed, no dup lib+name, correct ui/watermelon-ui import folder; `COMPONENT_REGISTRY_PROMPT` lists every import path + has default-stack / never-hardcode / tokens / existing-project / escape-hatch text; `DESIGN_SYSTEM_PROMPT` keeps Rule 0 + existing-project-wins + defaults-not-censorship + never-introduce-new-color; nextjs stable block carries `<design-system>`+`<component-registry>`+`<anti-slop-checklist>`+a sample import path; static-html omits `<component-registry>`/`<shadcn-block-catalog>`; provider path injects all three; checklist is the final block | `[x]` |

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
| T-500 | F-500 | I | `sandbox.create` then `start` then `status` then `stop` | Lifecycle transitions return expected payloads | `[ ]` |
| T-501 | F-501 | U | `listProjectComponents` on fixture project | Returns components via regex | `[ ]` |

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
| T-759 | F-759 | U | `next-sitemap` build | XML matches expected URLs | `[ ]` |
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

## Open Questions

- [ ] E2E runner — Playwright (recommended) vs Cypress?
- [ ] Visual regression — Percy / Chromatic / Playwright snapshots?
- [ ] Stripe test keys in CI env?
- [ ] Vercel Sandbox CI fixture — recorded API or handwritten?
- [ ] Test data — seeded user or factory-on-demand?
- [ ] Convex test harness — `convex-test` package usage standardized?
