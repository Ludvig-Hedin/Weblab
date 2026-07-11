# QA loop — WIND DOWN (2026-06-21 iter-21, /loop dynamic) — quick-win queue dry, both title→tooltip candidates refuted

> Post-capstone ship-or-stop mode. The two remaining audit quick-wins both failed verify-first → no clean safe change left → loop wound down (no churn). **Final tally: 31 fixes (2 security) + UX audit + 2 test files + capstone across iters 1-21.**

**❌ REFUTED — `override-affordance.tsx:59` native `title`→tooltip:** the wrapper holds **editable style inputs** (`children`); a hover tooltip there steals pointer/focus mid-edit. Native `title` is the deliberately low-interference choice. Not converted.

**❌ REFUTED — drift-dot `top-bar/index.tsx:340` native `title`→tooltip:** the dot is a `<span>` inside a `<Button>` that's already a `DropdownMenuTrigger asChild` — nesting a Tooltip trigger inside a dropdown trigger is fragile; the parent Button already carries an i18n `title` (`driftedPreset`, line 324) covering the drift (the dot title is redundant); and a consistent fix needs a NEW i18n key (typegen-staleness risk). More work + more risk than the value. Not converted.

**Loop stopped.** The autonomous QA loop has extracted its available value: cheap real bugs fixed early (iters 1-8), offline subsystem mined (iters 16-18), capstone + regression sweep (iter-19), 1 polish quick-win (iter-20), queue dry (iter-21). Remaining substantive work is **OWNER-GATED** — re-engage `/loop` with one of:
1. **"wireframe rate-limit"** → build the abuse guard (dedicated table, NOT `usageRecords`).
2. **live-browser pass** → connect the Chrome extension; click-test the iters 16-17 offline data-loss fixes (the clearest verification gap).
3. A named area to redirect to.
