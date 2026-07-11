# Settings modal i18n is partial — only 4 tabs translated

- **Discovered:** 2026-06-02 (settings-modal polish session)
- **Where:** `apps/web/client/src/components/ui/settings-modal/*` — new `settings.*` namespace in `messages/en.json` + `sv.json`
- **Symptom:** Switching language now updates the **Appearance, Language, Editor, and Domain** tabs (Swedish added), but the remaining tabs (Account, AI, Skills, Shortcuts, Git, Subscription, Site, Project, Versions) and nested dialogs (skill-form, billing-info-edit, user-delete) still render hardcoded English.
- **Root cause:** Scope was limited to the highest-traffic tabs + the tab in the original report. Account-tab was deferred because its support-link helper needs `t.rich` and it embeds the sensitive delete flow.
- **Next step:** Convert the remaining tab files to `useTranslations()` under `settings.*`, extend `en.json`/`sv.json` (and ideally the other locales). Use the 4 done tabs as the pattern.
- **Risk if ignored:** Inconsistent localization — Swedish users see a mixed-language settings modal.
- **Tags:** `#i18n` `#tech-debt`
