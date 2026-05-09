# CMS Architecture

The CMS workspace is a newer surface in the project editor that lets users
attach external content (CMS sources) to elements on the canvas, then preview
their project with real content rendered in place.

> Status: Active development. Components and router exist; flows are being
> hardened. Read this before changing CMS bindings, the workspace UI, or the
> `cms` tRPC router.

## Components

Top-level UI: `apps/web/client/src/app/project/[id]/_components/cms-workspace/`

Notable building blocks (some currently untracked / in-flight):

- **CMS pill** (`cms-pill.tsx`) — small canvas indicator showing an element is
  bound to a CMS source.
- **Block preview** (`block-preview.tsx`) — renders a CMS-backed block in
  preview/inspector contexts.
- **CMS workspace panels** — list configured sources, item browser, binding
  inspector.

## tRPC Router

Source: `apps/web/client/src/server/api/routers/cms/`

The `cms` router exposes endpoints for:

- Listing configured CMS sources for a project
- Connecting a new source (auth flow per provider)
- Listing collections and items from a connected source
- Creating / updating / removing element-to-content bindings
- Fetching resolved content for previewing the canvas

Always check project membership before any CMS mutation — CMS data may include
private content the requesting user shouldn't see.

## Data Model

CMS metadata is persisted alongside the project (see `packages/db/src/schema/`
and recent migrations). Bindings reference an element selector (the same
selector used by `comment` for canvas annotations) plus a content path inside
the CMS item.

## Preview Integration

When the canvas renders a frame with CMS bindings present:

1. The editor resolves bindings via the `cms` router.
2. Resolved content is injected into the preview through the preload bridge.
3. The CMS pill renders next to bound elements as a visual indicator.

The `preview-overlay.tsx` and `preview-theme-toggle.tsx` files in the project
editor coordinate with CMS preview state to switch between "design" and
"content" preview modes.

## Common Pitfalls

- Forgetting to deduplicate bindings when an element is moved or duplicated.
- Bypassing the binding model and writing CMS values directly to source code
  (defeats the dynamic-content purpose).
- Leaking CMS access tokens to the client. Source credentials live server-side
  only — exchange them for resolved content via the `cms` router.
- Treating CMS data as static at compile-time. Content changes after canvas
  load and the preview must reflect that.

## Related Files

- Router: `apps/web/client/src/server/api/routers/cms/`
- UI: `apps/web/client/src/app/project/[id]/_components/cms-workspace/`
- Preview overlay: `apps/web/client/src/app/project/[id]/_components/preview-overlay.tsx`
- Schema: `packages/db/src/schema/` (look for `cms_*` tables)

## Operations

### `CMS_SOURCE_ENCRYPTION_KEY` (external sources)

External CMS source credentials (Payload/Strapi/REST API keys, bearer tokens)
are encrypted at rest with AES-256-GCM. The key is read from the env var
`CMS_SOURCE_ENCRYPTION_KEY` — a base64-encoded 32-byte secret.

- **Generate**: `openssl rand -base64 32`
- **Required at runtime** when any user connects an external source.
  Optional in build/dev if no external sources are connected.
- **Helper**: `apps/web/client/src/server/utils/cms-credentials.ts`
- **Stored shape**: `cms_source.credentials` is `{ encrypted: string }` —
  base64( iv(12) || gcmTag(16) || ciphertext ).

#### Rotation procedure

GCM's auth tag rejects the wrong key, so rotation must re-encrypt every row.

1. Generate `NEW_KEY = openssl rand -base64 32`.
2. With `CMS_SOURCE_ENCRYPTION_KEY = OLD_KEY` still set, run a one-shot
   migration script that, for each `cms_source` with a non-WEBLAB type:
   - decrypt the existing `credentials.encrypted` blob
   - re-encrypt under `NEW_KEY` (use `encryptCmsCredentials` with the new
     key — write a small ad-hoc helper that takes the key explicitly,
     since the production helper reads the env var)
   - update the row in place
3. Roll the env var to `NEW_KEY` and redeploy.
4. Verify by hitting **Test** on every source in the workspace.

A failed sync after a rollout that forgot step 2 will surface as
"Server returned 401" or similar — check the encrypted blob length against
the current key length to confirm a key mismatch.

### External-item edit overwrite (intentional)

Items synced into `cms_item` from an external source carry a non-null
`remote_id`. The item editor sheet detects this and:

- shows a banner: "Edits will be overwritten on the next sync"
- disables **Save draft** and **Publish**

This is intentional: the external CMS is the source of truth for those
items. Local edits would be silently overwritten by the next
`cms.source.sync` call, which would surprise users.

If a user needs to override a value locally, they must first move the
collection back to the default Weblab source. There is no UI for this in
v3 — ticket open.

### `cms.binding.snapshot` and drafts

`snapshot` defaults to `publishedOnly: false` so the editor preview shows
every item including drafts. Publish-time consumers must pass
`publishedOnly: true` so drafts don't ship to production. There is no
ambient state; each caller is responsible for the flag.

### Editor history (Cmd-Z / Cmd-Shift-Z)

CMS binding mutations (`cms.binding.upsert`, `cms.binding.remove`,
`cms.collectionPage.upsert`, etc.) **do not participate in the editor's
undo stack**. Reasons:

- Undo/redo dispatches through `Action` (see
  `packages/models/src/actions/action.ts`), which currently models DOM-
  level changes (style/insert/remove/move/group/text/code/image). Binding
  mutations are server-state mutations, not DOM mutations.
- A "BindCmsAction" variant would need plumbing in
  `history/helpers.ts`, `code.ts`, the dispatcher, and the transformers,
  plus careful interaction with collaborative edits (binding upsert is
  idempotent but has cross-binding side effects via `cms.binding.snapshot`).

The accepted UX: bindings are managed via the bind dialog and right-panel
Content section, both of which have a **Remove** button. The user is
expected to undo a binding by re-binding or clicking Remove, not by
hitting Cmd-Z. This matches Webflow/Framer behavior.

If we ever want a true undo, the cleanest path is a separate
`CmsHistoryManager` keyed by oid that the workspace listens to when it
has focus. It would not participate in the main editor's stack but would
offer Cmd-Z while the CMS surface is active.

### Internal: "remote ref" encoding in `cms_collection.description`

External-source mappings store the remote collection reference inside the
existing `cms_collection.description` column with a `remote:` line prefix.
Read with `readRemoteRef`, write with `encodeRemoteRef`, strip with
`stripRemoteRef` (all from `routers/cms/sync.ts`). The tRPC `collection.list`
/ `collection.get` / `collection.update` paths handle the prefix
automatically — direct SQL access to that column needs to be aware of it.
