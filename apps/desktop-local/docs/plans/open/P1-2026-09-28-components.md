# Components: instances, properties, enter main (v1)

Status: v1 built on branch `feat/components` (worktree `weblab-components`,
off `weblab` @ 5b83a6b). Not merged: the main checkout had ~140 uncommitted
files from another session touching the same modules (app.ts, panel.ts,
protocol), so this merges after that work is committed.

## Behaviour (agreed with Ludvig 2026-09-28)

1. Purple = a component used in 2+ places (sections and small parts like
   buttons). Single-use components act like normal layers. Purple on the
   canvas outline, its name tab and the Layers row.
2. Click inside a purple instance selects the whole instance. The right panel
   shows a Component section instead of the design sections: name, "Used on N
   pages", Edit component, and every prop with a control (text, select for a
   string-literal union, On/Off for booleans, number, image/link as text).
   Values that come from a data file say "From src/content/about.ts · Also used
   on …". Props the page cannot express as text show "Set in code".
3. Double-click text that is one of the instance's props edits it in place;
   the change is that prop, on this instance only. Esc or ⌘Enter commits.
4. Double-click anything else in an instance enters the main component in
   place: the page is dimmed around it, a bar shows `Page › Component` and
   "Changing this changes N pages". Esc (with nothing selected), the ✕ or a
   crumb leaves. Nested shared components inside act the same way.
5. Prop edits are sent to the agent as "change this call site only"; a value
   spread from a data object is changed in that data file; a default gets a new
   attribute at the call site.
6. CMS text (Sanity stega markers in the value, or a call site that imports a
   CMS client) is locked, tagged "From CMS", with "Open in CMS" when the marker
   carries a link.
7. Right-click: Edit component, Detach instance (on an instance), Make property
   (inside an entered component, on text or an image), Create component (on
   anything else). These go to the agent at once.
8. Everything is written by the agent on Apply; text and image prop edits
   preview on the canvas immediately, others show "Pending".

## How it works

- Browser: `packages/source/src/component-chain.ts` walks React owners from a
  node (`_debugOwner` fibers for client components, ReactComponentInfo with
  `props` and `debugStack` for RSC). The owner's stack gives the JSX call site.
- Server: `packages/source/src/components.ts` maps build-chunk frames through
  their sourcemaps, indexes imports and `<Name` usages, resolves barrels and
  `@/` aliases, counts instances and pages, reads prop types with the project's
  own TypeScript, and classifies each prop's origin at the call site. Routes:
  `POST /__airship/api/components` and `/detail` (same-origin only).
- Overlay: `packages/overlay/src/components/` (registry, targeting, scope bar,
  panel section, prop set, stega, and `layer.ts` which the app calls).
- Also fixed: Next.js server-component elements now resolve to the real source
  file instead of a `.next` chunk.

## Later

- Edit Sanity values from Weblab (write through the CMS API).
- A separate component canvas showing variants side by side, like Framer.
- Preview variant/boolean changes live (needs the component re-rendered).
- Text previews only update the frame that was edited; other device frames
  update when the save lands.
- Undo (⌘Z) does not cover prop edits yet; Discard and the chip ✕ do.
- The components API resolves on the proxy's main thread. The first props
  lookup on a big project warms TypeScript (about half a second on Stilta) and
  holds the proxy for that long; move it to a worker if it is felt.
- Contract gaps noted by the server builder: spreads are lost when types are
  unreadable; `sharedData` keyed by export name only; member components
  (`Foo.Bar`) naming.
