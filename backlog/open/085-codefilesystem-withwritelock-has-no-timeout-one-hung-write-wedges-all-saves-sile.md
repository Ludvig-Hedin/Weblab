# `CodeFileSystem.withWriteLock` has no timeout — one hung write wedges all saves silently

- **Discovered:** 2026-06-12 (working-tree review)
- **Where:** packages/file-system/src/code-fs.ts (`withWriteLock`)
- **Symptom:** if one `super.writeFile` never settles (dead sandbox socket mid-flight), every later write/delete/move/rebuild queues forever with no surfaced error.
- **Next step:** per-op watchdog (log + optionally reject after ~30s); add an interleaving unit test for the lock (concurrent writeFile + rebuildIndex preserving OIDs).
