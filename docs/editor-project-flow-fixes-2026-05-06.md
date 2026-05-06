# Editor Project Flow Fixes - 2026-05-06

## Scope

Reviewed the project editor flow for user-facing blockers around project startup, sandbox recovery, chat, mobile fallback states, and page creation.

## Changes

- Sandbox startup now requires a connected provider before the project is marked ready. Failed sandbox startup is surfaced as a load error instead of dropping the user into a dead editor.
- Sandbox restart now clears its loading state when restart fails, and attempts to reconnect the provider if the provider is missing.
- Mobile chat now matches desktop by offering a way to start a new conversation when no active conversation exists.
- Chat suggestions are mounted in the chat input and generated from completed conversation turns, so the existing "Show suggestions" setting controls a visible feature.
- Page creation and rename modals now ignore Enter submissions while the form is invalid, loading, or blocked by validation warnings.
- External GitHub templates now pass monorepo subpaths through sandbox creation, so examples like `examples/nextjs` are scoped to the intended starter folder instead of importing the repository root.
- GitHub import cancellation now prevents late navigation after an in-flight import finishes.
- Auth modal sign-in now drains staged return URLs from localforage before starting OAuth or dev sign-in, preserving redirect behavior for unauthenticated CTAs.
- Local runtime branches now pass root path, dev command, and port into the NodeFs provider options.
- Chat title generation now uses an available OpenRouter model after the model enum cleanup.

## Validation

- `bun --filter @weblab/web-client typecheck`
- Targeted ESLint on edited files. Remaining warnings are pre-existing hook dependency warnings in `use-start-project.tsx`.
