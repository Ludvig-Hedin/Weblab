# Dead i18n keys in `settings` namespace

- **Discovered:** 2026-06-13 (caveman-review).
- **Where:** `messages/en.json` + `sv.json` — `settings.project.copyIdFailed`, `settings.page.accessTypeLabel`.
- **Symptom:** Both keys have zero references in `apps/web/client/src` (component uses `toastCopyIdFailed`; the access toggle has no `accessTypeLabel` consumer). Harmless dead weight.
- **Next step:** Delete the two keys from both locale files (and any other locale that copied them).
- **Risk if ignored:** None functional; minor bloat / confusion.
- **Tags:** `#tech-debt`
