# Code-review follow-ups (2026-06-17 pre-push review pass)

- **Discovered:** 2026-06-17 (caveman-review + manual review of the token-cost / model-lineup / sandbox-server / create-flow ship)
- **Where:** `apps/web/client/src/app/api/ai/tab-complete/route.ts`; `apps/web/client/src/components/ai-prompt-composer/model-picker/model-selector-v2.tsx`; `apps/web/client/src/components/ui/pricing-modal/pro-card.tsx`
- **Items (none blocking — all conscious trade-offs or style, no regression vs prior behavior):**
  1. **tab-complete reconcile is fire-and-forget** (`void incrementUsage(req).then(reconcile)`). On a serverless freeze after the Response returns, the chained `reconcileUsage` can be dropped, leaving the completion at the conservative flat 1-credit (the ~100× overcharge this ship fixes). `terminal-command`/`summarize` `await` reconcile for exactly this reason. Fix if accuracy > completion latency: `await` the increment→reconcile chain. No regression today (matches the pre-existing fire-and-forget meter).
  2. **Custom OpenRouter model input accepts any string.** An unknown ID is absent from `MODEL_PRICING` (reconcile → cost 0 → free request) and `MODEL_MAX_TOKENS` (no max-output). Add a `provider/model` shape guard, and surface a "billed at cost; unpriced models are free" hint. Power-user escape hatch; not a breakage.
  3. **Style nits:** model-selector custom input uses raw `<input>`/`<button>` (should be `@weblab/ui` `<Button>` + canonical input per button-enforcement.md); `pro-card` tier-selector trigger uses hardcoded `bg-[#0d0d0d]`/`#181818` instead of design tokens (intentional high-contrast fix — migrate to tokens when a high-contrast token pair exists).
- **Risk if ignored:** Minor — occasional tab-complete overcharge under serverless freeze; tiny revenue leak on manually-entered unpriced models. No user-facing error.
- **Tags:** `#tech-debt` `#billing` `#ui`
