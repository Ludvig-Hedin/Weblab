# Locale files `en.json` / `sv.json` reindented 4→2 spaces (off-standard)

- **Discovered:** 2026-06-13 (caveman-review).
- **Where:** `apps/web/client/messages/en.json`, `messages/sv.json` (landed in `fe1ff4c99`/`07ed7f42a`).
- **Symptom:** Both reformatted from 4-space to 2-space, while `es/ja/ko/zh.json` and the prettier config (`tooling/prettier/index.js`, `tabWidth: 4`) stay 4-space. JSON is valid and en≡sv key parity holds, so nothing breaks at runtime — but it's a ~6.5k-line whitespace churn + cross-locale inconsistency. The repo `format` script is `eslint --fix` (ignores JSON), so no tool auto-corrects it.
- **Next step:** Re-run prettier with the repo config (`--config tooling/prettier/index.js`) on just `en.json` + `sv.json` to restore 4-space, in a dedicated formatting-only commit.
- **Risk if ignored:** Noisy diffs / merge friction on locale files; cosmetic.
- **Tags:** `#tech-debt`
