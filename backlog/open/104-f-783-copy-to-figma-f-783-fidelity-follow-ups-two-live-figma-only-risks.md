# Copy to Figma (F-783): fidelity follow-ups + two live-Figma-only risks

- **Discovered:** 2026-06-04 (Copy to Figma ship)
- **Where:** [packages/figma-clipboard/src/map.ts](packages/figma-clipboard/src/map.ts) (mapping), [src/figma-schema.ts](packages/figma-clipboard/src/figma-schema.ts) (codec), [fractional-index.ts](packages/figma-clipboard/src/fractional-index.ts), [copy/figma.ts](apps/web/client/src/components/store/editor/copy/figma.ts) (clipboard write)
- **Symptom:** v1 pastes editable layers but is lossy for rich CSS, and two correctness details can only be confirmed in the real Figma app.
- **Risks that need a real-Figma check (T-814):**
  1. **Clipboard `version` tolerance** — we write `fig-kiwi` version 15 (per `fig-kiwi`) while the vendored schema came from a v106 `.fig`. If a Figma build rejects the mismatch on paste, derive both from a fresh real clipboard copy and pin them together.
  2. **`parentIndex.position` fractional-index** — we emit fixed-width ascending strings (Figma re-keys on paste). If siblings mis-order or paste is rejected, replace `positionForIndex` with Figma's real fractional-index algorithm (capture from a live copy).
- **Deferred fidelity (each a `// TODO`-worthy follow-up):**
  - **Image fills** — `<img>`/`background-image` currently become a gray placeholder rect. Real image fills need the bytes uploaded as buffer `blobs` + an `IMAGE` paint referencing the hash.
  - **flex → auto-layout** — v1 uses absolute positioning. Detect `display:flex` and emit Figma `stackMode`/spacing/padding/align for resilient, editable layouts.
  - **Gradients / box-shadow / transforms / filters / SVG** — approximated or skipped; add gradient paints, `DROP_SHADOW`/`INNER_SHADOW` effects, and transform decomposition.
  - **Mixed text+element nodes** — an element with both loose text and child elements drops the loose text (treated as a box).
  - **Safari clipboard activation** — the async `getFigmaSceneData` bridge call before `clipboard.write` may drop user-activation in Safari; primary target is Chromium. Mitigate with a promise-based `ClipboardItem` or pre-fetch-on-selection if Safari support is needed.
- **Next step:** schedule the real-Figma validation (T-814) first; it gates whether the two risks need rework. Fidelity items are independent enhancements.
- **Risk if ignored:** feature works for simple elements/frames; complex components paste with reduced fidelity. No crash — failures toast and no-op.
- **Tags:** `#feature` `#editor` `#integration` `#tech-debt`
