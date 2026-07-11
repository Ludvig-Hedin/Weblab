# Stale `en.d.json.ts` breaks `@weblab/web-client` typecheck

- **Discovered:** 2026-06-13 (caveman-review / bug-hunt of local changes — found while validating an unrelated font change; break is NOT from that work).
- **Where:** `apps/web/client/src/app/project/[id]/_components/members/member-row.tsx:28,51` — `useTranslations('editor.members.row')` + `t('removed', { name })`.
- **Symptom:** `bun typecheck` fails (exit 2): TS2345 `'"editor.members.row"' is not assignable to NamespaceKeys<…>` and `{ name: string }` not assignable to `undefined`. Only errors in the whole web-client typecheck; everything else is green.
- **Root cause:** `editor.members.row` **exists** in `messages/en.json`, but `messages/en.d.json.ts` (the next-intl-generated declaration that `useTranslations` is typed against, via `createMessagesDeclaration` in `next.config.ts`) is **stale** — it predates that namespace. Surfaced from a parallel in-flight i18n migration (commits `fe1ff4c99`, `07ed7f42a`; `member-row.tsx` is actively edited in another session).
- **Next step:** Regenerate the declaration by running `next dev`/`next build` (next-intl rewrites `en.d.json.ts` on boot), then commit the regenerated file alongside the i18n change. Do **not** hand-edit `en.d.json.ts`.
- **Risk if ignored:** CI/build typecheck stays red; any PR is blocked until the declaration catches up.
- **Tags:** `#bug` `#infra` `#tech-debt`
