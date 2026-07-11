# Figma import is low-fidelity (colored-box stubs) — high-fi follow-up

- **Discovered:** 2026-06-03 (create-paths audit session); end-to-end wiring shipped 2026-06-13 (see Resolved + feature-log).
- **Where:** scaffolder [packages/figma/src/scaffold.ts](packages/figma/src/scaffold.ts) (`scaffoldFrameComponent`); server action `createFromFigma` in [convex/projectActions.ts](apps/web/client/convex/projectActions.ts).
- **Symptom:** import now works end-to-end (real Next.js project, one editable component per frame), but each component is an empty colored `<div>` sized to the frame — no text, no fills, no nested layout.
- **Next step:** (a) deeper fidelity — expand `figmaActions.fetchFile` to pull the full Figma node tree and emit real JSX (text, fills, auto-layout → flex). (b) **alternative** high-fi visual clone — render frame screenshots via Figma `/v1/images/` and feed them into `createFromWebsiteClone`/`createFromPrompt` image context.
- **Tags:** `#feature` `#figma` `#enhancement`
