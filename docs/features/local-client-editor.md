# Local desktop content and publishing

The public Mac app is in `apps/desktop-local`. It is separate from the hosted editor and the older `apps/desktop` shell.

## Designer flow

1. Open the prepared local site folder. Claude is optional for text and shared font variables.
2. Prepare a local text copy in **Content** once. Double-click a visible heading or plain body text, type on the page, then use **Save text** in the app header. **Discard** restores the field. Header Undo/Redo affects local text only and returns when the site reopens. The Content panel remains available for fields without a visible text target.
3. To publish text, connect the site's Sanity write token in the native Content panel. Review exact before/after text, then explicitly publish. A restore creates a new local draft for review. **Replace text connection** repairs an invalid or expired write credential without losing local text.
4. For design changes, use **Publish**: make a test link, open and check it, prepare the live build, open and check that build, then publish it. The production build uses Vercel `--skip-domain` before promotion.
5. Shared fonts can be changed under **Variables → Fonts**. A typed family name must already have a loaded font asset. Per-element design Save still uses Claude.

## Site contract

The site must have a server-only local adapter at `src/sanity/weblab.ts`. Enable it only for non-production runtimes with `WEBLAB_LOCAL_EDITING=1`. Read the validated `.weblab/content/manifest.json` and `draft.json`, use stable keyed paths, and refuse stale document revisions. Before the first content preparation, show normal published text; reject partial or invalid existing snapshots. Never bake local drafts into production output. Add `.weblab/` to Git and deployment ignores.

Manifest fields are a bounded whitelist of human text from published `page`, `siteContent` and `pressArticle` documents. References, asset URLs, credentials, forms and unkeyed arrays are excluded. No schema or structural writes are performed. Sanity remains the content source.

## Failure rules

- Local saves use a revision check and an exclusive file lock. Dirty drafts cannot be replaced by refresh.
- Text publication patches only reviewed fields with `ifRevisionID` in one Sanity transaction. An ambiguous response retains its intent; check status before retrying.
- Source releases omit credential files and drafts, reject unsafe file links, and require the exact reviewed source hash. An external publication invalidates the previous-release guard.
- A lost build response stays pending. **Build never started?** offers an explicit discard only after a successful empty provider search and an unchanged live-site check. A late unreviewed build is never promoted. This escape never applies to a live switch.
- Git Upload and AI change notes also exclude local content and release state, even if the site forgot its ignore rules. Existing committed history is outside this selected-file guard.
- Text and design publications are separate operations. Dirty or pending text blocks a design release.
- Credentials remain in native encrypted storage. Website pages may read an allowlisted text field and propose its new value in memory. Only the trusted native header may save the exact proposal. Pages cannot write draft files, connect credentials or publish. The editor uses plain text, restores original DOM nodes, checks revisions, and rejects ambiguous bindings. Unsaved text blocks competing Content mutations and native reload; close/quit offers Keep editing or Discard. A site-server failure retains the proposal until Save/Discard.
- Provider checks are not a distributed lock across other CMS/Vercel users. Coordinate a release window for client production acceptance.

## Validation

Run from `apps/desktop-local`:

```sh
bun run lint
bun run typecheck
bun run test
cd apps/desktop
bun run build:mac
```

A passing suite or unsigned package is not a completed client release. Verify the packaged app against an isolated real site, then verify authorized preview, public render and restore. Record any missing provider access or signing credentials.

## Direct page editing

`packages/overlay/src/app.ts` resolves a text target before component drill-in.
`components/inline-content.ts` owns the page caret and bounded field proposal.
Split animated headings resolve to their full heading. Multiple distinct or
malformed bindings never choose an arbitrary field. Normal component drill-in
still handles non-text targets.

`apps/desktop/src/content-ipc.js` checks the caller, known field, edit ID, site,
size limit and revision. The website preload exposes read/propose/abandon only.
`apps/desktop/renderer/inline-content.js` owns Save, Discard and local history.
Empty owned fields keep a temporary click area after blur and accept new text.
Their prior styles return when filled or ended. No Claude login or CMS write
credential is needed for this local flow.

Packaged acceptance covers direct heading/body typing, local Save, both frame
sizes, Undo/Redo, Discard and Keep editing on quit. Empty-field clear/blur/reentry/correction/Save/Undo also passed in the app.
A saved heading survived an app restart; the restored header Undo returned it to its original value.
Desktop lint, typecheck and all 2,229 tests pass (172 native-shell tests). Rich text ranges and arbitrary CMS
structures are outside this plain-text field contract.

After synchronization with remote main on 2026-10-22, all 2,418 desktop tests
(322 native-shell tests), lint and typecheck pass. A fresh unsigned review app
also passed direct body typing, Cmd+R refusal while unsaved, Keep editing with
the exact draft retained, Discard, and normal reload with original heading/body
text in both frames. This source integration remains in open PR #17.

## Resume on another Mac

Check out the PR branch in a separate Weblab checkout. Use Bun and Node 22.13+
on an Apple Silicon Mac. This app has its own workspace; install and run checks
from `apps/desktop-local`, not the root hosted-web app:

```sh
cd apps/desktop-local
bun install
bun run lint
bun run typecheck
bun run test
cd apps/desktop
bun run build:mac
```

The desktop workspace does not yet have a tracked Bun lockfile; only the prior
pnpm lockfile is tracked. A fresh Bun dependency resolution is not yet verified
on a clean Mac. Run the full checks after installation and review any graph drift.

The build creates an unsigned local Mac app. `bun run build:mac` never publishes
it. No Apple signing identity is available on the original test machine.
Recreate a test site's local environment through the approved secret source.
Client source patches are in a separate private handoff repository, because
this Weblab repository is public. Do not commit site copies, CMS snapshots,
credentials, local app data, generated bundles or installers here.

Earlier validation: 2,175 desktop tests, lint and types passed; unsigned Mac
packages built. The direct-edit follow-up passes 2,229 tests and a rebuilt
unsigned acceptance app. The independent site copy passed 231 tests and its production
build. Native Content save/render/undo and shared-font save/undo/redo were
checked. Provider write/publish/restore, signing and
clean-Mac acceptance remain open. Direct page editing now has a separate
implementation and packaged acceptance record above. Root hosted-web checks had missing unrelated
dependencies and do not constitute desktop validation.
