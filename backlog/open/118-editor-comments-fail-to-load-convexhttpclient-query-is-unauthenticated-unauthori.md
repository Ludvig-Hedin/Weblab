# Editor comments fail to load — ConvexHttpClient query is unauthenticated (UNAUTHORIZED)

- **Discovered:** 2026-05-29 (editor console). `CommentManager.loadCommentsOnce` → `ConvexHttpClient.query(api.comments...)` → `Server Error / UNAUTHORIZED at requireUser (convex/lib/permissions.ts:44)`.
- **Root cause:** the one-shot `ConvexHttpClient` is created without `.setAuth(token)`, so it carries no Clerk identity; `requireCap('project.view')` → `requireUser` throws. Would fail on prod too (comments never load in the editor).
- **Next step:** pass the Clerk JWT to the `ConvexHttpClient` used by `CommentManager` (`client.setAuth(await getToken())`), or switch to the reactive authenticated Convex client.
- **Risk if ignored:** project comments silently never load.
- **Tags:** `#bug` `#convex` `#auth`
