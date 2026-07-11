# F-476 — In-memory rate limit on transcription is per-process, not per-user

- **Discovered:** 2026-05-28 (validate-feature F-470..F-479 run)
- **Resolved:** 2026-07-07 — replaced the per-process `Map` in
  `src/app/api/transcribe/helpers/rate-limit.ts` (now deleted) with a
  Convex-backed limiter: a new `transcribeRateLimits` table (one row per
  user, distinct from the billing-quota `rateLimits` table used by
  `usage.ts`) plus `convex/transcribeRateLimit.ts` (`checkAndRecord`
  mutation) and a pure, unit-tested sliding-window helper in
  `convex/lib/transcribeRateLimit.ts`. `route.ts` now calls
  `fetchMutation(api.transcribeRateLimit.checkAndRecord, ...)` with the
  Clerk-issued Convex token, mirroring the pattern in
  `chat/helpers/usage.ts`. Convex's per-document OCC makes the
  read-modify-write atomic, so the 10/min cap now holds fleet-wide across
  every Railway replica instead of `replicas × 10`/min. A daily cron
  (`purgeStaleTranscribeRateLimits` in `convex/internal/cleanup.ts`,
  registered in `convex/crons.ts`) prunes rows whose window closed more
  than a day ago so the table stays bounded.
- **Tags:** `#bug` `#billing` `#infra`
