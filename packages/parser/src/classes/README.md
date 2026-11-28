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
