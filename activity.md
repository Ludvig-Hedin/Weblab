# Activity Log

## 2026-05-06

- Fixed review-blocking build issues by declaring the blog MDX parser/rendering dependencies and ensuring Stripe subscription pause/resume events are accepted by the shared webhook helper. Architectural reliability fix; no intended user-facing behavior change.

## 2026-05-03

- Fixed OAuth callback redirects to stay on the request origin after Supabase exchanges the session code, preserving auth cookies on preview, staging, and custom hosts. User-facing auth reliability fix.

## 2026-04-29

- Fixed Search tab invalidation so results refresh when frame selection or layer mappings change while a query is open.
- Restored a visible project-card fallback preview when no screenshot, live preview, or favicon is available.
- Fixed canvas insertion so the new heading/button/link/input modes create the requested element type instead of always inserting a generic div.
- Hid static template shortcut cards unless there is a matching template project behind them, preventing dead-end template CTAs.
- Restored the screenshot-to-chat action in the compact chat input after the new image button UI accidentally removed its only trigger.
- Reset the new comment-delete confirmation state when switching comment threads so one thread’s pending delete UI does not leak into another.
