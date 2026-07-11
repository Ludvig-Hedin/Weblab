# User-GOAL journey hunt iter-25 (2026-06-20, Workflow) — copy-paste/group/rename; 3 FIXED (all surgical), 1 refuted

> 3-goal pass (copy/paste, group/wrap, project name/icon). All 3 confirmed blockers were contained + surgically fixable — fixed this commit.

**✅ FIXED:**
1. **HIGH `#editor` `#data-loss` — cross-branch paste wrote to the WRONG branch (or silently failed).** `code/requests.ts` `getInsertRequests` keyed the source-write `CodeDiffRequest` on `element.branchId` (the COPIED element's source branch), but `location.targetOid` is the paste-target's oid, which only exists in the TARGET branch's file tree. So pasting an element copied from branch A into a frame on branch B either threw "Metadata not found for oid" (target oid absent in branch A) or wrote the duplicate into branch A — and the optimistic in-iframe insert was skipped, so the user saw nothing in branch B. Every sibling handler (move/edit-text/style) correctly keys on `target.branchId`; insert was the lone outlier. Fix: key on `targets[0]?.branchId ?? element.branchId`. Same-branch paste unchanged (target===source). Reachable: `branch.createBlank` is live (multi-branch frames coexist on one canvas).
2. **MED `#parser` — group with no matching direct-child element inserted a phantom empty `<div>` at the end.** `parser/group.ts` computed `Math.min(...targetChildren.map(...))`; when `targetChildren` is empty `Math.min(...[]) === Infinity`, so an empty container was inserted at the end of the node. Fix: early-return when `targetChildren.length === 0`. Parser tests 208 pass.
3. **MED `#editor` — project rename had no empty/whitespace guard or trim.** `settings-modal/project/index.tsx` `handleSave` sent the raw `formData.name`; the backend trims + rejects empty, surfacing only a generic "save failed" toast, and a leading/trailing-space name left the form perpetually dirty (`formData.name !== saved trimmed name`). Fix: trim + empty-guard client-side (clear error, no backend round-trip), and normalize the field to the trimmed value so a space-only edit doesn't keep the form dirty.

**Refuted (1):** "cross-branch CLONE/duplicate still copies a stale/blank snapshot" — that's the already-logged project-clone content-loss (iter-21), not the element copy/paste goal. Skipped (dup).

typecheck code 0; eslint 0 errors; parser tests 208 pass / 0 fail.
