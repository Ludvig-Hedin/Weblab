# Claude Code Prompt Guide — Weblab

How to write prompts that get Claude Code agents to build Weblab features correctly, efficiently, and on the first try.

---

## The core principle

**Claude Code performs like a senior engineer who just joined the team.** It knows how to code; it doesn't know your codebase. Your job: give it enough context to act like it's been here for months. Everything it doesn't know, it will guess — usually wrong.

---

## Anatomy of a great prompt

```
[GOAL]
One sentence. What must be true when this agent's work is complete?

[CONTEXT]
What the agent needs to know before touching anything:
- Which files are relevant (exact paths)
- What exists today and why
- What NOT to do (constraints specific to this task)
- Any in-flight work it might collide with

[TASK]
Numbered steps. Ordered. Specific.
Never say "add the feature". Say "create X at Y doing Z".

[VALIDATION]
The exact command(s) to run to confirm nothing is broken.

[DOCUMENTATION]
If significant: which docs to update after the work.
```

---

## The 5 rules that matter most

### 1. Give exact file paths — always
```
❌ "find the chat component and update it"
✅ "edit apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/index.tsx"
```
Claude will find things, but it wastes tokens searching. Paths make it faster and more accurate.

### 2. Show the before-state, describe the after-state
```
❌ "fix the send button"
✅ "the Send button at line ~120 currently submits even when the input is empty.
    add a disabled state: when TipTap content is empty (check editor.isEmpty),
    disable the button and apply opacity-50 cursor-not-allowed classes."
```

### 3. State constraints explicitly
Claude's defaults aren't always Weblab's defaults. State them:
```
- Do NOT use `any` type
- Do NOT run the dev server
- Use Bun, not npm
- Import APP_NAME from @weblab/constants — never hardcode 'Weblab'
- This is a Server Component unless the task explicitly requires client state
```

### 4. Scope the validation
Pick the narrowest check that proves the work is correct. Don't tell it to run all tests for a CSS change.
```
❌ "make sure everything works"
✅ "run: bun --filter @weblab/web-client typecheck"
```

### 5. Tell it what to document
For significant changes, tell it exactly where to write:
```
After completing, append an entry to docs/agent-memory/feature-log.md
and update docs/agent-context/current-progress.md if the worktree state shifted.
```

---

## Prompt templates

### Small fix
```
Fix: [short description]

File: [exact path]
Line: ~[line number] (the [component/function name])
Problem: [what it does now]
Fix: [what it should do instead]

Validate: bun --filter @weblab/web-client typecheck
```

### New tRPC router
```
Add a new tRPC router for [domain].

Read first:
- docs/agent-context/trpc-routers-reference.md
- apps/web/client/src/server/api/routers/[similar router]/

Steps:
1. Create apps/web/client/src/server/api/routers/[name]/index.ts
   Expose procedures: [list them]
   Use protectedProcedure for all (check project membership).
   Validate inputs with Zod.
   
2. Export from apps/web/client/src/server/api/routers/index.ts

3. Register in apps/web/client/src/server/api/root.ts as:
   [name]: [name]Router,

4. Add shared types to packages/models/src/ if the response shape
   is consumed by more than one consumer.

Constraints:
- No any type
- Return plain objects (no class instances)
- Check project membership before returning any project data

Validate: bun --filter @weblab/web-client typecheck
Documentation: update docs/agent-context/trpc-routers-reference.md with the new router entry.
```

### New DB column
```
Add [column name] to the [table name] table.

Steps:
1. Add the column to packages/db/src/schema/[file].ts
   Type: [Drizzle type, e.g. text('column').notNull().default('')]
   
2. Create a migration:
   apps/backend/supabase/migrations/[next_number]_[description].sql
   Use the format of existing migrations in that folder.
   
3. Update the mapper in packages/db/src/mappers/[file].ts to
   include the new column in SELECT and INSERT mappings.

4. Update the model type in packages/models/src/[file].ts

5. Update the tRPC router [name].ts to expose the column
   in the relevant input/output schemas.

6. [Optional] Update UI at [path] to surface the new field.

After schema changes, the project owner must run: bun db:push

Validate: bun --filter @weblab/web-client typecheck
```

### New page / route
```
Add a new page at /[route].

Steps:
1. Create apps/web/client/src/app/[route]/page.tsx
   Default Server Component unless [specific reason].
   
2. Add metadata:
   export const metadata: Metadata = { title: '...', description: '...' }
   Use helpers from src/app/seo.ts where possible.
   
3. Add i18n strings for any user-facing text in
   apps/web/client/messages/en.json (key: [namespace].[key])
   
4. Add the route to next-sitemap.config.js if it should be indexed.

5. Link to it from [where].

Constraints:
- Server Component by default
- No hardcoded strings — use next-intl
- Dark theme compatible (use ThemeProvider's CSS vars)

Validate: bun --filter @weblab/web-client typecheck && bun lint
```

### New package
```
Add a new @weblab/[name] package for [purpose].

Steps:
1. Create packages/[name]/package.json:
   {
     "name": "@weblab/[name]",
     "version": "0.0.1",
     "main": "./src/index.ts",
     "types": "./src/index.ts"
   }
   
2. Create packages/[name]/tsconfig.json
   Extend "@weblab/typescript/base.json" (use react-library.json for React
   packages — see packages/utility/tsconfig.json for reference).
   
3. Create packages/[name]/src/index.ts with the main exports.

4. Add "@weblab/[name]": "workspace:*" to the package.json of
   any consumer in apps/ or packages/.

5. Run: bun install (from repo root)

6. Update docs/agent-context/packages-reference.md:
   add an entry in the appropriate group section.

Validate: bun --filter @weblab/[name] typecheck (or bun typecheck from root)
```

### Editor feature (manager work)
```
Add [feature] to the editor.

Read first:
- docs/agent-context/editor-architecture.md
- docs/agent-context/current-progress.md

The feature belongs in the [manager name] manager at:
apps/web/client/src/components/store/editor/[manager]/

Steps:
1. Add [method/property] to the manager class.
   Mark the property @observable if it needs to trigger re-renders.
   
2. Wire the trigger: [how it's called, e.g., from frameEvent or UI action]

3. Consume in the UI at [path]:
   - The component must have `use client` (MobX observer)
   - Wrap with observer() from mobx-react-lite
   
4. [Optional] Expose via tRPC if state needs server persistence.

Constraints:
- Never useMemo for stores
- Never synchronous engine cleanup (use setTimeout)
- Don't mark editor ready until sandbox is connected
- Check: is the component already a use client? Don't add a second boundary.

Validate: bun --filter @weblab/web-client typecheck
```

---

## Context pills: what to include in big feature prompts

For new features, add these at the top:

```
Read before starting:
- docs/agent-context/current-progress.md (what's already in flight)
- docs/agent-context/[relevant area].md
- docs/agent-memory/user-preferences.md (owner's constraints)
```

For architecture-touching changes:
```
Check git log --oneline -20 to see recent commits in this area before editing.
```

---

## Anti-patterns (prompts that produce bad results)

| Anti-pattern | Why bad | Instead |
|-------------|---------|---------|
| "Make it work" | No definition of done | Name the specific outcome |
| "Find the right file" | Agent searches, wastes tokens, guesses wrong | Give the exact path |
| "Add it to the existing system" | Vague scope | Name the manager / router / component |
| "Use best practices" | Claude's "best practices" ≠ Weblab's | State the specific convention |
| "Clean up the code too" | Scope creep, breaks other things | Separate cleanup from feature work |
| "You know what to do" | Agent does not know Weblab conventions | Always spell them out |
| "Make sure tests pass" | No test file path, agent guesses | `bun test --filter packages/[name]` |

---

## Prompt length guide

| Task type | Target length |
|-----------|-------------|
| Typo / copy fix | 30-80 words |
| Small bug fix | 80-150 words |
| New UI component | 150-300 words |
| New tRPC endpoint | 150-250 words |
| New page / route | 200-350 words |
| New DB column + wiring | 200-350 words |
| New editor feature | 300-600 words (include manager context) |
| Major new feature (CMS, breakpoints, etc.) | 500-1000 words |

Longer isn't better. Every unnecessary word is noise.

---

## When to split into multiple prompts

Split when the task has phases that need separate validation:

1. Schema + migration → validate DB
2. tRPC router → validate typecheck
3. UI component → validate lint + typecheck

One agent, one job. Re-brief the next agent with the outcome of the first.

---

## Referencing in-progress work

Before prompting anything that touches:
- Chat/composer → "Note: the TipTap composer at src/components/ai-prompt-composer/ is in active development. Don't modify its core extensions; extend them if needed."
- CMS → "Note: the CMS router at routers/cms/ is in active dev. The schema and router are stable; the UI workspace is not yet complete."
- Breakpoints → "Note: breakpoints DB shape landed in migration 0029. The editor manager is in progress."

---

## The minimal validation chain

Always end every prompt with:

```
Validate:
1. bun --filter @weblab/web-client typecheck   (for any TypeScript change)
2. bun lint                                     (for style/component changes)
3. bun test                                     (for logic with existing tests)

Do not start the dev server to test. Typecheck + lint is sufficient for confirming no regressions in isolated changes.
```
