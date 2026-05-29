---
name: bug-hunt
description: >-
  Systematically hunts for bugs in code — real runtime defects and latent
  issues — then auto-fixes high-confidence ones. Larger or uncertain bugs get
  TODO comments and backlog entries. Use this skill whenever the user says
  "bug hunt", "find bugs", "scan for bugs", "bughunt", "hunt for bugs",
  "check for bugs", "anything broken?", "look for issues", "do a bug pass",
  or wants a code health check. Two modes: "bug hunt" defaults to changed
  files only (fast); "full bug hunt" or "scan everything for bugs" scans the
  whole repo. Always trigger for these phrases — this is the right tool
  whenever they want bugs found and fixed.
---

# Bug Hunt

You are acting as a careful senior engineer doing a focused bug review. Your job is to find **real bugs** — things that will cause incorrect behavior, crashes, or data loss — and fix the ones you're confident about. This is not a style review or a refactor.

## Step 1: Determine scope

Infer from the user's phrasing:
- **"bug hunt"** → changed files mode (fast, focused on recent work)
- **"full bug hunt"** / **"scan everything"** / **"full scan"** → whole repo mode

If genuinely ambiguous, default to changed files and mention that a full scan is also available.

## Step 2: Collect files to scan

**Changed files mode:**
```bash
git diff --name-only HEAD
git diff --name-only --cached
```

**Full scan:**
```bash
find apps packages -type f \( -name "*.ts" -o -name "*.tsx" \) \
  ! -path "*/node_modules/*" \
  ! -path "*/.next/*" \
  ! -path "*/dist/*" \
  ! -path "*/build/*" \
  ! -path "*.d.ts"
```

Skip: generated files, migrations, test fixtures, lockfiles, and `*.d.ts`.

## Step 3: Read and understand each file

Read files in batches (parallel reads when possible). For each file, think through what it is *supposed to do* before looking for what it does *wrong*. The most important bugs are logic errors where the code does something other than what the function name, comment, or caller expects.

Ask yourself:
- What does this function promise to return / do?
- Does the implementation actually deliver that?
- Are there code paths where the behavior differs from the promise?
- Are async operations sequenced and awaited correctly?
- Are error paths handled, or do they silently swallow failures or return wrong types?

Look for branch ordering bugs, off-by-one errors, reversed arguments, wrong fallback values, and conditions that can never be reached. These are often harder to spot than surface artifacts but cause actual runtime failures.

## Step 4: Classify each finding

### Auto-fixable (high confidence — fix immediately)

These are safe to fix without asking because the correct behavior is unambiguous:

- Accessing `.prop` on something typed `T | null | undefined` without guard → add `?.` or null check
- Missing `await` where the return value is immediately used as if resolved → add `await`
- Empty catch block `catch (e) {}` that silently swallows all errors → add `console.error(e)` minimum or rethrow
- Catch block that logs but implicitly returns `undefined` when callers expect a typed value → rethrow after logging
- Branch ordering bug where an early condition makes a later, more-specific condition unreachable → reorder
- `console.log` / `console.debug` / `debugger` left in production code — **only flag these after you've checked for logic bugs; don't let them distract from deeper issues**
- `==` or `!=` in TypeScript (type-unsafe) → `===` / `!==`
- Unreachable code after `return` / `throw`
- `useEffect` cleanup missing for subscriptions/timers → add cleanup return

Only auto-fix if you are **certain** the fix is correct and cannot introduce a regression. If there's any doubt about intent or side effects, report instead.

### Report-only (flag with TODO + backlog)

Don't touch these — flag them for human review:

- Race conditions in concurrent async code
- Missing error handling in complex multi-step flows
- Logic errors where intent is unclear (you might be wrong about what was intended)
- Incorrect React hook dependency arrays (subtle intent questions)
- Security risks: unescaped user input, hardcoded credentials, missing auth checks
- Memory leaks that require architectural changes to fix
- Data model mismatches between frontend and API

### Ignore entirely

- Style issues
- Performance micro-optimizations (unless catastrophic)
- Missing tests
- Things that are "code smell" but produce correct behavior
- Anything you are not confident is actually a bug

## Step 5: Apply auto-fixes

Edit files directly. Keep a running log:

```
FIXED: apps/web/client/src/foo.tsx:102 — reordered safeFallbackReturn branches; Count check now runs before startsWith('get')
FIXED: packages/ai/src/bar.ts:17 — added rethrow in catch; was swallowing errors and resolving undefined for typed returns
```

## Step 6: Add TODO comments for reported bugs

Insert a comment directly above the problematic line:

```typescript
// TODO(bug-hunt): Race condition — fetchUser and fetchProject both write to
// `dataRef.current` concurrently. If they resolve out of order the last-write
// wins incorrectly. Consider sequencing or using a revision counter.
```

Be specific: explain *what* the bug is, *why* it's risky, and *what a fix might look like*.

## Step 7: Update backlog

Append to `CODE_REVIEW_BACKLOG.md` at repo root (create if missing):

```markdown
## Bug Hunt — YYYY-MM-DD

### Auto-fixed (N issues)
- `apps/web/client/src/foo.tsx:102` — reordered branch in safeFallbackReturn

### Needs human review (N issues)
- `apps/web/client/src/baz.tsx:88` — Race condition in concurrent fetch
  - Risk: stale data written last wins
  - Suggested fix: sequence the calls or add a nonce/revision check
```

## Step 8: Validate

Run in order — fix any failures before proceeding:

```bash
bun typecheck
bun lint
```

If your changes introduced new errors, fix the root cause. Don't silence with `// @ts-ignore` or `eslint-disable`.

## Step 9: Commit

- **≤5 fixes, both checks pass** → commit automatically: `fix(bug-hunt): auto-fix N issues in changed files`
- **>5 fixes or any uncertainty** → show summary diff, ask user before committing

## Final summary

```
Bug Hunt complete — [changed files | full repo]

Auto-fixed (N):
  • path/to/file.tsx:42 — description

Flagged for review (N):
  • path/to/file.tsx:88 — description

Validation: typecheck ✓  lint ✓
Committed: yes / no
```

If nothing was found, say so clearly: "No bugs found in [scope]."

---

## Priority order

1. Logic errors (wrong return value, wrong branch, reversed args, broken fallback)
2. Swallowed errors (catch blocks that hide failures)
3. Missing awaits / async sequencing errors
4. React hook issues (deps, cleanup)
5. Null/undefined access without guards
6. Debug artifacts (console.log etc.) — clean up if found, but don't hunt for these first
