# Team desktop release handoff, 2026-10-05

Read this before pushing or merging local `main` in `onlook/`.

## Summary

- `origin/main` moved to the merge of PR #9 (`bab783800`). It was built from a snapshot of this working tree taken 2026-10-05 21:05 local, merged with the published local-app-mode line, then scrubbed for the public repository.
- Convex production and Railway are deployed from it. Tag `desktop-v0.2.7` is pushed.
- Local `main` here was not touched. It is still `7e7cc56f6` plus uncommitted work. Its 18 local commits are not ancestors of `origin/main`. The content is there, the history is not.
- Work done here after 21:05 (cloud release credentials and later) is not on `origin/main`.

## Do next time you integrate

1. Merge `origin/main` into local `main`. Do not push local `main` as it is.
2. For the files listed under "Changed on the release line", take the origin side.
3. Never add the ignored private paths with `git add -f`.

## Kept out of the public repository

The repository is public. These are gitignored on `origin/main` and stay on this Mac:

- `apps/desktop/release/sanity-site/` (one customer's pinned site source)
- `apps/desktop/release/sanity-content.test.js`, `apps/desktop/sanity-site-install.test.js`
- `docs/notes/2026-10-*.md`, `docs/audits/desktop-client-readiness-*.md`

Public `BACKLOG.md` and `docs/agent-context/current-progress.md` are the earlier public versions plus new neutral entries. The local versions carry customer names and unpatched security detail. Move new entries across by hand, without those details.

## Changed on the release line

- `apps/desktop/release/site-engine.js` is new. It loads the private engine only when the folder exists. `main.js`, `weblab-local.js` and `release/sanity-content.js` go through it. No literal `require('./release/sanity-site')` remains, so the package-files test passes without the folder.
- The literal Sanity project id is gone from `release/sanity-content.js` and `sanity-blog/native-preparation.tsx`. Test ids and titles are neutral.
- Preview keys, F-842: `normalizePreviewEnv`, `readPreviewEnv`, `updatePreviewEnv` and the `previewEnv` argument of `projectDevEnvironment` in `weblab-local.js`; two bridge calls in `preload.js`; `settings-modal/project/preview-keys.tsx`; `settings.project.previewKeys` in `messages/en.json` and `sv.json`.
- Desktop log file: `apps/desktop/desktop-log.js`, required from `main.js`, listed in `package.json` build files.
- Desktop version 0.2.7, `RELEASES.md`, `README.md`.
- CI: desktop tests run on macOS; `release-snapshot.test.js` and `cli/cli-lifecycle.test.js` are non-blocking there because they lose a process-identity race at random. `examples/sanity-pilot` is excluded from the shared unit run. `desktop-v*` releases set `make_latest: false`.
- Stale tests fixed: `store/editor/teardown.test.ts`, `code-provider/.../nodefs/index.test.ts`, `apps/desktop/local-safety.test.js`.
- Catalog and test IDs from the published line renumbered to F-840, F-841 and T-880 to T-882.

## Local leftovers

- Side worktree `onlook/.worktrees/team-release`, branch `release/team-desktop`: the unscrubbed snapshot plus merge. Local only. Remove once the owner confirms the release works.
- Branch `release/team-desktop-public` is merged and can be deleted.
