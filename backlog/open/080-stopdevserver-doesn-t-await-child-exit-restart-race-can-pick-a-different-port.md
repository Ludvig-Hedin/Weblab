# `stopDevServer` doesn't await child exit — restart race can pick a different port

- **Discovered:** 2026-06-12 (bug-hunt after the local-port fix)
- **Where:** apps/desktop/weblab-local.js `stopDevServer` (+ IPC `weblab:localdev:stop`), `NodeFsTask.restart` in packages/code-provider/src/providers/nodefs/index.ts. `TODO(bug-hunt)` is on the function.
- **Symptom:** `restart()` does `await dev.stop(root)` then immediately `await dev.start(...)`, but `stopDevServer` only sends SIGTERM and deletes the record synchronously — it never awaits the child's `exit`. The dying dev server can still hold the port when `start` runs, so `findFreePort` skips it and binds a DIFFERENT port → the iframe (built from the old `frame.url`) goes blank. (Before the free-port fix this surfaced as the EADDRINUSE the user hit.)
- **Next step:** make `stopDevServer` return a promise that resolves on the child's `exit` (with a ~3s timeout fallback so a stuck process can't hang restart), and have the `stop` IPC handler + `NodeFsTask.restart` await it. Pairs with the frame.url propagation entry below.
- **Risk if ignored:** intermittent blank preview after "Restart", especially under fast stop→start.
- **Tags:** `#bug` `#flake`
