# GitHub private-repo import needs token passthrough

- **Discovered:** 2026-06-03 (create-paths audit session)
- **Where:** GitHub private repos — `createFromGit` clones over HTTPS with no auth token.
- **Symptom:** private GitHub repos fail at clone with a generic error (public repos work).
- **Next step:** thread the user's GitHub token into `createFromGit`'s clone URL.
- **Tags:** `#feature` `#integration`
