# F-360 — MemberRow avatar `alt={initials}` is meaningless to screen readers

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Resolved:** 2026-07-07 — `member-row.tsx:68`: `<AvatarImage alt={initials} />` → `alt={displayName}`.
- **Tags:** `#bug` `#editor` `#a11y` `#members`
