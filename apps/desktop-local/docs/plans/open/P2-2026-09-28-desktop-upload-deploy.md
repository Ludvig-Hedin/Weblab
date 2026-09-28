---
stage: accepted
priority: P2
owner:
created: 2026-09-28
artifact: https://claude.ai/artifact/4EL48jsQprv22jaVPC5y7x
prototype: https://claude.ai/artifact/KMqveyrxY4JQRmSdssEBfe
---

# Upload, Deploy and branches in the desktop top bar

People who do not code can save their work to GitHub, put the site online with
Vercel, and switch branches, all from the top bar of the Weblab desktop app.

## Summary

| | |
|---|---|
| What | Three new top-bar controls: a branch chip next to the site name, **Upload** (with a count of changes), and **Deploy** (test link or live site). |
| Why now | Saving or publishing means a terminal today, so a designer stops there. Every site made in Weblab also lives only on one Mac: `sites.create` and tarball clones never add a GitHub remote. |
| Effort | About six sessions, three slices that each ship alone: Upload (2.5), Deploy (2), branches (1.5). |
| The ask | When Live site is picked with changes not uploaded: upload them to main first (recommended), or publish from the Mac only? |

## Owner answers (2026-09-28)

- Deploy asks **Test link or Live site** every time. Neither is pre-selected; the
  button reads "Pick one" until you choose.
- Vercel connects by **signing in through the browser**, not by pasting a token.
- **AI writes the upload note.** Owner named Claude Sonnet 5 (medium) or GPT 6
  Luna (high). The packaged desktop app only ships Claude (`scripts/stage.mjs:33-38`,
  `src/runner.js:158-169` hardcodes `--agent claude`), and the repo knows
  `gpt-5.6-luna`, not "gpt-6-luna" (`packages/protocol/src/models.ts:67`). So:
  `claude-sonnet-5`, effort medium.
- Uploading on **main** shows a warning and offers a new branch. It never blocks.

## What I assumed

- The note runs through `claudeBinary()` (`src/runtime.js:59`), not `claude` on
  PATH, because children get a stripped PATH (`runtime.js:103-119`). It runs in a
  temp folder with no project settings, tools or MCP, so the site's CLAUDE.md
  and hooks do not slow it. Sign-in users pay nothing extra; API-key users pay
  a fraction of a cent per note (`auth.js:17-39`).
- A test link sends the folder as it is on disk, including changes not uploaded.
- Live site deploys the folder as it is, like a test link. Never uploads first.
- First deploy looks for a Vercel project already linked to this site's GitHub
  repo and reuses it. Otherwise it makes a new project with a free name
  (suffix if taken) and stores the project id per site. Never `vercel link
  --project <slug>` blindly: slugs fall back to generic names like "website"
  (`sites.js:97-105`) and would hit a stranger's project.
- Projects Weblab creates get Vercel Authentication turned off for previews, so
  a test link opens for anyone who has it. Existing projects are left alone and
  the panel says the link needs a Vercel sign-in.
- Upload, branch switch and Deploy wait while an AI job is running.
- The editor chat's "Commit to git", "Commit & push" and "Create pull request…"
  items (`packages/overlay/src/chat/transcript.ts:561-596`) are hidden when the
  overlay runs inside the desktop app. They push without the app's token and
  call `gh`, which is not on the desktop PATH, so they fail there today anyway.
- "Ask to add to main" opens a pull request through the GitHub REST API with the
  app's token. We never merge inside Weblab.
- "Commit" and "push" never appear. "Branch" stays, because GitHub says it.
- Git missing (`canUseGit()` false, `runtime.js:122-142`): all three panels say
  "Weblab needs Apple's free developer tools for this" with an Install button
  that triggers `xcode-select --install`.

## Reuse from the references

- **t3code** (`reference/t3code/apps/web/src/components/GitActionsControl.tsx`,
  `GitActionsControl.logic.ts`, `BranchToolbarBranchSelector.tsx`, server
  `apps/server/src/vcs/GitVcsDriverCore.ts`): the file list with per-file
  checkboxes and +/- counts, the "blank note is written for you" idea, the
  default-branch warning, the search-or-create branch picker, and the exact git
  commands (`status --porcelain=2 --branch`, `diff HEAD --numstat`,
  `rev-list --left-right --count`, `reset` + `--literal-pathspecs add -A --`,
  `push -u origin HEAD:refs/heads/<b>`, `for-each-ref refs/heads`).
- **Old Weblab** (`coder-new/onlook/apps/web/client/src/app/project/[id]/_components/top-bar/`):
  the top-bar placement (branch, git button, publish at the far right), the
  "Upload changes" wording in `local-git-handoff.tsx`, the Publish button's
  state labels, and the hosting-provider idea. Its Vercel backend is not in the
  checkout, so nothing to port there.
- **This repo**: `packages/git/src/index.ts` has `dirtyFiles`, `createBranch`,
  `pushBranch`, `commitEdit` (exact-file staging) to copy the logic from.
  `apps/desktop/src/github.js` already holds the GitHub token and
  `gitAuthEnv(token)` for authenticated pushes. `apps/desktop/src/sites.js`
  already runs git from the main process behind `runtime.canUseGit()`.

## What changes

| What | Where | Why |
|---|---|---|
| Branch chip, Upload and Deploy buttons | `apps/desktop/renderer/index.html`, `renderer/styles.css` | The three controls in the bar's 24px style. The ready status becomes a dot before the site name and Site settings becomes an icon: the right column is only ~330px at the 820px minimum window (`main.js:161`, `styles.css:81-106`). |
| Panel logic | new `renderer/upload-panel.js`, `renderer/deploy-panel.js`, `renderer/branch-panel.js`; `renderer/app.js` shows them only in the editor view | Keeps `app.js` from growing past 1000 lines. |
| Git in the main process | new `apps/desktop/src/git.js` | Status, file stats, branches, switch, create, upload, retry after a clash. CommonJS, `execFile` on `/usr/bin/git`, like `sites.js`. |
| AI note | new `apps/desktop/src/note.js` | One short call to the site's agent CLI with the change summary. Falls back to plain text. |
| Vercel | new `apps/desktop/src/deploy.js` | Sign-in, first-time project link, deploy to test or live, progress and errors. |
| Bridge | `apps/desktop/src/main.js`, `src/preload.js` | New `weblab.git.*` and `weblab.deploy.*` handlers. |
| Panels over the editor | `apps/desktop/src/main.js` | The editor view sits above the renderer, so a panel would hide behind it. While a panel is open, main shows a still image of the editor and hides the live view. |
| Put a site on GitHub | `apps/desktop/src/github.js` | Create a private repo (`POST /user/repos`), `remote add origin`, first push. Every Weblab-made site needs this before Upload can work. |
| AI job events and "ask AI" payload | `packages/overlay/src/app.ts`, `apps/desktop/src/editor-preload.js`, `src/main.js:434-441` | Today the channel carries only `palette` and `shortcuts`, no payload, no job events. Needs `job-started`, `job-finished` upward and `ask-ai(text)` downward. CLI rebuild. |
| Hide the chat's git items in the desktop app | `packages/overlay/src/chat/transcript.ts` | Upload replaces them; they fail in the app anyway. |
| Docs | `apps/desktop/README.md`, `CONTROLS.md` | New controls and what each needs (GitHub, Vercel). |

## What it looks like

See the published page and the live prototype (links in frontmatter). In short:

- **Top bar, right side**: `Edit | Preview` · settings icon · divider ·
  `Upload (3)` · **`Deploy`** (blue, far right, the only solid blue button).
- **Top bar, centre**: ready dot, `Acme Studio`, then a quiet chip `⎇ main ⌄`.
- **Upload panel** (380px, drops under Upload): where it goes (repo and branch),
  the main-branch warning with "Use a new branch", the change list (all ticked,
  untick to leave out), the AI note (editable, "write again" button), then
  Cancel and "Upload 3 changes". States: uploading, uploaded, clash, nothing to
  upload, not on GitHub yet.
- **Deploy panel** (380px, under Deploy): Test link or Live site, a note when it
  includes changes not uploaded, then "Make test link" or "Update live site".
  States: not connected, building (steps), ready (link, Copy, Open), build
  failed (Vercel's message plus "Ask AI to fix it").
- **Branch panel** (300px, under the chip): search or make a branch, the list
  with who and when, "New branch from main", and a line saying your changes
  come with you.

## What it costs

- **AI note**: runs on the person's own Claude sign-in. No extra bill for
  Weblab; API-key users pay a fraction of a cent per note. Adds about 3 to 8 seconds, shown as a shimmer in
  the note field while the list is already usable.
- **Vercel**: Hobby is free but only for personal, non-commercial sites. Client
  or company sites need Pro, about $20 per person per month. The connect screen
  says so.
- **Build time**: none on our side.

## What could go wrong

| Failure the person would notice | Mitigation |
|---|---|
| Site needs secret keys (Convex, Clerk) and the Vercel build fails | First deploy offers to copy key names and values from `.env*` to Vercel. Convex's own deploy step is still out of scope; its failure gets the plain error and "Ask AI to fix it". |
| Someone else uploaded first | One press fetches and rebases, then pushes. Same lines changed: abort, restore, offer "Use a new branch". |
| Switching branch with unsaved changes that clash | Git refuses; we show "Upload or leave out your changes first" and do not switch. |
| AI note is slow or fails | The field falls back to "Update hero.tsx, pricing.css and 1 more" after 15 seconds. The button never waits on the AI. |
| Panel hides behind the editor | The still-image approach above. Tested on open, resize and window focus loss. |
| Deploy hits someone else's Vercel project with the same name | Never link by name. Link by GitHub repo or create, and store the project id. |
| Test link opens a Vercel sign-in wall | Previews are public on projects Weblab creates; existing projects say so in the panel. |
| Live site and GitHub drift apart | The decision below; default keeps them in step. |
| Org repo blocks the Weblab GitHub app | Plain message with the link to request access. |

## How it is built

### Slice 1: Upload (about 2.5 sessions)

1. **Top bar**: chip, Upload, Deploy, the status dot and the settings icon.
   `-webkit-app-region: no-drag` on each control. Panels in new renderer files.
2. **Panel over editor**: `editor:freeze(true|false)` in `main.js`. Capture the
   `WebContentsView` with `capturePage()`, send the data URL to the renderer
   to draw under the scrim, then `setVisible(false)` (the `editor:visible`
   handler at `main.js:421-425` already does the hiding). Reverse on close,
   on window blur, and on resize.
3. **Job events**: overlay posts `job-started` and `job-finished` through the
   editor preload; main forwards to the renderer. Upload count refreshes on
   `job-finished`, on window focus, and every 10s while visible. Actions wait
   while a job runs.
4. **Hide the chat's git items** when the overlay knows it runs in the desktop app.
5. **Put on GitHub** (no `origin`): name field (site slug), private by default,
   `POST /user/repos`, `remote add origin https://github.com/<login>/<name>.git`,
   first push with `gitAuthEnv(token)`. Name taken → suffix and say so.
6. **Status** `git:status`: `status --porcelain=2 --branch -z`, untracked files,
   and commits ahead of upstream (auto-commit makes local commits that Upload
   must also push: `packages/server/src/index.ts:484`). Panel line when ahead:
   "Also sends 2 earlier saves". File kinds: Edited, New, Removed, New image.
7. **Note** `note.js`: summary of names and first 60 diff lines per file, capped
   at 4000 chars, via `claudeBinary() -p --model claude-sonnet-5 --effort medium`
   in a temp cwd, settings and MCP off, 15s timeout, fallback text.
8. **Upload** `git:upload({ files, note, newBranch })`: if `newBranch`,
   `checkout -b <login>/<slug>` where slug comes from the note, or
   `update-<date>` if the note is not ready. `reset -q`,
   `--literal-pathspecs add -A -- <files>`, commit with per-commit identity
   `-c user.name=<GitHub name> -c user.email=<id>+<login>@users.noreply.github.com`
   (fetch `/user` for id and name; the saved account has only login and avatar,
   `github.js:193-198`). `push -u origin HEAD:refs/heads/<branch>`.
9. **Errors**: non-fast-forward → clash panel. "Get theirs and try again":
   `fetch`, then `rebase origin/<branch>` with unticked files stashed; on
   conflict `rebase --abort`, restore the stash, and offer "Use a new branch".
   Shallow repos (clones are `--depth 1`, `clone.js:124-130`) run
   `fetch --unshallow` first. 401 → "Sign in to GitHub again". Refused push to
   `.github/workflows` (no `workflow` scope) → plain message. Offline → "Could
   not reach GitHub". SSH origins: pass `SSH_AUTH_SOCK` through `childEnv`.
10. **Main warning**: when the branch is the default branch; if a Vercel project
    for this repo deploys from it, the copy names the live address.
11. **Ask to add to main**: `POST /repos/{o}/{r}/pulls`, title = note, open the URL.

Proof: a fresh Weblab site goes to GitHub privately; upload two of three files
on a new branch; the clash path against a second clone; the AI-busy state.

### Slice 2: Deploy (about 2 sessions)

1. Run the Vercel CLI as `bun x vercel@<pinned>` with `childEnv()` (the packaged
   runtime has `bun`, no `bunx`, `runtime.js:37-55`). Pin the version.
2. Connected: `vercel whoami`. Connect: run `vercel login`, parse the device URL
   and code from stdout, open the URL with `shell.openExternal`, show "Finish
   signing in, in your browser" with Cancel (kills the child). Same pattern as
   the Claude sign-in in `src/auth.js:93-141`.
3. Project: look up a project linked to the site's GitHub repo; else create one
   with a free name; store `projectId` and `orgId` per site; write `.vercel/`
   and add it to `.gitignore`. Turn off preview protection on projects we create.
4. Keys: on first deploy, if `.env*` files exist, list the key names (never
   values) and offer "Copy keys to Vercel" (`vercel env add` per key for
   preview and production). Add `.vercelignore` with `.env*` so the files
   themselves never upload.
5. Deploy: test = `vercel deploy --yes --logs`; live = the decision (default:
   run Upload to the current branch first, then `vercel deploy --prod --yes
   --logs`, or for Git-linked projects let Vercel build from the push).
   Parse the streamed log for the steps; keep the last 80 lines for errors.
6. Failure: last error line in the panel; "Ask AI to fix it" sends the 80 lines
   to the chat through the new `ask-ai` command.
7. Button dot: white while building, green ready, red failed; tooltip says where
   and when. Live from a branch other than main shows a callout.

Proof: a real site makes a test link that opens signed out; live updates the
production address; a broken import shows the failure and fills the chat.

### Slice 3: branches (about 1.5 sessions)

1. When the panel opens: `fetch --prune`, and once per shallow or single-branch
   clone `fetch --unshallow` plus a full `remote.origin.fetch` refspec.
2. List `for-each-ref --sort=-committerdate refs/heads refs/remotes/origin`,
   merge local and remote names, show author and relative date.
3. Switch with `checkout` (or `checkout --track origin/x`); create with
   `checkout -b`, reusing `packages/git` logic. Refuse while the AI works or
   when git refuses because of unsaved clashes; say "Upload or leave out your
   changes first".
4. After a switch: if the lockfile changed, run `bun install` then restart the
   dev server (restart alone does not reinstall, `runner.js:70-79`); show
   "Getting this branch ready" in the status dot tooltip and a small banner.
5. Undo history is per folder (`packages/server/src/history.ts:21`): clear it on
   switch so undo never brings back the other branch's text.
6. Wording: the chat already uses "Branch" for forking a conversation
   (`overlay app.ts:5712-5718`). The top-bar chip always shows the branch icon
   and name, never the word "Branch" alone.

Proof: switch between two branches in a real site with a lockfile change; the
clash case stays put; undo after switching does nothing.

## Not in this

- Merging branches or fixing clashes inside Weblab. GitHub does that.
- Deploy history, rollback, custom domains, environment variables. Vercel's own
  site does that for now.
- Choosing a Vercel team, or hosts other than Vercel.
- Deleting or renaming branches.
- Showing what changed inside a file (a diff view). The list says which files
  and how much, not the lines.

## The decision (owner, 2026-09-28)

Deploy only deploys. It never uploads to GitHub, for test links and the live
site alike. Upload and Deploy stay separate buttons with separate jobs. The
Deploy panel says so in one line ("GitHub is not touched").

Build order: Upload, then Deploy, then branches. Built in one pass on
2026-09-28.

## Built, and what is still open

- Built: all three panels, the still-image trick, AI job events, "Ask AI to fix
  it", private repo creation, clash retry, rewinding the old branch after
  unsent saves move, Vercel sign-in, link by repo or free name, keys, test and
  live deploys, branch list, switch with reinstall, create.
- Not done: clearing the editor's undo history on branch switch
  (`packages/server/src/history.ts`), an Install button for Apple's developer
  tools (the panel explains instead), and choosing a Vercel team.
- The editor-side pieces (job events, ask-ai, hiding the chat's git rows) need
  the CLI rebuilt before the desktop app sees them.
