# Skills & Image Generation — Design Spec

- **Date:** 2026-05-29
- **Author:** Ludvig (+ agent)
- **Status:** Draft — awaiting user review
- **Scope:** 5 workstreams, built all at once

## 1. Goals

1. **WS1 — Import upload.** Skill import dialog accepts a `.zip` or `SKILL.md`/`.md` file. Upload becomes the default method, then Paste, then URL.
2. **WS2 — Scope clarity.** Make the `all` / `global` / `project` selector self-explanatory.
3. **WS3 — Audit.** Run `bug-hunt` + `ux-polish` on the skills-tab area; fix high-confidence findings.
4. **WS4 — Built-in skills.** Ship selected `agent-temp-input/` skills as default-on built-ins for every user.
5. **WS5 — Image generation.** Add `nano-banana` (Google Gemini image) via OpenRouter to the in-product image tool, metered against user credits with layered cash guards.

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Sequencing | All 5 at once, one spec |
| "Default skills" meaning | Code-defined built-ins, default-on (via the existing `generate:skills` codegen) |
| Image metering | Credit multiplier on the existing usage system |
| GPT image | Stays on **direct OpenAI** (`gpt-image-2`, already wired). Only nano-banana goes via OpenRouter — GPT image is not offered by OpenRouter's image endpoint |
| Caps (Balanced) | **5 credits/image**, hard daily cap **free 2 / pro 50**, burst **3/min/user**, **max 4 images/chat turn** — all tunable constants |

## 3. Verified current state

- **Import dialog** — [`skill-import-dialog.tsx`](../../../apps/web/client/src/components/ui/settings-modal/skills-tab/skill-import-dialog.tsx). Two modes only (`url` | `paste`), URL first. Resets to `url` on open. Calls `skillActions.previewImport({url} | {rawContent})` → `skills.commitImport({name,description,content, projectId?})`.
- **Preview backend** — [`convex/skillActions.ts`](../../../apps/web/client/convex/skillActions.ts) `previewImport`: accepts `url` XOR `rawContent`, **2 MB cap**, parses SKILL.md frontmatter, returns `{name,description,content,contentPreview,contentLength}`.
- **Scope filter** — `skills-tab/index.tsx`: `all` = built-in + global + project; `global` = user skills with no `projectId`; `project` = current project. No explanatory copy.
- **Built-in codegen** — [`packages/ai/scripts/generate-skills.ts`](../../../packages/ai/scripts/generate-skills.ts) scans `<repoRoot>/skills/<name>/SKILL.md` (one level of nesting allowed), parses frontmatter `name`/`description`, embeds the **full body** into `EMBEDDED_SKILLS` → [`packages/ai/src/skills/embedded.ts`](../../../packages/ai/src/skills/embedded.ts). Existing built-ins: `accessibility`, `frontend-design`, `performance`, `seo`. Wired into build via `prebuild`.
- **Registry merge** — `packages/ai/src/skills/registry.ts`: `loadSkills` merges EMBEDDED → filesystem → db(global) → db(project), later overrides earlier; `loadFromDb` keeps only `enabled===true`. `loadSkillSummaries` → `{name,description}` only.
- **Prompt injection** — `packages/ai/src/prompt/provider.ts` `buildSkillsPrompt` injects skill **summaries** (name+description) as an XML list into the system prompt. Full content is fetched on demand when the agent opens a skill.
- **Client import of built-ins** — `skills-tab/index.tsx` imports `EMBEDDED_SKILLS` from `@weblab/ai/client`. The generated array carries full `content` → **bundle-bloat risk** if we add large skills.
- **Image tool** — [`packages/ai/src/tools/classes/generate-image.ts`](../../../packages/ai/src/tools/classes/generate-image.ts) (`GenerateImageTool`). Model enum from [`packages/models/src/image/index.ts`](../../../packages/models/src/image/index.ts) (`gpt-image-2` active; `nano-banana` = excluded placeholder). Image provider: [`packages/ai/src/image/providers.ts`](../../../packages/ai/src/image/providers.ts) (OpenAI direct). Generated images served via [`api/chat-images/[id]/route.ts`](../../../apps/web/client/src/app/api/chat-images/[id]/route.ts).
- **OpenRouter** — `@openrouter/ai-sdk-provider` v1.5.4 exposes **no image interface** (chat/completion/embedding only). Image gen must use OpenRouter's REST `POST /api/v1/chat/completions` with `modalities:['image','text']`; image returns as base64 data URL in `choices[0].message.images[].image_url.url`. Compatible models: `google/gemini-2.5-flash-image` (nano banana), Flux, Recraft — **no OpenAI gpt-image**.
- **Metering** — [`convex/usage.ts`](../../../apps/web/client/convex/usage.ts) `increment({type, traceId?})` deducts **exactly 1** (pro: patches `rateLimits.left -= 1`; free: inserts `usageRecords`). `revertIncrement` refunds. Free caps: 5/day, 50/month. **Image generation is not metered today** (chat route increments only for `ChatType.EDIT`). **No per-minute / per-image-daily limiter exists.**

## 4. Design — WS1: Import upload

**UI** ([`skill-import-dialog.tsx`](../../../apps/web/client/src/components/ui/settings-modal/skills-tab/skill-import-dialog.tsx)):
- Widen `mode` union to `'upload' | 'paste' | 'url'`; default `'upload'`; reset effect → `'upload'`.
- Tab order: **Upload, Paste, URL**.
- Upload tab: a drop-zone / file input (`accept=".md,.zip,text/markdown,application/zip"`).
  - On select: if `.md` → read text. If `.zip` → unzip **client-side** with `fflate` (`unzipSync`), pick `SKILL.md` (case-insensitive; if absent, the first `*.md`). Set the extracted text as `rawContent`.
  - Reuse the existing preview path: `previewImport({rawContent})`. **No backend change required** for the happy path (2 MB cap already enforced).
- Keep Preview → commit flow unchanged.

**Validation / errors:** zip with no markdown → toast "No SKILL.md found in archive." File > 2 MB → toast before calling the action. Reject binary/non-text.

**i18n:** add keys under `editor.settings.skillImportDialog`: `tabs.upload`, `uploadLabel`, `uploadHint`, `uploadCta`, `toastNoSkillMd`, `toastFileTooLarge`, `toastUnzipFailed`.

**Dependency:** `fflate` (tiny, ~8 KB, zero-dep) added to `apps/web/client`.

## 5. Design — WS2: Scope clarity

`skills-tab/index.tsx` scope control:
- Relabel: `All` → **"All skills"**, `Global` → **"My skills"** (sub: "across all projects"), `Project` → **"This project"**.
- Add a one-line muted description under the control reflecting the active scope, e.g. *"Built-in + your skills + skills saved to this project."*
- Tooltip per option. All strings via i18n (`editor.settings.skills.scope.*`).

## 6. Design — WS3: bug-hunt + ux-polish

Run `/bug-hunt` (changed-files mode) and `/ux-polish` scoped to: `skills-tab/*`, `convex/skills.ts`, `convex/skillActions.ts`. Fix high-confidence bugs inline, log the rest to `BACKLOG.md`. Known items already in scope:
- Reset effect uses `'url'` → update to `'upload'`.
- Confirm `commitImport` name-conflict handling surfaces a clear toast (currently generic `toastImportFailed`).
- Empty/long-name and duplicate-name UX in the tab.

## 7. Design — WS4: Built-in skills

**Mechanism:** copy chosen skills into `<repoRoot>/skills/<name>/SKILL.md`, run `bun run generate:skills`, commit the regenerated `embedded.ts`. Default-on is automatic (EMBEDDED_SKILLS always load).

**Bundle-bloat fix (required):** `EMBEDDED_SKILLS` ships full content and is imported client-side. Add a **summaries-only client export** (`EMBEDDED_SKILL_SUMMARIES` = `{name,description}[]`) emitted by the generator, and switch `skills-tab` to import that. Full content stays server-only.

**Per-skill plan** (agent-temp-input → 10 candidates after resolving symlinks; `seo` duplicates an existing built-in). Recommendation column needs **user confirmation** — several are coding-agent *workflow* skills that reference external CLI tooling (gstack/browse/codex/hyperframes) the in-product agent does not have, and would inject misleading instructions:

| Skill | Type | Multi-file | Recommendation |
|---|---|---|---|
| `react-best-practices` | Domain knowledge | rules/*.md | **Include** — concat `rules/*.md` into content |
| `apple-design` | Domain knowledge | references/*.md + py | **Include** — concat `references/*.md`; scripts inert |
| `ui-ux-pro-max` | Domain + tooling | python + CSV | **Include (degraded)** — instruction-only; flag, or trim script directives |
| `tailwind` (symlink) | Domain knowledge | resolve target | **Include** |
| `seo` | Domain knowledge | single | **Skip** — duplicates existing built-in (or replace, user's call) |
| `design-audit` | Workflow | single | **Adapt or skip** — references project-specific tooling |
| `bug-hunt` | Workflow | single | **Skip** — references gstack/backlog workflow, not product-relevant |
| `ux-polish` | Workflow | single | **Skip** — same |
| `design-review` (symlink) | Workflow | gstack | **Skip** — references browse daemon/screenshots |
| `design-shotgun` (symlink) | Workflow | gstack | **Skip** — references local design board |
| `impeccable` (symlink) | Domain (large) | .agents | **Include if self-contained**, else adapt |
| `nano-banana` | Tool wrapper | single | **Skip** — instructs Gemini CLI; conflicts with the native WS5 tool |

> **CONFIRMED final set (9):** `apple-design`, `bug-hunt`, `design-audit`, `design-review`, `impeccable`, `react-best-practices`, `tailwind`, `ui-ux-pro-max`, `ux-polish`.
> **Excluded:** `seo` (duplicate built-in), `nano-banana` (conflicts with native WS5 tool), `design-shotgun` (local-only gstack workflow).
> Workflow skills (`bug-hunt`, `ux-polish`, `design-review`, `design-audit`) are embedded **as-is** per user choice, despite referencing external CLI tooling — content is not rewritten. Multi-file skills concat their `references/*.md` / `rules/*.md`; symlinks (`design-review`, `tailwind`, `impeccable`) resolved to targets before copying.

## 8. Design — WS5: Image generation + cash guards

### 8.1 Model + provider
- Add `NANO_BANANA: 'nano-banana'` back into `IMAGE_MODELS`; config `provider: 'openrouter'`, OpenRouter model id `google/gemini-2.5-flash-image`, `envKey: 'OPENROUTER_API_KEY'`.
- New branch in [`packages/ai/src/image/providers.ts`](../../../packages/ai/src/image/providers.ts): for `provider==='openrouter'`, POST to `https://openrouter.ai/api/v1/chat/completions` with `{model, messages:[{role:'user',content:prompt}], modalities:['image','text'], image_config?}`, `Authorization: Bearer OPENROUTER_API_KEY`, plus `HTTP-Referer`/`X-Title` (same headers as chat). Parse base64 from `choices[0].message.images[0].image_url.url`; decode to bytes; hand to the existing storage path so `chat-images/[id]` serves it. GPT image keeps the OpenAI branch unchanged.
- `GenerateImageTool` model enum picks up `nano-banana` automatically via `IMAGE_MODEL_IDS`.

### 8.2 Metering (credit multiplier)
- Extend `usage.increment` / `revertIncrement` with optional `credits?: number` (default **1** → backward-compatible). Pro path deducts `credits` from the bucket; free path inserts that many `usageRecords` (or one record carrying an `amount` — implementation detail, pick the lower-write option).
- Charge `IMAGE_CREDIT_COST = 5` per image, `type: 'image'`. **Reserve before** the OpenRouter call; **revert on failure.**

### 8.3 Layered cash guards (authoritative, both tiers)
New Convex table **`imageGenerations`** `{ userId, createdAt }`, index `by_user_createdAt`. Single transactional mutation `usage.reserveImage({model})`:
1. Burst: count rows where `createdAt > now - 60_000` ≥ `IMAGE_BURST_PER_MIN (3)` → throw `IMAGE_RATE_LIMITED`.
2. Daily cap: count rows where `createdAt > startOfUtcDay` ≥ `IMAGE_DAILY_CAP` (free 2 / pro 50) → throw `IMAGE_DAILY_CAP_REACHED`.
3. `increment({type:'image', credits:5})` (throws `USAGE_LIMIT_REACHED` if no credits).
4. Insert `imageGenerations` row. Return `{reservationId}`.
- `usage.releaseImage(reservationId)` on generation failure: delete the row + `revertIncrement`.
- **Per-turn cap:** `GenerateImageTool` enforces `IMAGE_MAX_PER_TURN = 4` in-process so the agent can't loop. Beyond that → tool returns a soft error to the model.

Constants live in one module (`packages/stripe` constants or a new `packages/models` image-limits file) so they're tunable in one place.

### 8.4 Cross-tier counting note
Pro users don't write `usageRecords` today, so the daily/burst guard relies on the dedicated `imageGenerations` table (written for **all** tiers). Cross-document count→insert is not fully atomic under concurrency; worst case a couple extra images slip through a burst window. Acceptable for a cash *guard* (credits are still deducted atomically). Documented, not fixed.

### 8.5 Env
`OPENROUTER_API_KEY` already used by chat. Ensure it's readable from the image provider's server context; declare in `src/env.ts` if not already. Remove the stale `NANO_BANANA_API_KEY` placeholder.

## 9. Data-model & API changes

| Change | File |
|---|---|
| `mode` union + upload handler + fflate | `skill-import-dialog.tsx` |
| Scope labels/help + i18n | `skills-tab/index.tsx`, `messages/*` |
| `EMBEDDED_SKILL_SUMMARIES` client export | `generate-skills.ts`, `embedded.ts`, `@weblab/ai/client` barrel |
| New skill folders under `/skills/` | `skills/<name>/SKILL.md` |
| `nano-banana` re-added; `provider:'openrouter'` | `packages/models/src/image/index.ts` |
| OpenRouter image branch | `packages/ai/src/image/providers.ts` |
| `credits?` param | `convex/usage.ts` |
| New `imageGenerations` table + `reserveImage`/`releaseImage` | `convex/schema.ts`, `convex/usage.ts` |
| Per-turn cap + reserve/release calls | `packages/ai/src/tools/classes/generate-image.ts` + chat pipeline |
| Image-limit constants | `packages/models` (or stripe constants) |

## 10. Testing

- **Unit (Convex):** `usage.increment` with `credits` (free + pro, refund idempotency); `reserveImage` burst + daily-cap + credit-exhaustion throws; `releaseImage` reverts both.
- **Unit (parser):** zip→SKILL.md extraction; frontmatter parse for concatenated multi-file skills.
- **Unit (generator):** `generate-skills` emits summaries export; content excluded from client export.
- **Frontend (preview loop):** import dialog upload (md + zip), tab order/default, scope copy renders; image tool happy path + cap-reached error surfaces in chat.
- `bun typecheck`, `bun lint`, scoped `bun test`.

## 11. Risks / open items

1. **Skill set for WS4 needs user sign-off** (§7 table) — embedding workflow/CLI skills would pollute the agent prompt.
2. **`ui-ux-pro-max`** is instruction-only without its scripts — possibly low value embedded.
3. **OpenRouter image latency/cost** per call unknown until tested; guards cap volume, not per-call price. `gemini-2.5-flash-image` is the cheap tier.
4. **Image storage** path reuse must be confirmed against `chat-images/[id]` (Convex storage id round-trip).
5. **Burst race** (§8.4) — accepted.
6. Free tier (5 credits/day) + 5 credits/image = ~1 image/day free — confirm acceptable product-wise.

## 12. Out of scope

- GPT image via OpenRouter (not offered).
- User-disable toggle for built-in skills (today they're always-on).
- Image editing / image-to-image, multi-image batches beyond the per-turn cap.
- Replicate/fal providers.

## 13. Docs to update on ship

`docs/feature-catalog.md` (+ `T-XXX` in `docs/test-plan.md`), `changelog-entries.ts` (+ blog if it clears the bar), `docs/agent-memory/feature-log.md`, `docs/agent-context/ai-chat-architecture.md` (image tool), `BACKLOG.md` (deferred audit items).

## 14. Implementation notes / deviations (as built — 2026-05-29)

- **No new table.** §8.3 proposed an `imageGenerations` table; instead the daily/burst caps count existing `usageRecords` with `type:'image'` via the existing `by_user_type_time` index (`.take(cap)`, index-bounded). Simpler, one fewer table.
- **Credit multiplier is server-internal.** The public `usage.increment` keeps its `{type,traceId}` signature (no client-settable `credits`); the multiplier lives in a shared `applyIncrement` helper used by `reserveImage` with the server constant `IMAGE_CREDIT_COST`. Clients can't request arbitrary deductions.
- **Free-tier pool enforcement (review fix).** `reserveImage` explicitly checks `freePlanUsage` against the free daily/monthly budget for non-Pro users (they have no rateLimits bucket for `applyIncrement` to enforce), mirroring `checkMessageLimit` on the text path.
- **Refund clamp (review fix).** `revertIncrement` clamps `left` to `bucket.max`.
- **No hosted-URL fetch (review fix).** The OpenRouter image path accepts only inline base64 `data:` URLs; the hosted-URL fallback was removed to avoid an SSRF surface.
- **WS4 sourcing:** 7 of the 9 requested skills embedded. `tailwind` + `impeccable` had dangling symlinks with no source on disk — skipped and logged in `BACKLOG.md`. `react-best-practices` embeds under its frontmatter name `vercel-react-best-practices`.
- **Bundle split:** generator now also emits `embedded-summaries.ts` (name+description only); `@weblab/ai/client` exports that so the browser doesn't bundle skill bodies. NOTE: a newly generated file requires a dev-server (Turbopack) restart to be picked up — production builds are unaffected.
- **Backlogged:** Pro multi-bucket credit fragmentation (`selectDeductionBucket` single-bucket), skills-tab i18n debt.
