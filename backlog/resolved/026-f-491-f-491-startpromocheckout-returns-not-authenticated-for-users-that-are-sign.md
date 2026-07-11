# F-491 — `startPromoCheckout` returns `not_authenticated` for users that are signed in but missing email

- **Discovered:** 2026-05-28 (validate-feature F-490..F-501 deep pass)
- **Resolved:** 2026-07-07 — split the check in `subscriptionActions.ts`: `!caller` → `not_authenticated`, `!caller.email` → new `missing_email` code. Added the `missingEmail` i18n key (en + sv) and a matching `case` in the promo banner's error handler.
- **Tags:** `#bug` `#billing` `#ux`
