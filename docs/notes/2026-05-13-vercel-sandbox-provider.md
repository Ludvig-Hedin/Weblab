# Vercel Sandbox Provider Migration

Weblab now has a staged Vercel Sandbox runtime provider in
`@weblab/code-provider`.

## Current status

- CodeSandbox remains the default cloud runtime.
- Vercel Sandbox can be selected for new sandbox provisioning with
  `WEBLAB_CLOUD_PROVIDER=vercel_sandbox`.
- Branch runtime metadata records the cloud provider, sandbox id, preview URL,
  port, dev command, runtime, and optional snapshot id.
- Existing CodeSandbox projects are not migrated automatically.
- Browser-upload flows that need the CodeSandbox browser session path explicitly
  request `code_sandbox` until the Vercel server-proxy file IO layer is fully
  proven.

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
