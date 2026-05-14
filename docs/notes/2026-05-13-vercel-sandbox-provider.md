# Vercel Sandbox Provider Migration

Weblab now has a staged Vercel Sandbox runtime provider in
`@weblab/code-provider`.

## Current status

- CodeSandbox remains the default cloud runtime.
- Vercel Sandbox can be selected for new sandbox provisioning with
  `WEBLAB_CLOUD_PROVIDER=vercel_sandbox`.
- Branch runtime metadata records the cloud provider, sandbox id, preview URL,
  port, dev command, runtime, and optional snapshot id.
- New Vercel sandboxes are snapshotted after dependency installation and then
  immediately resumed into a live sandbox so previews do not point at the
  stopped checkpoint VM.
- Editor file, terminal, task, and git calls use authenticated server-side tRPC
  proxies for Vercel because the Vercel SDK and token must not run in the
  browser.
- Existing CodeSandbox projects are not migrated automatically.
- Non-Next.js template flows explicitly request `code_sandbox` for v1 because
  the Vercel provider scaffolds/restores Next.js projects only. This keeps those
  user flows working instead of silently creating the wrong framework.
- Browser-upload flows that still need the CodeSandbox browser session path
  explicitly request `code_sandbox`.

## Rollback

Set:

```bash
WEBLAB_CLOUD_PROVIDER=code_sandbox
```

No database rollback is required. Existing Vercel test branches remain tagged in
`branches.runtime_metadata.cloud.provider`.

## Required Vercel env

Railway or local server environments need:

- `VERCEL_TEAM_ID`
- `VERCEL_PROJECT_ID`
- `VERCEL_TOKEN`
- `VERCEL_SANDBOX_TIMEOUT_MS` (optional)
