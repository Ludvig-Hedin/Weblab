# F-360 — Invite-member toast leaks raw Convex error message, and email not normalized client-side

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Resolved:** 2026-07-07 — [invite-member-input.tsx](apps/web/client/src/app/project/[id]/_components/members/invite-member-input.tsx): email is `.trim().toLowerCase()`d before the mutation call; the catch block now maps the server's coded errors (`CONFLICT:`/`BAD_REQUEST:`/`NOT_FOUND:`/`FORBIDDEN:` prefixes, stripped for display) to a friendly message, falling back to a generic string for anything else (server internals like a missing `RESEND_API_KEY` no longer reach the toast).
- **Tags:** `#bug` `#editor` `#members` `#error-handling`
