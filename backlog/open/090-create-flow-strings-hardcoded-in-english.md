# Create-flow strings hardcoded in English

- **Discovered:** 2026-06-11
- **Where:** use-start-project.tsx ("Got your prompt", "Building: …"), main.tsx ("Getting ready to build your site", loader steps/caption)
- **Symptom:** bypasses next-intl; non-English locales see English.
- **Next step:** move to `messages/en.json` keys under `editor.creation.*`.
- **Tags:** `#tech-debt` `#i18n`
