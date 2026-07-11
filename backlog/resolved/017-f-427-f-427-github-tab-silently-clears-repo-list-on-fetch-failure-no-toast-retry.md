# F-427 — GitHub-tab silently clears repo list on fetch failure (no toast / retry)

- **Discovered:** 2026-05-28 (validate-feature F-420..F-439 run)
- **Resolved:** 2026-07-07 — `github-tab.tsx`: added `toast.error(t('toastReposFailed'))` in the catch (new i18n key, en + sv). Did not build the full inline-retry surface the original note suggested — bigger UX change, deferred.
- **Tags:** `#flag` `#integration` `#ux`
