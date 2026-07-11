# QA loop — 1 UX quick-win shipped (2026-06-21 iter-20, /loop dynamic) — chat mode-toggle chevron

> Post-capstone: default shifted from dry hunts to shipping ONE verified UX-audit quick-win per tick. Picked the highest-confidence, non-controversial, no-i18n item.

**✅ FIXED — `53d278b70`:** AI prompt composer mode toggle (Build/Ask/Plan, used on hero + editor chat) had **no dropdown affordance** — it sat among direct-action footer buttons (image, mic) looking identical, so first-time users couldn't tell a mode menu existed (UX audit, "Frustrating / Landing"). Added a `ChevronDown` that rotates 180° on open, matching the house convention (`group-data-[state=open]:rotate-180`, navigation-menu.tsx). Typecheck 0; my lines lint-clean. [chat-mode-toggle.tsx](apps/web/client/src/components/ai-prompt-composer/chat-mode-toggle.tsx:86).

**❌ DROPPED (verify-first):** the audit's paired "bump label contrast tertiary→secondary" — sibling footer buttons (image, mic) all rest at `text-foreground-tertiary` + `group-hover` ([index.tsx:339](apps/web/client/src/components/ai-prompt-composer/index.tsx:339)); bumping only this one breaks toolbar consistency. Chevron alone is the clean win (it correctly distinguishes the one *dropdown* from the direct-action siblings).

**Owner-gated work still pending** (re-surfaced): (1) wireframe spend rate-limit (dedicated table); (2) live-browser offline→online reconnect pass (verify iters 16-17 data-loss fixes). No live browser / agent API this session → code-path only.
