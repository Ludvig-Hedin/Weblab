# 2026-06-05 — Project creation E2E clone + Startd blockers

Resolved by the 2026-06-05 Codex project-creation pass.

- Clone-from-URL now flushes the generated user message into AI SDK state
  before starting `regenerate`; local E2E confirmed `/api/chat` returned 200
  for `https://example.com`.
- Startd template detail pages no longer crash from importing a client-only
  preview helper into a server page.
- Vercel Sandbox git imports now use lockfile-aware installs and conservative
  Next dev commands. Legacy Next templates self-heal to Next 12/React 17 so
  Startd boots on the Node 24 sandbox; local direct preview returned HTTP 200.
- Production auth workflow is documented in
  [prod-e2e-testing.md](docs/agent-context/prod-e2e-testing.md). Prod still
  requires deployment before these local fixes can be verified live.
