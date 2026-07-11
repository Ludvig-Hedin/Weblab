# QA loop — UX-blocker fixes (2026-06-20 iter-6, /loop dynamic) — 2 FIXED, 2 refuted-as-documented-design, 1 deferred

> Verified the top audit blockers/quick-wins from [docs/notes/ux-audit-2026-06-20.md](docs/notes/ux-audit-2026-06-20.md) against the actual code before fixing. **2 were real + safe → fixed; 2 conflict with documented deliberate design → refuted** (the audit subagents didn't see the rationale comments). Typecheck ✓, lint clean.

**✅ FIXED (this commit):**
1. **`#landing` (audit B1) — hero prompt box had no example chips.** `hero-v2.tsx` rendered `<Create>` without `suggestions`, so the landing prompt box showed only a generic placeholder — a newcomer had no idea what to type. Every other `<Create>` usage (old hero, `/projects/new`, dashboard) passes `PROJECT_SUGGESTIONS`. **Fix:** import + pass `suggestions={PROJECT_SUGGESTIONS}` (the chip UI already existed in `Create`).
2. **`#cms` — Fields tab was a dead end with no collection selected.** `cms-workspace/fields-tab.tsx:159` rendered only the "needCollection" text. **Fix:** added a "Back to Collections" `Button` (reuses the existing `setCmsTab(CmsTabValue.COLLECTIONS)` + `transKeys.cms.fields.back` already used elsewhere in the file).

**❌ REFUTED — conflict with documented deliberate design (audit recs overridden):**
- **(audit B2) hero "Get started" → `redirectToSignIn` is intentional.** `auth-context.tsx:9-22` explicitly documents `redirectToSignIn` as the choice for stateless CTAs like "Get started" (and that the modal-then-navigate flash was deliberately removed). The typed-prompt-then-click-pill data-loss edge is real but rare; the clean fix is structural (lift `Create`'s `inputValue` to the hero so the pill can save a draft). **Downgraded blocker→minor; structural fix noted, not applied.**
- **Publish button `return null` is intentional.** `publish/index.tsx:23-28` documents hiding while caps load ("flashing a button only to refuse on click is worse than waiting"). An "upgrade to publish" upsell also risks misleading copy because publish is platform-disabled on Vercel for everyone (not a plan/role gate). **Product decision + copy risk, not a clear bug — deferred.**

**⏸ DEFERRED:**
- Style/Interactions tabs disabled in Code mode (audit) — making Radix `disabled` tab triggers click-to-switch-mode is fiddly (a non-disabled tab becomes a selectable tab value); the current disabled+“Available in Design mode” tooltip is a clear affordance, so this is convenience-only. `right-panel/index.tsx:437`.
