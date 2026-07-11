# F-120..F-135 import/create surface dead-ends at sandbox provisioning (Figma, Local, Templates, Prompt)

- **Discovered:** 2026-05-28 (bug-hunt F-120..F-135). **Corrected scope** from the
  original "Figma card despite #disabled" framing — the dead-end is **not
  Figma-specific**.
- **Where:** every create/import path that needs a sandbox:
  [import/figma/_context/index.tsx:89](apps/web/client/src/app/projects/import/figma/_context/index.tsx#L89) (`forkSandbox` throws),
  [import/local/_context/index.tsx:146](apps/web/client/src/app/projects/import/local/_context/index.tsx#L146) (`forkSandbox` throws),
  [components/store/create/manager.ts](apps/web/client/src/components/store/create/manager.ts) (`startCreate` / `startPublicGitHubTemplate` throw `UNAVAILABLE_MESSAGE`).
- **Symptom:** the import hub shows three equal cards (local / GitHub / Figma). All of
  them — plus prompt-create and template-create — walk the user through a real-looking
  wizard and then throw at the **finalize / provisioning** step. Figma's PAT path is
  genuinely intended to work (only the OAuth *callback* is `#disabled` per
  [callback/figma/page.tsx](apps/web/client/src/app/callback/figma/page.tsx)); the
  wizard stubs out at `forkSandbox`, identical to local import.
- **Root cause:** this is the tracked `TODO(sandbox-port)` — the legacy `api.sandbox.*`
  tRPC routes have no Convex equivalents yet — compounded by the **Vercel 402 blocker**
  (see that backlog entry). Gating one card (Figma) would be inconsistent and mask the
  real, broader gap.
- **Next step:** do NOT band-aid individual cards. Land the sandbox-port (or the
  snapshot-resume fast path via `VERCEL_BLANK_SNAPSHOT_ID`) so all paths provision, OR —
  if create stays disabled for a release — gate **all** sandbox-dependent entry points
  behind one flag and show a single consistent "create is temporarily unavailable" state
  (the prompt hero already does this via `UNAVAILABLE_MESSAGE`). Track under the existing
  sandbox-port / Vercel-402 entries.
- **Risk if ignored:** users complete a multi-step wizard (local folder pick / Figma frame
  select / template choose) and get an opaque error at the last step — wasted intent across
  every create surface, not just Figma.
- **Tags:** `#bug` `#ux` `#auth-gated` `#sandbox` `#tracked`
