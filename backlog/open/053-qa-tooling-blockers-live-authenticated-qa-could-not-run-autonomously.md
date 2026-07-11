# QA tooling blockers (live authenticated QA could not run autonomously)

- **Discovered:** 2026-06-17 (QA pass)
- **Where:** environment / MCP config, not app code
- **Symptom:** Three blockers stopped live end-to-end QA of the authenticated app: (1) `weblab-agent` MCP returns `[AUTH_FAILED] invalid or missing agent token` — no live API signal even read-only (agent token expired/unset; per memory the agent API is dev-only / prod unconfigured). (2) gstack `browse` daemon fails — Playwright chromium not installed (`npx playwright install` needed). (3) The live app (create/editor/preview/publish) is Clerk-gated, unreachable headless without a logged-in browser session. Public marketing landing is healthy (verified via WebFetch).
- **Next step:** To enable live authed QA next iteration: (a) refresh the `weblab-agent` MCP token (and confirm whether it points at dev `avid-gnat-539` or prod), or (b) run `npx playwright install` + drive gstack `browse` in CDP mode against a real Chrome already logged into weblab.build, or (c) provide an authenticated cookie export for `browse cookie-import`.
- **Risk if ignored:** Project-creation + editor flows can only be reviewed at code level, not exercised live; the preview-down recovery defect above can't be reproduced end-to-end without this.
- **Tags:** `#infra` `#test-gap`
