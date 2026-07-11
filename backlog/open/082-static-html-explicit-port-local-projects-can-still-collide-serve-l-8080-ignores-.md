# Static-HTML / explicit-port local projects can still collide (`serve -l 8080` ignores PORT)

- **Discovered:** 2026-06-12 (desktop local-port EADDRINUSE fix)
- **Where:** packages/code-provider/src/scaffold-templates.ts (`STATIC_HTML_SCAFFOLD_PORT = 8080`), apps/desktop/weblab-local.js (`startDevServer`), apps/web/client/src/hooks/use-open-local-project.ts (`resolveFreeLocalPort` is skipped for non-Next frameworks).
- **Symptom:** the free-port fix only moves PORT-honoring frameworks (Next.js) to an uncommon port. Static-HTML pins `serve -s -l tcp://0.0.0.0:8080`, and any project with an explicit `-p/--port`/`-l` flag pins its own port; those ignore the PORT env, so an occupied port still fails (and 8080 is a "please avoid" port per the user). Vite (5173) likewise auto-increments on its own without telling the frame.
- **Root cause:** can't move a dev server off a hardcoded flag port via env; would require rewriting the dev command's port flag to a free port and keeping `frame.url` in sync (and `STATIC_HTML_SCAFFOLD_PORT` is shared with the cloud scaffold, so it can't be blindly changed).
- **Next step:** for local static-HTML, rewrite the spawned command's `-l <port>` to a free uncommon port (don't touch the cloud constant), and pair with the port-propagation work above so `frame.url` follows.
- **Risk if ignored:** static-HTML local projects collide on 8080; explicit-port projects crash on a busy port.
- **Tags:** `#bug` `#tech-debt`
