# @weblab/framework

Framework adapter abstraction for Weblab. One adapter per supported
framework; the rest of the app reads project shape (validation, dev-server
contract, editor pipelines) through this package.

## Supported frameworks

| Adapter | Id | Editor pipelines | CodeSandbox template id | Status |
|---|---|---|---|---|
| Next.js | `nextjs` | `jsx` | `xzsy8c` (BLANK) | Production. Default for new projects. |
| Vite + React | `vite-react` | `jsx` | `TODO_VITE_REACT_TEMPLATE_ID` | Adapter ready, template id pending. |
| Remix / React Router v7 | `remix` | `jsx` | `TODO_REMIX_TEMPLATE_ID` | Adapter ready, template id pending. |
| Astro | `astro` | `jsx`, `html` | `TODO_ASTRO_TEMPLATE_ID` | Adapter ready, template id pending. Editing of `.astro` template bodies works via the HTML pipeline; frontmatter scripts are not editable. |
| TanStack Start | `tanstack-start` | `jsx` | `TODO_TANSTACK_START_TEMPLATE_ID` | Adapter ready, template id pending. |
| Static HTML | `static-html` | `html` | `TODO_STATIC_HTML_TEMPLATE_ID` | Adapter ready, template id pending. Upload-based create flow works via the BLANK fallback today. |

## Activation flow for a non-Next.js framework

To take an adapter from "code ready" to "user-visible end-to-end":

1. **Author the CodeSandbox template.** Create a public CodeSandbox project
   for the framework with a `dev` task (or whatever task name the adapter
   declares) bound to the port the adapter expects. Verify the dev server
   starts cleanly.
2. **Replace the placeholder.** Open the adapter file under
   `src/adapters/<id>.ts` and swap the `TODO_*_TEMPLATE_ID` for the real
   sandbox id. The registry's `isFrameworkReady()` helper will flip true
   automatically and the framework picker will enable that option.
3. **Verify the click → edit loop.** Create a project via the picker, click
   an element in the preview iframe, change a class/text/attribute, and
   confirm the source file is updated and the preview reflects it.
4. **Add a fixture.** Drop a minimal sample project under
   `apps/web/client/__fixtures__/<id>/` so the smoke test can validate the
   adapter's `validate()` rules against a known-good shape.

## Feature flag

Multi-framework UI is hidden by default. Set
`NEXT_PUBLIC_MULTI_FRAMEWORK_ENABLED=true` (see
`apps/web/client/src/env.ts`) to:

- Render the framework picker on the import flow.
- Allow the import flow's validation to use any registered adapter rather
  than always Next.js.

The adapter abstraction itself is always active under the hood — Next.js
projects route through `nextjsAdapter` even when the flag is off, so
toggling the flag is a UI/UX gate, not an implementation gate.

## Editor pipelines

The framework adapter declares which editor pipelines apply to its
projects (`pipelines: ['jsx']`, `['html']`, or `['jsx', 'html']`). The
implementations live in `@weblab/parser` under `src/pipelines/`:

- `jsxPipeline` — Babel-based, JSX/TSX. Wraps existing `getAstFromContent`
  / `addOidsToAst` / `transformAst` / `getContentFromAst` behind the
  `EditorPipeline` interface.
- `htmlPipeline` — parse5-based, plain HTML. Used by static-html and
  Astro template bodies. Implements `class` (not `className`), text
  content, attribute, and tag-rename edits. **Structural edits** (move,
  insert, remove, group) are not yet implemented for HTML; the editor
  surfaces a "not yet supported" toast for those operations on HTML
  projects.

## Outstanding work

- Author + register real CodeSandbox templates for the five non-Next
  frameworks.
- Wire preload-script injection for static-HTML projects: write
  `weblab-preload-script.js` next to `index.html` at upload time and
  inject a `<script>` tag into the `<head>` so DOM clicks in the preview
  iframe propagate to the editor.
- Implement the structural edit operations on the HTML pipeline (port
  `code-edit/{move,insert,remove,group}.ts` to operate on parse5 trees).
- Plumb `framework` through the `Project` domain model
  (`fromDbProject` / `toDbProject` in `packages/db/src/mappers/project/project.ts`)
  so the editor can resolve the right adapter at runtime via
  `getFrameworkAdapter(project.framework)`. Today the import flow writes
  the column on create but the editor still reads the default adapter.
