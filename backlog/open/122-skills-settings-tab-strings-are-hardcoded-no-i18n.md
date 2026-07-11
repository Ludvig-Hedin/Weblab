# Skills settings tab strings are hardcoded (no i18n)

- **Discovered:** 2026-05-29 (skills scope-clarity work)
- **Where:** [apps/web/client/src/components/ui/settings-modal/skills-tab/index.tsx](apps/web/client/src/components/ui/settings-modal/skills-tab/index.tsx) and [scope-badge.tsx](apps/web/client/src/components/ui/settings-modal/skills-tab/scope-badge.tsx).
- **Symptom:** all strings ("Skills", "All skills", scope help, empty/loading states) are inline English, unlike the sibling `skill-import-dialog.tsx` which uses `next-intl`. New scope-help copy added this session followed the file's existing hardcoded convention.
- **Next step:** route through `editor.settings.skills.*` keys in `messages/en.json` (base for all locales).
- **Risk if ignored:** the Skills tab stays untranslated for non-English users.
- **Tags:** `#i18n` `#tech-debt`
