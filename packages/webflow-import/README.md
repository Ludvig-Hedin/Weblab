# Webflow code-export converter

`importWebflowExport(directory)` reads an unpacked export. Use
`convertWebflowExport(entries)` if the files are already in memory. Each
entry has a relative POSIX path and content as a string or `Uint8Array`.
Both functions return:

- `files`, project-relative filenames and their contents, including `weblab-import-report.json`
- `report`, the list of pages, forms, refusals, missing assets and warnings
- `frames`, the suggested widths and breakpoint directions

Write the returned files into a fresh project directory to build and run the
generated Next.js 15 App Router app. The converter itself reads only the
specified folder and does not write files, fetch resources, or execute scripts.
The generated site loads the export's scripts and external URLs. Its root layout
reads the requested route to render that page's original HTML and body
attributes, so deploy it with a Next.js server.

Webflow-hosted forms need a new submission destination. CMS detail pages
preserve their route and metadata and show a placeholder until connected to
collection data. Unsupported Google font configurations keep the original
WebFont loader. Ecommerce, memberships and localization return the report
without a runnable project.

Run the hand-written fixtures with `bun test packages/webflow-import`.
