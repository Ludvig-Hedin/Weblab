# CodeSandbox Preview Tokenized URLs

> **HISTORICAL — superseded 2026-05-24.** CodeSandbox was archived as a
> runtime; this note describes a feature of the legacy CodeSandbox-backed
> preview pipeline. Vercel Sandbox returns its own preview URLs via
> `sandbox.domain(port)` and has no equivalent "trust screen" / token
> handshake. See
> [2026-05-13-vercel-sandbox-provider.md](2026-05-13-vercel-sandbox-provider.md)
> for the active runtime reference.

Date: 2026-05-03

## Summary

New CodeSandbox previews are now created as private sandboxes with generated preview tokens. Weblab stores the resulting tokenized `csb.app` preview URL so editor iframes and `/projects` preview cards can load the app directly instead of showing CodeSandbox's "do you want to continue?" trust screen.

## User-Facing Changes

- New projects should show the running app in the editor preview without requiring the user to click through the CodeSandbox trust prompt.
- `/projects` cards for newly created projects can render the live preview directly when no screenshot is available.
- GitHub imports, blank branches, forked branches, and project copies use the same preview URL behavior.

## Technical Notes

- CodeSandbox creation now passes `privacy: 'private'` and requests a host preview token from the SDK.
- `getSandboxPreviewUrl` accepts an optional token and appends it as CodeSandbox's supported `preview_token` query parameter.
- Screenshot generation reuses the stored frame URL when present so tokenized private preview URLs continue to work.

## Caveats

- Existing projects that already stored untokenized `csb.app` URLs may still show the trust prompt until their preview URL is regenerated or the project is recreated.
