# Class engine

## Declaration edits

`editDeclaration(source, target, property, value)` returns a `DeclarationEdit`. Its `patch` is the proposed source change, or `null` when the source already matches the request. The required `effect` field answers a separate question about the CSS cascade.

| Effect | Meaning | Editor behavior |
| --- | --- | --- |
| `applies` | The edited declaration wins for the target in the supplied author styles. | Apply the patch for the designer's edit. |
| `loses` | A known competing declaration overrides the edit. | Apply the requested edit and identify the competing rule. |
| `unknown` | Missing evidence could change the winner. | Apply the requested edit and show “may be overridden here”. |

Use `result.patch` with `applyPatch`. Handle all three effect values when reporting the outcome. A patch can accompany any effect. For removals, the effect describes the declaration immediately before removal. Removing an absent declaration gives a null patch and an unknown effect. Invalid input or an edit that would erase an embedded comment can still throw.

`loses` includes `competingRule` with the selector, property and value. `unknown` includes a reason and identifies a potentially winning rule when available. The source offset, when present, refers to the declaration in the original input.

The target state is hypothetical. Selecting Hover evaluates the target as hovered even when the pointer is elsewhere. Preview matchers supply structural evidence, such as whether the element is inside a wrapper. Nested Current and pseudo-state tests are simplified before consulting a preview. An exact ARIA value needs additional evidence. Scope membership alone cannot resolve equal-specificity rules under different scope roots. Returning `undefined` leaves that question open. Supported width queries are evaluated at the target width. The condition matcher can supply evidence for other media, support, container and scope conditions. Pass other known stylesheet paths in `target.linkedStylesheets` when their rules are outside the supplied CSS. An uninspected import or linked sheet prevents a claim that the edit applies.

## Project rename

Pass the project's entry documents, pages, component modules or stylesheets to `resolveClassStylesheets(files, entries, resolutions, config)`. Include independently routed pages as entries. Local imports and re-exports, literal dynamic imports, stylesheet links and CSS imports extend that scope. Pass the project’s effective TypeScript `paths`, optional `baseUrl` and project-relative `configPath` as the fourth argument. For example, `{ configPath: 'tsconfig.json', baseUrl: '.', paths: { '@/*': ['./app/*'] } }` resolves `@/styles/x.css` against `app/`. Exact mappings precede wildcard patterns and fallback targets retain their configured order. The caller supplies resolved settings after any configuration inheritance. An explicit bundler resolution in the third argument takes precedence. Unresolved aliases and external module dependencies require resolution evidence or a verified class-free dependency declaration. An incomplete result names the importer and specifier.

Pass the completed set to `renameClass(css, files, from, to, cssPath, set)`. The source name must be defined by a rule in the project's resolved global stylesheets. Only owned markup and stylesheets receive patches. The file map may also contain a second document or unused assets. Their presence alone grants no ownership. The single-sheet convenience form treats its supplied scripts as the caller's explicit project markup.

Inspect `unsafe` before saving the plan. Persist paths with nonempty patch lists. Multiple patches for one file use original-source offsets and apply in descending order. The pure engine does no file I/O.

The import graph runs TypeScript’s bundler resolver against the files supplied by the caller. Include directory package manifests in that snapshot. Relative imports, alias targets, package entries, extension substitution and index files use the same lookup. CSS assets are represented to the compiler by virtual declarations. Custom bundler plugins and external dependencies need explicit resolution evidence.

## Local browser comparison

From `packages/parser`, run `bun run test:class-cascade 2000 314159`. The two optional arguments select the case count and reproducible seed. This opt-in script opens the installed Chrome headlessly, varies markup, author rules and viewport widths, forces target states through CDP and reads the computed color after applying each source patch. Each run prints the Chrome version, seed, definite verdicts, unknown rate and mismatch count. A disagreement with a definite verdict fails the run.

Next.js uses standards-mode HTML. For a legacy document whose `document.compatMode` is `BackCompat`, pass `documentMode: 'quirks'`. The editor can still propose a source change. Its effect is unknown because Chrome uses different selector matching rules in that mode. Namespace constraints which need document-specific bindings also remain unknown.

A stylesheet reached through a document link carries its browser URL through its CSS imports. Relative imports resolve beside that stylesheet. Root-relative URLs resolve in the site's public directory. The same source reached through a compiled module is traversed in its module context. Supply a qualified URL resolution for an external sheet. A document-relative link with no known route, or a standalone CSS entry with conflicting URL and module resolutions, leaves the graph incomplete.

Conditional first declarations of layers can change cascade order. When condition evidence is missing, the evaluator compares possible orders, up to 32 combinations. Disagreement gives an unknown effect. A selector with an unverified pseudo-class also gives an unknown effect because the browser may discard a branch before calculating specificity.

The Chrome script includes fixed controls for conditional layer registration and rejected selector branches. It reports definite, unknown and mismatched outcomes per generated shape. Overlapping shapes can include the same case. The ownership comparison bundles temporary JSX projects with Bun, renders them in Chrome, and reads linked and imported stylesheets through the CSSOM before and after rename. Each fixture checks the patched CSS paths, new selectors and computed color. Browser requests are served from the fixture snapshot.
