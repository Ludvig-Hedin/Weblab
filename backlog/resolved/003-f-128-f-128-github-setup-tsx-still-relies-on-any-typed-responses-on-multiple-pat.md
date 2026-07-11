# F-128 — GitHub setup.tsx still relies on `any`-typed responses on multiple paths

- **Discovered:** 2026-05-28 (bug-hunt F-120..F-135)
- **Resolved:** 2026-07-07 — replaced `any` with the real `GitHubOrganization`/`GitHubRepository` types from `@weblab/github` across all 5 org/repo callback sites in `setup.tsx`, and added the same `repo.owner?.login` guard the file's own `filteredRepositories` filter already used for archived/transferred repos.
- **Tags:** `#bug` `#tech-debt` `#integration`
