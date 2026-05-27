# Reusable Prompt — `validate-feature`

> Paste the **[Prompt body](#prompt-body)** below into chat (or reference this file: "execute `docs/prompts/validate-feature.md` against `<TARGET>`"). The agent validates one or more catalog features (`F-XXX`) — code-level **and** frontend-level — using the Claude skill chain, and returns a single Verdict + evidence.

---

## When to use

- Before merging a feature PR — prove every catalog row touched by the diff still works.
- Before a release — sweep all `#editor` or `#ai` features.
- After a refactor — pick a tag, validate everything under it.
- Debugging a regression — re-run validation for the suspect `F-XXX`.

## What it does

1. Reads [`docs/feature-catalog.md`](../feature-catalog.md) + [`docs/test-plan.md`](../test-plan.md) for the target(s).
2. Runs **code-level** checks: typecheck, lint, scoped unit + integration tests, independent review.
3. Runs **frontend-level** checks: spins up the preview server, navigates each sub-feature, asserts state via snapshots / console / network / inspector.
4. Loops fix → re-run on failures (low-risk only — flags anything ambiguous for human).
5. Outputs a single per-feature table: ✅ pass / ⚠️ flagged / ❌ fail, with evidence paths.

## Inputs

`<TARGET>` is one of:

| Form | Example | Behavior |
|---|---|---|
| Single feature ID | `F-280` | Validate one row + all its sub-features |
| Comma list | `F-280, F-281, F-282` | Validate each |
| Tag | `#editor` or `#ai` | Validate every catalog row with the tag |
| Section | `section:12` or `chat` | Validate all rows in catalog section 12 (or fuzzy-match "chat") |
| Range | `F-280..F-291` | Inclusive range |
| `diff` | `diff` | Auto-detect features touched by current branch diff |
| `all` | `all` | Full sweep (use sparingly — long) |

---

## Prompt body

> Copy from here ⬇ to the end. Replace `<TARGET>` and `<OPTIONAL_NOTES>` before pasting.

```
You are running the `validate-feature` workflow defined in
`docs/prompts/validate-feature.md`. Follow it exactly.

TARGET: <TARGET>
NOTES:  <OPTIONAL_NOTES>

## Phase 0 — Resolve target

1. Read `docs/feature-catalog.md` and `docs/test-plan.md` once.
2. Resolve TARGET to a concrete list of `F-XXX` IDs:
   - Single ID / comma list / range → expand verbatim.
   - Tag (`#foo`) → grep the catalog, collect every `F-XXX` row that has the tag.
   - `section:N` → all rows in catalog section N.
   - Fuzzy string (e.g. `chat`) → match against section titles, then row titles.
   - `diff` → run `git diff --name-only main...HEAD`, then for each path find
     every `F-XXX` whose `Path` column references that file. Include parent
     rows when sub-features point at the same dir.
   - `all` → every `F-XXX` in the catalog.
3. For each resolved `F-XXX`:
   - Extract its **path**, **sub-features** (split on commas / bullets),
     **tags**, **Used when** column.
   - Find every `T-XXX` row in `docs/test-plan.md` whose `Targets` column
     references this `F-XXX`.
4. Print the resolved set as a table — do not start work until this is shown.
   Stop and ask the user if the resolved set is unexpectedly large
   (> 25 features) or unexpectedly empty (0 features).

## Phase 1 — Skill chain setup

You will use these skills in this order, only when relevant. Invoke each via
the `Skill` tool — do not improvise their workflows.

- `superpowers:verification-before-completion` — evidence-before-assertion
  discipline for the whole run.
- `anthropic-skills:find-bugs-that-will-break-core-user-flows` — flag broken
  user flows in the target area before testing.
- `anthropic-skills:frontend-testing-debugging` — drives the browser preview
  loop. Use this for every `#public`, `#auth-gated`, `#editor` row. Check if
  the Browser plugin is available first; if not, fall back to Playwright /
  `preview_*` tools.
- `anthropic-skills:webapp-testing` — Playwright primitives if the Browser
  plugin is unavailable.
- `superpowers:test-driven-development` — when a sub-feature has no
  `T-XXX` row yet, write the test first, then validate.
- `superpowers:systematic-debugging` — only on failure. No fix without root
  cause.
- `local-review` — final pass before declaring complete.

## Phase 2 — Code-level validation

Run for each resolved `F-XXX`. Batch when paths overlap.

A. **Scope tests.**
   - Find `*.test.ts` adjacent to the row's `Path`. If present, run only those:
     `bun test <files>`.
   - Run any `T-XXX` row marked `U` (unit) or `I` (integration) whose target
     matches: search for the row's `How` column and execute the command if
     given verbatim.
   - If no tests exist for a sub-feature, mark it `⚠️ no coverage` and
     synthesize a minimal Bun test under the existing test layout. Do NOT
     skip — `superpowers:test-driven-development` requires a test before
     calling the sub-feature validated.

B. **Typecheck + lint scoped to changed area.**
   - `bun typecheck` (scoped to `@weblab/web-client` by default).
   - `bun lint --max-warnings 0`.
   - If a typecheck or lint error touches the row's `Path`, fail the row.

C. **Convex schema sanity** (only when targets touch `#convex`).
   - `bunx convex codegen` — must succeed; surface drift.

D. **Independent review.**
   - Skip if no code touched.
   - Otherwise run `local-review` skill on the diff. Fix every `error`
     finding before continuing. Flag every `warning` finding in the output;
     fix only if obviously safe.

## Phase 3 — Frontend-level validation

For every row with tag `#public`, `#auth-gated`, `#editor`, `#cms`,
`#billing`, `#admin`, `#mobile`, or `#modal`:

A. **Boot preview.**
   - `preview_start` (this project's dev server: `bun dev` on port 3000).
   - Wait for ready signal.
   - If the row is `#auth-gated`, ensure auth fixtures: sign in via the
     seeded test user (or stop and ask the user for credentials if no
     fixture exists).

B. **Per sub-feature loop.** For every sub-feature listed in the catalog row:
   1. Navigate to the row's path (route URL for `#public` / `#auth-gated`
      rows; navigate into the editor and open the relevant panel for
      `#editor` rows).
   2. **Visual + DOM check:**
      - `preview_snapshot` — capture DOM + visible text.
      - `preview_inspect` — read CSS / computed style if the row touches
        styling.
   3. **Interaction check:**
      - `preview_click` / `preview_fill` to drive the sub-feature.
      - `preview_snapshot` again to confirm the state changed.
   4. **Error check:**
      - `preview_console_logs` — fail if any new `error` or `unhandled` log.
      - `preview_logs` — fail on any 5xx server log line.
      - `preview_network` — fail on any 4xx / 5xx on a request not flagged
        as expected (e.g. `T-475` expects 429 on rate-limit).
   5. **Responsive check (only when row is `#mobile` or has responsive
      sub-features):** `preview_resize` to 375 px, repeat 2–4.
   6. **Evidence:**
      - On pass: capture one `preview_screenshot` for the row's first
        sub-feature.
      - On fail: capture screenshot + diff against `preview_snapshot` from
        the working baseline (if any).

C. **Disabled / deprecated flows.**
   - For any row tagged `#disabled` or `#deprecated`, do NOT validate
     forward-flow. Instead, confirm:
     - `#disabled` → calling the surface returns the documented error.
     - `#deprecated` → no production caller (grep the catalog `Used when`
       column + repo).

## Phase 4 — Fix loop (only for blocking failures)

If a sub-feature fails:

1. Invoke `superpowers:systematic-debugging`. Find root cause first.
2. Apply the fix **only if** all are true:
   - The fix touches < 3 files.
   - The fix is clearly scoped to the failing sub-feature.
   - No public API / contract change.
3. Re-run Phase 2 (scoped tests) and Phase 3 (interaction loop) for the
   affected row.
4. Otherwise flag the failure and stop on that row — do not paper over.

## Phase 5 — Output

Print a single results table. **One row per `F-XXX`.** Use this schema:

| F-ID | Title | Tags | Verdict | Sub-features pass / total | Tests run | Evidence |
|---|---|---|---|---|---|---|
| F-280 | Chat tab shell | `#editor` `#ai` | ✅ pass | 3 / 3 | T-280, T-471 | screenshots/F-280-*.png |
| F-282 | Chat input | `#editor` `#ai` | ⚠️ flagged | 4 / 5 | T-281 | logs/F-282-mention-picker.txt |
| F-285 | Code display | `#editor` `#ai` | ❌ fail | 1 / 3 | T-284 | screenshots/F-285-diff-fail.png |

Verdict rules:
- ✅ `pass` — every sub-feature passed Phase 2 + Phase 3 with no console /
  network errors and at least one test exists.
- ⚠️ `flagged` — sub-features passed but coverage gap (`no coverage`), or
  visual regression vs prior snapshot, or warning-only lint / review
  findings.
- ❌ `fail` — at least one sub-feature failed and could not be fixed under
  Phase 4 rules.

Below the table, print:

### Failures (full detail)

Per ❌ row: reproduction steps, root cause if known, files inspected, fix
applied (if any), what remains.

### Flags (must read)

Per ⚠️ row: one-line note + suggested follow-up. NEVER hide a `⚠️` behind a
`✅` — the user reviews flags before merge.

### Fixes applied

List of `file:line` edits made during Phase 4. If none, write "None".

### Coverage gaps

Sub-features with no `T-XXX` test row — must be added to `docs/test-plan.md`
per the catalog Change Protocol.

### Manual steps required

If any phase needed credentials / env vars / DNS / external service that
the harness can't provide, list them here in the exact format from CLAUDE.md
"When you cannot run a command".

### Next runs

If TARGET was a tag or `all`, suggest a smaller follow-up TARGET that would
re-test only the failures (e.g. "rerun with `F-282, F-285`").

## Rules

- **Don't trust the catalog blindly.** Verify each path exists. If a path is
  wrong, fix the catalog row first (Change Protocol — update + Change Log)
  before validating.
- **Never claim pass without evidence.** Every ✅ needs at least one of:
  test exit code, snapshot diff, screenshot, network log line.
- **Per-run cost guard.** If TARGET resolves to > 25 rows, ask the user
  before proceeding.
- **One feature at a time** through Phase 3 — don't try to drive multiple
  sub-features in parallel through the preview browser; race conditions
  will lie to you.
- **Caveman mode does not apply to test code, commit messages, or PR bodies.**
  Write those normal.
- **Halt rule.** Three consecutive fails on the same row → stop, summarize,
  ask. Do not keep grinding.
```

---

## Examples

### Validate a single editor feature

```
Use docs/prompts/validate-feature.md.
TARGET: F-280
NOTES:  none
```

### Validate every AI surface

```
Use docs/prompts/validate-feature.md.
TARGET: #ai
NOTES:  skip Phase 4 fixes; report only.
```

### Validate everything touched by the current branch

```
Use docs/prompts/validate-feature.md.
TARGET: diff
NOTES:  this branch only touches chat input + style v4 controls.
```

### Validate the CMS workspace before shipping

```
Use docs/prompts/validate-feature.md.
TARGET: section:18
NOTES:  CMS will ship to staging tomorrow — strict mode.
```

---

## Companion artifacts

- [`docs/feature-catalog.md`](../feature-catalog.md) — source of truth (`F-XXX`).
- [`docs/test-plan.md`](../test-plan.md) — per-feature test matrix (`T-XXX`).
- `docs/prompts/` (this dir) — reusable prompts. Add more here as the team
  discovers repeatable workflows.

## Maintenance

If you change the catalog's tag taxonomy, ID format, or section structure,
update this prompt's **Phase 0 — Resolve target** section to match. Add a
dated row to the Change Log here:

| Date | Change |
|---|---|
| 2026-05-26 | Initial version. |
