# F-333 — ErrorsConsole keys errors by `branchId + content` → duplicate keys, and `CopyButton` setTimeout not cleared on unmount

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Resolved:** 2026-07-07 — [errors-console.tsx](apps/web/client/src/app/project/[id]/_components/bottom-bar/errors-console.tsx): list key is now `${error.branchId}-${idx}` (unique per render, no more cross-row `CopyButton` state bleed); `CopyButton`'s `setTimeout` is tracked in a `useRef` and cleared on unmount and on rapid re-clicks.
- **Tags:** `#bug` `#editor` `#bottom-bar`
