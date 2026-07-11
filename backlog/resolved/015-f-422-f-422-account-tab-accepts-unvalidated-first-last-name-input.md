# F-422 — Account-tab accepts unvalidated first/last name input

- **Discovered:** 2026-05-28 (validate-feature F-420..F-439 run)
- **Resolved:** 2026-07-07 — `account-tab.tsx`: trims first/last name and rejects (toast, no save) values over 64 chars before calling `updateProfileMutation`. Did not add full zod schema / script-tag stripping — Convex's own `users.update` validator is the actual trust boundary; this is client-side UX validation only.
- **Tags:** `#flag` `#validation`
