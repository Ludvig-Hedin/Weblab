# Prompt / GitHub-template project creation not yet ported to Convex (`TODO(sandbox-port)`)

> **RESOLVED 2026-06-03** — `startCreate` → `createFromPrompt`, and `startPublicGitHubTemplate` / `startGitHubTemplate` → `createFromGit` are all wired (commits `ab96d3e69`, `7a9c5df8e`). The only stubbed manager method left is `createSandboxFromGithub`, which is dead code (no caller). Marketplace "Use template" (forkTemplate → `fork`) is still blocked — see the `TODO(sandbox-fork)` entry at the top of Open.

- **Discovered:** 2026-05-29 (investigate; pre-existing TODO)
- **Where:** [apps/web/client/src/components/store/create/manager.ts:24](apps/web/client/src/components/store/create/manager.ts#L24) — `startCreate`, `startGitHubTemplate`, `startPublicGitHubTemplate` all throw `UNAVAILABLE_MESSAGE`.
- **Symptom:** AI/prompt create (hero input) and GitHub-template imports show "Project creation is temporarily unavailable while the sandbox layer is being migrated to Convex." Only the "Start blank" CTA reaches a real Convex action.
- **Root cause:** legacy flow chained tRPC `api.sandbox.fork` + `api.project.create` + `api.github.validate`; none have Convex equivalents that accept a prompt, image context, or github subpath. `projectActions.createBlank` only handles the blank shape.
- **Next step:** port a `projectActions.createFromPrompt` (+ github variant) that provisions via `VercelSandboxProvider.createProjectFromGit` / scaffold, writes the project graph, and seeds the first chat message. Gated behind the 402 blocker above — nothing creates until billing is fixed.
- **Risk if ignored:** the headline "describe your app" entry point is dead; users must use "Start blank".
- **Tags:** `#tech-debt` `#sandbox` `#convex` `#feature-gap`
