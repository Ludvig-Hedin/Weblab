# Project Runtime Modes

> **Updated 2026-05-24:** the `cloud` mode is Vercel Sandbox-backed
> (CodeSandbox archived). See
> [2026-05-13-vercel-sandbox-provider.md](2026-05-13-vercel-sandbox-provider.md)
> for the active runtime reference.

Weblab supports first-class runtime metadata for three project modes:

- `cloud`: Vercel Sandbox-backed. Code is provisioned via
  `VercelSandboxProvider.createProject({ framework })` and the canvas
  previews the Vercel sandbox URL (`sandbox.domain(port)`).
- `local`: desktop-first local editing. The project record points at a
  local root path, dev command, and localhost port. Code must stay on
  device and be read/written by the desktop local provider.
- `hybrid`: planned v2. A project can have both a Vercel sandbox runtime
  and a local root with sync enabled or paused per project.

## Current implementation

- Existing projects default to `cloud`.
- The web app currently derives runtime mode from existing data (`local` / `hybrid` tags and `local:` branch ids) so project creation keeps working before the DB migration is applied.
- The DB migration adds durable runtime columns for the later desktop-backed local provider rollout.
- Local project records can be created through `project.createLocal`; this does not fork CodeSandbox, but durable local root metadata requires the runtime-mode migration/provider rollout.
- The editor session startup now selects a local provider when a branch runtime is `local` and passes the branch's root path, dev command, and localhost port into that provider.
- The current folder upload flow is labeled `Import folder to cloud` because it still uploads files into CodeSandbox.

## Local provider requirements

The desktop local provider must implement:

- file read, write, list, stat, copy, rename, delete
- recursive file watching for external editor changes
- terminal and dev-task process management
- git status and commit operations against the local repo

Until that provider is complete, local-mode project records are plumbing only and cloud projects remain the production path.

## Hybrid sync v2

Hybrid sync should use explicit per-project controls:

- pause sync
- pull from cloud
- push to cloud
- resolve conflicts

Conflict rule: never silently overwrite local repo changes. If both cloud and local changed the same file since the last sync, pause that file and ask the user to resolve it.
