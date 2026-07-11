# F-479 — Invalid date strings in `banner.startsAt` / `banner.endsAt` fail open

- **Discovered:** 2026-05-28 (deeper bug-hunt pass on F-470..F-479)
- **Resolved:** 2026-07-07 — `promo-resume/route.ts` checks `Number.isNaN(date.getTime())` on both `startsAt`/`endsAt` before the range comparison and fails closed (redirects to fallback) instead of silently reading a malformed date as "active" via the NaN comparison bug.
- **Tags:** `#bug` `#billing` `#defensive`
