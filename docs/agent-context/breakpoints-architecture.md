# Responsive Breakpoints Architecture

Weblab supports per-frame responsive breakpoints so users can design and
preview a project at multiple viewport sizes simultaneously. This is
distinct from CSS media queries — each frame has its own dimensions and
optionally an associated breakpoint label.

> Status: Active development. DB shape landed in migration `0029_frame_breakpoints.sql`.
> Editor manager and UI are in-progress. Read this before changing frame
> dimensions, the responsive class rebase parser path, or breakpoint UI.

## Data Model

Migration: `apps/backend/supabase/migrations/0029_frame_breakpoints.sql`

The `frames` table now carries breakpoint metadata. The Drizzle schema in
`packages/db/src/schema/` reflects the new column(s); the `frame` tRPC router
exposes them to the client.

When you change a frame's dimensions, the backend will also persist the
selected breakpoint label so the canvas can render breakpoint chrome and the
parser can rebase responsive classes correctly.

## Editor Manager

The editor engine has a `breakpoints` concern (typically under
`apps/web/client/src/components/store/editor/breakpoints/` or similar). It
coordinates:

- The currently selected breakpoint per frame
- Breakpoint labels (mobile / tablet / desktop / custom)
- Snapping frame width changes to known breakpoints
- Triggering parser rebase when an element's responsive class set should change

## Parser: Responsive Class Rebase

`@weblab/parser` includes a **responsive class rebase** step. When a Tailwind
class changes at one breakpoint:

- The parser inspects existing classes for that element
- Inserts/updates the breakpoint-prefixed class (`md:`, `lg:`, etc.)
- Preserves existing classes from other breakpoints
- Avoids duplication and conflicts

Test fixtures live under `packages/parser/test/data/`. When changing rebase
behavior, add a fixture that exercises the new case rather than mutating an
existing one.

## UI

The frame component and editor bar surface the breakpoint selector. The
`canvas/frame/` directory contains frame chrome that may render breakpoint
labels and snap-to-width affordances.

## Common Pitfalls

- Hardcoding a breakpoint width somewhere instead of reading it from
  `frames.breakpoints` metadata.
- Allowing the parser to write `md:flex` while leaving a stale `flex` class
  that overrides at smaller breakpoints.
- Persisting a frame width change without persisting the breakpoint label
  (canvas chrome will render the wrong label after reload).
- Treating CSS media queries as the responsive source of truth — Weblab's
  source of truth is the Tailwind class set on each element, parsed by
  `@weblab/parser`.

## Related Files

- Migration: `apps/backend/supabase/migrations/0029_frame_breakpoints.sql`
- Schema: `packages/db/src/schema/` (frames)
- Router: `apps/web/client/src/server/api/routers/frame`
- Parser: `packages/parser/src/` (look for `responsive` or `rebase`)
- Editor manager: `apps/web/client/src/components/store/editor/breakpoints/`
