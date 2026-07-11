# F-431 — Subscription-tab uses unsafe `(response as { url?: string })` cast

- **Discovered:** 2026-05-28 (validate-feature F-420..F-439 run)
- **Resolved:** 2026-07-07 — `subscription-tab.tsx`: `if (!session?.url) throw new Error(...)` before `window.open`, so a malformed/empty portal response now surfaces the existing error toast instead of silently no-op'ing.
- **Tags:** `#flag` `#billing`
