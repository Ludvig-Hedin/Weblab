# Static-HTML projects have no OID pipeline — every canvas edit fails

- **Discovered:** 2026-06-11 (canvas-editor bug hunt)
- **Where:** packages/file-system/src/code-fs.ts (`isJsxFile`), packages/code-provider/src/providers/vercel-sandbox/index.ts (`scaffoldStaticHtmlProject`)
- **Symptom:** in a static-HTML project the OID index is always empty ("Index built: 0 elements from 0 files"), DOM elements have no `data-oid`, and every style/resize/move/text edit throws "No oid found …" with an error toast.
- **Why:** `isJsxFile()` only matches `.js/.jsx/.ts/.tsx`, so `index.html` never gets `data-oid` injection and is never indexed. No HTML oid path exists anywhere (parser, preload, index).
- **Next step:** either add an HTML oid-injection path (parse5/htmlparser2 + same index metadata) or gate canvas editing for `static-html` framework projects with a clear "code-only project" message instead of per-edit error toasts. `TODO(bug-hunt)` marker sits at the `isJsxFile` return.
