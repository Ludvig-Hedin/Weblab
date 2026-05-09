# User Preferences — Ludvig

Durable preferences for the project owner. **Read this at the start of every
session.** Append carefully; see `README.md` write protocol.

> Owner identity: Ludvig Hedin. GitHub: `Ludvig-Hedin`. Email:
> `martin@e-w.se`. Brand: Weblab.

---

## Communication Style

- **Concise over verbose.** Avoid filler, restating the prompt, or "let me
  explain" preambles. Lead with the answer.
- **Show what you actually changed.** When you edit code, name the files; do
  not summarize generically.
- **Token-efficient diffs.** Minimal scope, targeted patches. Wide refactors
  require explicit go-ahead.
- **Don't ask permission for obvious next steps.** The user asks for finished
  work — execute through, then report.

## Validation Discipline

- **Never leave the app in a broken state.** Run typecheck/lint/tests for the
  area touched before declaring done.
- **Don't mark a task complete with known errors.** If something is blocked,
  say so explicitly with the exact remaining command/step.
- **Migrations and config changes** must be either run or clearly documented
  for the user to run. Do not silently ship a schema change.

## Brand & Naming

- **Product is Weblab** — never "Onlook" except in the explicitly allowed
  legacy locations (see `CLAUDE.md`).
- **Always import `APP_NAME`** from `@weblab/constants`; never hardcode.
- The `onlook/` folder name on disk is intentional — do not propose renaming.

## Tooling

- **Bun only.** Do not propose npm/yarn/pnpm.
- **Do not run the dev server in automation contexts.** It blocks.
- **Do not run `bun db:gen`.** Reserved for the maintainer.
- **Deployment is Railway, not Vercel.** When checking deployment status or
  production logs, use Railway. Vercel knowledge does not apply here.

## Code Style

- **Avoid `any`** unless genuinely necessary.
- **Server Components by default.** `use client` only when required.
- **Prefer `@weblab/ui` and existing local patterns** over new one-off
  components.
- **MobX stores: `useState(() => new Store())`**, not `useMemo`. Async
  cleanup, not synchronous.
- **i18n**: never hardcode user-facing strings — use `messages/*` files.

## Documentation Discipline

- **Keep `CLAUDE.md` and `AGENTS.md` lean.** Detailed context goes in
  `docs/agent-context/`. User preferences go here.
- **Document new features in `docs/agent-memory/feature-log.md`** — not in the
  main rulebook files.
- **Update `docs/agent-context/current-progress.md`** when shipping work that
  changes the active worktree state.

## Specific Anti-Patterns the User Has Flagged

- **No "visual companion" browser mockups.** The user finds them token-heavy
  and not useful. Do not offer them.
- **Don't propose unrelated cleanups during a focused task.** If you spot
  something, mention it briefly at the end — don't expand scope.
- **Don't summarize CLAUDE.md back to the user.** They wrote it.

## Goals (long-running)

- Ship Weblab to a polished public release on `weblab.build`.
- Keep the codebase agent-friendly: clear docs, predictable structure, small
  blast radius for changes.
- Maintain a healthy `main` branch — preview-deploy hygiene matters.

---

_Last updated: 2026-05-09. If you add a preference here, leave a one-line
dated note at the bottom._

### Updates

- 2026-05-09 — Initial preferences distilled from `CLAUDE.md`, `AGENTS.md`,
  and prior session memory.
