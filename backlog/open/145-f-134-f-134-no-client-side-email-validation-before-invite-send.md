# F-134 — no client-side email validation before invite send

- **Discovered:** 2026-05-28 (bug-hunt F-120..F-135)
- **Where:** [apps/web/client/src/app/project/[id]/settings/access/page.tsx:184-190](apps/web/client/src/app/project/[id]/settings/access/page.tsx#L184-L190)
- **Symptom:** `disabled={!inviteEmail.trim() || isCreatingInvite}` only blocks an empty string. Strings like `"not an email"` reach `createInviteAction`, which then surfaces whatever server-side validation Convex returns (currently undefined behavior).
- **Next step:** validate with a cheap regex (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) or `zod.string().email().safeParse()` before enabling the button. Mirror the validation Convex applies on `projectInvitations.create` so the user sees one consistent message.
- **Risk if ignored:** noisy "Failed to send invite" toasts with no actionable detail. Possible cost on transactional email provider if invalid addresses get retried.
- **Tags:** `#bug` `#ux` `#auth-gated`
