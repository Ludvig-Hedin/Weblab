# CreateManager mutates `this.error` outside `runInAction`

- **Discovered:** 2026-05-28 (bug-hunt F-120..F-135)
- **Resolved:** 2026-07-07 — wrapped all 3 pre-check `this.error = null` assignments (`startCreate`, `startGitHubTemplate`, `startPublicGitHubTemplate`) in `runInAction`, matching the rest of the file.
- **Tags:** `#tech-debt`
