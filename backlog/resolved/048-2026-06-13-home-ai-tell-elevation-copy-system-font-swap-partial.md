# 2026-06-13 — Home AI-tell elevation: copy + system-font swap (partial)

Shipped (code-verified: `bun typecheck` exit 0, scoped eslint 0 errors; both i18n keys confirmed rendered):
- Reworded 2 home AI-tell strings in `apps/web/client/messages/en.json` (English only): `landing.whatCanWeblabDoV2.subhead` (was "Everything in one canvas. No tabs, no handoffs, no translation losses.") and `landing.featureTrio.heading` (was "Pick your model, own your terminal, work with an AI that ships.").
- Swapped default body font Inter → pure system stack (`system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`) in `packages/ui/src/globals.css` + `apps/web/client/src/styles/globals.css`, and removed the `next/font` Inter load from `apps/web/client/src/app/layout.tsx`. SF Pro on Mac, Segoe UI on Windows, no web-font download.

Deferred:
- **i18n locale drift** — the 2 reworded strings are updated in `en.json` only. `sv/es/ja/ko/zh` still carry translations of the old phrasing. Re-translate `landing.whatCanWeblabDoV2.subhead` + `landing.featureTrio.heading` in the 5 non-English message files.
- **Off-home copy tells (flagged, not edited — home-only scope):** `landing.testimonials` "Tens of thousands of builders love Weblab" (unverifiable; conflicts with "90+ contributors") and `landing.andSoMuchMore` "...and so much more". Rewrite when scope widens beyond home.
- **Parked home elevation plan** (approved direction: editorial-premium, owned electric blue, elevate both modes — type pivot superseded by owner's system-ui choice): hero proof strip (GitHub stars / contributors / Apache-2.0 / model wordmarks), accent shift off `#0083ff`, section trim (8→4 cards), `transition-all`→explicit transitions + add `:focus-visible` rings (`faq-dropdown.tsx:37`, `model-agnostic-section.tsx:149`), replace cream/Midjourney landing assets. Owner kept hero H1 + subhead as-is.
