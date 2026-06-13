---
name: local-review
description: >-
  Runs the local claude-review CLI to get an independent code review after implementing changes.
  No API key needed — uses Claude Code OAuth session. Trigger when user says "review your work",
  "check for bugs", "run the reviewer", "local review", or after any major implementation.
  Fix loop: run reviewer → fix errors → fix warnings if clear → re-run until clean.
---

# Local Code Review

Run the local `claude-review` CLI — an independent Claude instance reviews your changed code and reports real bugs, security issues, and logic errors. Uses your Claude Code subscription (no API key).

## When to trigger

- After any significant implementation (new feature, refactor, bug fix touching 3+ files)
- Before marking work complete or creating a commit
- User says "review your work", "check for bugs", "run the reviewer", "/local-review"

## Step 1: Run the reviewer

```bash
claude-review diff --json
```

Fallback if binary not found:
```bash
bun /Users/ludvighedin/Programming/personal/code-reviewer/reviewer.ts diff --json
```

For specific files instead of git diff:
```bash
claude-review files src/foo.ts src/bar.ts --json
```

## Step 2: Parse output

Output is JSON:
```json
{
  "issues": [
    {
      "file": "src/auth.ts",
      "line": 42,
      "severity": "error",
      "title": "Missing null check",
      "explanation": "user.id accessed without null guard — runtime crash.",
      "suggested_patch": "if (!user) throw new Error('Not authenticated');"
    }
  ]
}
```

## Step 3: Fix loop

1. Fix ALL `error` severity issues — these are bugs, crashes, or security holes. Non-negotiable.
2. Fix `warning` issues if the fix is clear and safe.
3. Skip `info` items unless trivial.
4. Re-run `claude-review diff --json` to confirm clean.
5. Only claim work done when output is `{"issues":[]}` or only `info` remain.
6. If a bug is complex or hard to reproduce, invoke the `bug-hunt` skill for deeper analysis.

## Severity guide

| Severity | Meaning | Action |
|----------|---------|--------|
| `error` | Bug, crash, security hole, data loss | Must fix |
| `warning` | Risky pattern, potential bug | Fix if clear |
| `info` | Minor improvement | Optional |

## Report back

After the fix loop completes, report:
- What issues were found
- What was fixed
- Final reviewer output (confirm clean or list remaining `info` items)
