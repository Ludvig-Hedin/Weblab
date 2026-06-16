# DO NOT USE for production.
#
# The Weblab sandbox server is a Bun WORKSPACE package (@weblab/web-server) and
# cannot be built from this subdirectory: workspace deps like `@weblab/rpc`
# won't resolve and there is no per-app bun.lock. Deploy it via the repo-root
# `Dockerfile.sandbox-server`, which runs a workspace-aware frozen install.
#
# See docs/notes/2026-06-16-sandbox-server-deploy.md
#
# This stub fails fast so a stale CI/Railway config can't silently ship a broken
# image. The previous version ran `bun run dev` (watch mode) and EXPOSE 8081
# while the server actually listens on :8080 — it never produced a working
# deploy.
FROM busybox
CMD ["sh", "-c", "echo 'Use repo-root Dockerfile.sandbox-server — see docs/notes/2026-06-16-sandbox-server-deploy.md' >&2 && exit 1"]
