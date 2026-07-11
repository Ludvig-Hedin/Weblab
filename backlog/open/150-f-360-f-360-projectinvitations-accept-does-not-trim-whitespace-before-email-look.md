# F-360 — `projectInvitations.accept` does not trim whitespace before email lookup

- **Resolved:** 2026-05-28 (backlog user-flow sweep) — `isEmailMatch` now trims both sides ([projectInvitations.ts:14-15](apps/web/client/convex/projectInvitations.ts#L14)) so the accept-path comparison is whitespace-insensitive (fixes legacy rows too); `create` now canonicalizes with `.trim().toLowerCase()` and the legacy fallback uses the trimmed value, so new rows can't store stray whitespace.
- **Discovered:** 2026-05-28 (validate-feature F-360 deeper pass)
- **Where:** [apps/web/client/convex/projectInvitations.ts:421](apps/web/client/convex/projectInvitations.ts#L421)
- **Symptom:** `args.inviteeEmail.toLowerCase()` is used as the key to look up the `users` row by email. If the upstream caller (sign-in flow, accept page) passes the email with leading/trailing whitespace — easy to do when a user pastes from another app — the lookup misses and the invitation can never be accepted by that account.
- **Next step:** `const lcEmail = args.inviteeEmail.trim().toLowerCase();` (and apply the same trim everywhere `inviteeEmail` is read/written). Match the canonical form Clerk's `clerkWebhooks.ts` writes when it normalizes user emails.
- **Risk if ignored:** silent invite-accept failures with no obvious user-facing diagnostic.
- **Tags:** `#bug` `#convex` `#auth`
