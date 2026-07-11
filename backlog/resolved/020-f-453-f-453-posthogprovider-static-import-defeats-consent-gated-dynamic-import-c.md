# F-453 — `PostHogProvider` static import defeats consent-gated dynamic-import claim

- **Discovered:** 2026-05-28 (validate-feature F-450..F-453 deeper pass)
- **Resolved:** 2026-07-07 — see the dedicated commit; `telemetry-provider.tsx` now `lazy()`-loads `posthog-js/react` itself (its ESM entry statically imports the full posthog-js core), wrapped in `Suspense`.
- **Tags:** `#tech-debt` `#perf` `#privacy` `#telemetry`
