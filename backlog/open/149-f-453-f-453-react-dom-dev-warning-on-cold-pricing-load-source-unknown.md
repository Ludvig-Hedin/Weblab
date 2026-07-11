# F-453 — React-DOM dev warning on cold pricing load (source unknown)

- **Discovered:** 2026-05-28 (validate-feature F-450..F-453 deeper pass)
- **Where:** unknown — fires 8× on cold `/pricing` anon load. Warning text is React-DOM's "Can't perform a React state update on a component that hasn't mounted yet." Not present in any of the four F-450..F-453 files.
- **Symptom:** Dev console pollution. No user-visible effect, but indicates a render-time `setState` side-effect in a sibling provider (motion, radix, clerk, or telemetry-provider's own dynamic-import closures racing strict-mode remount).
- **Next step:** add `Error.captureStackTrace` shim in dev to surface the offending component, or bisect by progressively unmounting providers in `layout.tsx`.
- **Risk if ignored:** real race condition may produce stale state in prod under load. Currently masked because the warning is dev-only.
- **Tags:** `#bug` `#react`
