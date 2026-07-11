# F-450 — `legacy-promotion.tsx` imports from `framer-motion` while siblings use `motion/react`

- **Discovered:** 2026-05-28 (validate-feature F-450..F-453 deeper pass)
- **Resolved:** 2026-07-07 — now imports `motion`/`AnimatePresence` from `motion/react`, consistent with every other pricing-modal file.
- **Tags:** `#tech-debt` `#perf`
