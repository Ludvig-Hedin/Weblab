# `_insertProjectGraphOptimistic` duplicates `_insertProjectGraph` (~100 lines)

- **Discovered:** 2026-06-12 (working-tree review)
- **Where:** apps/web/client/convex/projects.ts
- **Symptom:** none yet — drift risk; future change to frames/canvas/conversation seeding must be made twice. Related: `createBlank`'s name-count + insert run in separate transactions, so two concurrent calls can produce duplicate names (cheaper to hit now that createBlank returns fast).
- **Next step:** extract a shared insert helper taking optional sandbox fields; make the name suffix collision-tolerant (e.g. retry with count+1 inside the insert mutation).
