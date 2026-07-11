# NOT-A-BUG correction: file-tree directory rename → `moveFile` (iter-3 finding retracted)

- **Discovered:** 2026-06-17 (QA pass iter-4 verification of the iter-3 "directory rename OID staleness" finding)
- **Resolution:** Not reachable. `file-tree-node.tsx:71` blocks rename for directories (`if (node.data.isDirectory) return`), so `handleRenameFile` (`code-tab/index.tsx:519`) only ever receives **file** paths — `moveFile` is correct for its inputs. Directory moves that DO happen (page rename/move) already call `moveDirectory` via `pages/helper.ts:962-1073`. The iter-3 entry below over-rated this; left as a record so it isn't "fixed" again.
- **Tags:** `#not-a-bug`
