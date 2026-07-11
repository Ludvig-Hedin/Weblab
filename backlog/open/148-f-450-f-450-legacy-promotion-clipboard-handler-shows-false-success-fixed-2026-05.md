# ~~F-450 — Legacy promotion clipboard handler shows false success~~ FIXED (2026-05-28)

- **Resolved:** Handler is now async with try/catch on `navigator.clipboard.writeText`. On reject, falls back to a programmatic `document.execCommand('copy')` via a hidden textarea. Toast reflects real outcome — `toast.success('Copied to clipboard')` only on confirmed write, `toast.error('Could not copy code')` with a "select and copy manually" hint if both paths fail. Promo code revenue path no longer at risk.
