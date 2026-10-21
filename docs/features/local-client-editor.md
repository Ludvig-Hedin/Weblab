# Local desktop content and publishing

The public Mac app is in `apps/desktop-local`. It is separate from the hosted editor and the older `apps/desktop` shell.

## Designer flow

1. Open the prepared local site folder. Claude is optional for text and shared font variables.
2. Open **Content**, prepare a local text copy, choose a field and **Save draft**. Undo/Redo affects local text only.
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
- Credentials remain in native encrypted storage. Website pages may select a known text field; they cannot save, connect credentials or publish.
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

## Continue the unfinished page editing work

This is a draft candidate, not a client-ready release. The native **Content**
panel can edit supported text, but direct editing on the page is not complete.
Double-clicking a heading in a nested CMS page can select `CmsPageBody` or
`CmsSections` and show disabled “From CMS” properties. Opening the page without
a password does not solve that selection problem.

Start with `packages/overlay/src/app.ts` under `apps/desktop-local`:
`onTextEnter` asks `components.onDoubleClick` before resolving an editable text
target. Inspect hit testing and component retargeting as well; do not assume that
reordering those calls alone fixes the bug. The current `editLocalContent`
bridge selects a field in the native Content panel. It does not provide a caret
or text input on the canvas. The owner needs direct page editing, not just a
shortcut to the separate panel.

Acceptance needed before calling this fixed:

- Click the visible heading or body text inside nested CMS components. Select
  the exact text, without first entering every enclosing component.
- Type on the page, save locally, and see the exact text in desktop/mobile
  frames. Reload and reopen the app to check that the edit survives.
- Undo/redo restores the intended field. Other pages, fields and source files
  stay unchanged. Split animated headings retain a complete keyed binding.
- Clicking whitespace, a shared component, links or mixed text never chooses
  an unrelated CMS field. Normal component editing remains available.
- Test without Claude or CMS write credentials. No remote publication is
  needed for this local acceptance.

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

Previous validation: 2,175 desktop tests, lint and types passed; unsigned Mac
packages built. The independent site copy passed 231 tests and its production
build. Native Content save/render/undo and shared-font save/undo/redo were
checked. Direct page editing, provider write/publish/restore, signing and
clean-Mac acceptance remain open. Root hosted-web checks had missing unrelated
dependencies and do not constitute desktop validation.
