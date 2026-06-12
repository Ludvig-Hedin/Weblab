# Desktop Releases Guide

The Weblab desktop app is an Electron wrapper around [weblab.build](https://weblab.build).  
This doc covers three paths: building locally, sharing with friends, and publishing an official release.

## Changelog

### v0.2.4

First public release since v0.2.1 — includes everything from the unreleased
v0.2.2 and v0.2.3 work below.

- **Local-first project mode (foundation).** New IPC bridge + `LocalProvider`
  let the desktop shell run a project's dev server locally: scaffold a new
  local project, install dependencies on boot, start/stop the dev server
  (process group killed cleanly on stop), bind the frame's port, and watch
  the filesystem with chokidar (startWatch now awaits the watcher's `ready`).
  Covered by headless integration tests: dev-server boot + watch, canvas
  rendering the local server, element-select + live restyle against the real
  preload, and the edit→save→serve loop.
- **Auth handoff hardening.** The `weblab://` protocol registration and the
  handoff launch flow moved to a dedicated iframe path, completing the
  browser-handoff sign-in shipped in v0.2.2.
- **Website downloads are now first-party.** weblab.build/download serves
  installers via `/api/download/<platform>` (302 to the latest release
  asset) — clicking Download saves the file directly instead of sending
  users to a GitHub page.

### v0.2.2

- Desktop sign-in now works end-to-end. OAuth (Google/GitHub/Vercel) and email
  sign-in hand off to the user's real default browser via
  `weblabNative.openExternal`, finish there, then return to the app through a
  `weblab://auth/handoff?ticket=…` deep link that the shell redeems at
  `/sign-in/redeem`. This sidesteps Google's block on embedded Chromium and the
  Cloudflare Turnstile failures that broke in-window provider sign-in.
- Fixed a sign-in cookie-write race: after redeeming the handoff ticket the app
  now waits for the session to go live before navigating to `/projects`, so the
  last step no longer occasionally bounces back to the sign-in screen.
- Window drag is now injected from the main process on every load
  (`insertCSS` + `data-desktop` stamping), so the top-of-window drag region
  survives even if the web-side CSS is stripped or the renderer errors before
  mounting its own chrome.
- Hardened auth error handling: Convex JWT rejections and Clerk Backend API
  failures during the handoff now render an actionable screen instead of the
  generic crash boundary.

### v0.2.1

- CI: pinned the build runners' Python to 3.11 so native dependencies that rely
  on `distutils` (removed from the Python 3.12 stdlib) compile on the macOS and
  Windows release runners. Packaging-only release — no app behavior changes.

### v0.2.0

- Window now drags from the top 38px on every route, including the root error boundary, sign-in, and any page that hasn't yet rendered its own drag region. Implemented as a CSS-only fallback strip injected on `load` so it survives renderer errors.
- Renderer console warnings/errors are forwarded to the main process stdout so future "Something went wrong" reports leave a native trace.
- New native recovery handlers for `did-fail-load` (one-shot auto-retry + Retry/Quit dialog), `render-process-gone` (Reload/Quit dialog), and `unresponsive` (Keep waiting/Reload dialog) — the app no longer leaves a blank or frozen window.
- macOS chrome now uses the `under-window` vibrancy material so the hidden title-bar inset reads as native blurred chrome instead of a flat black bar.

### v0.1.0

- Initial release.

---

## Prerequisites

- **Node.js 20+** (use `nvm use 20` or install from nodejs.org)
- **macOS** to build the Mac DMG (Apple requires a Mac for `.dmg`)
- **Windows** to build the Windows installer (can also be done in CI)
- Linux builds can be produced on any OS via GitHub Actions

Install desktop dependencies once:

```bash
cd apps/desktop
bun install
```

The build scripts create the workspace `node_modules` link automatically before packaging, so you can run the Bun build commands directly after installing.

---

## 1. Build locally (fastest — great for sharing with friends)

```bash
# From the repo root:
cd apps/desktop

# Build for your current OS only
bun run build:mac     # → dist/Weblab.dmg  (macOS)
bun run build:win     # → dist/Weblab Setup.exe  (Windows)
bun run build:linux   # → dist/Weblab.AppImage  (Linux)
```

The output files land in `apps/desktop/dist/`.

> **Sharing with friends:** just send them the file directly — e.g. `Weblab.dmg` via AirDrop, Google Drive, or iMessage. They double-click it and drag Weblab to Applications. Done.

### macOS Gatekeeper warning

Because the app isn't notarized yet, macOS will show *"Weblab can't be opened because it is from an unidentified developer."*

Tell your friends to do this **once** to bypass it:

```
Right-click (or Control-click) the app → Open → Open anyway
```

Or from Terminal after mounting the DMG:
```bash
xattr -cr /Applications/Weblab.app
```

---

## 2. Publish an official GitHub Release (makes the download button work)

The download button in the hero points to:

| Platform | URL |
|----------|-----|
| macOS    | `github.com/Ludvig-Hedin/Weblab/releases/latest/download/Weblab.dmg` |
| Windows  | `github.com/Ludvig-Hedin/Weblab/releases/latest/download/Weblab-Setup.exe` |
| Linux    | `github.com/Ludvig-Hedin/Weblab/releases/latest/download/Weblab.AppImage` |

These URLs resolve automatically once you push a tagged release with those filenames attached.

### Step-by-step

```bash
# 1. Bump the version in apps/desktop/package.json, then commit:
git add apps/desktop/package.json
git commit -m "chore: bump desktop to v0.1.0"

# 2. Push a tag that matches the CI trigger  (desktop-v*)
git tag desktop-v0.1.0
git push origin desktop-v0.1.0
```

GitHub Actions will:
1. Spin up runners for macOS, Windows, and Linux in parallel
2. `bun run build:*` on each
3. Create a GitHub Release named `desktop-v0.1.0`
4. Attach the `.dmg`, `.exe`, and `.AppImage` as release assets

The download button will work as soon as the release is published (usually ~10 minutes).

---

## 3. GitHub Actions CI (`.github/workflows/desktop-release.yml`)

The workflow is already committed and triggers on any tag matching `desktop-v*`.

```
desktop-v0.1.0   ← triggers the build
desktop-v0.2.3   ← triggers the build
v0.1.0           ← does NOT trigger (no "desktop-" prefix)
```

No secrets are required for the first release — `GITHUB_TOKEN` is provided automatically.  
The workflow uploads artifacts via `softprops/action-gh-release`.

---

## 4. Auto-updates

`electron-updater` is already wired up in `main.js`.  
Once a user installs the app, it will check GitHub Releases on every launch and offer to update automatically — no action needed from you.

---

## 5. Sign-in (browser-handoff OAuth)

OAuth and email sign-in run in the user's **real default browser**, not inside
the app. Embedded Chromium is a dead end for sign-in — Google blocks it
outright, GitHub/Vercel/Clerk construct the OAuth `client_id` differently
outside a real browser, and Cloudflare Turnstile (Clerk's bot check) fails its
environment probe. So the desktop shell hands the flow to the OS browser and
gets the finished session back through a one-time ticket.

### What happens, step by step

1. User clicks an OAuth provider (or submits their email) inside the main
   Weblab window.
2. The web app calls `weblabNative.openExternal('…/sign-in/desktop-handoff?…')`,
   which `main.js` routes to `shell.openExternal` — the OS default browser
   opens the handoff URL.
3. In the browser: if the user isn't signed in, `/sign-in/desktop-handoff`
   bounces to `/sign-in` (carrying a `returnUrl` back to itself). The user
   completes OAuth or email OTP there normally.
4. Once signed in, `/sign-in/desktop-handoff` mints a short-lived (60s) Clerk
   **sign-in ticket** server-side and the page sets
   `window.location.href = 'weblab://auth/handoff?ticket=…'`.
5. The OS launches the `weblab://` deep link; `handleDeepLink` (main.js)
   rewrites it to `/sign-in/redeem?ticket=…&native=1` and loads it in the main
   window.
6. `/sign-in/redeem` calls `signIn.create({ strategy: 'ticket', ticket })` then
   `setActive`, writing the session into the `persist:weblab` cookie partition,
   waits for the session to go live, and lands the user on `/projects`.

The OAuth provider hosts are also defense-in-depth blocked from rendering in any
BrowserWindow (`will-navigate` / `will-redirect` / `setWindowOpenHandler` bounce
them to `shell.openExternal`).

### Required OAuth / Clerk configuration

- Register `weblab://` as a custom URL scheme (already done in `main.js` via
  `app.setAsDefaultProtocolClient`).
- In Clerk, allow the hosted redirect URLs used by the in-browser flow
  (`https://weblab.build/sign-in/sso-callback`, `…/sign-in/redeem`). No
  provider-side `weblab://` redirect entry is needed — the deep link is fired
  by the browser page itself, not by an OAuth redirect.

### Testing the deep link locally

```bash
# macOS — simulate the handoff the browser fires after sign-in
open "weblab://auth/handoff?ticket=test"

# Windows  (cmd)
start weblab://auth/handoff?ticket=test

# Linux
xdg-open "weblab://auth/handoff?ticket=test"
```

The desktop app should load `https://weblab.build/sign-in/redeem?ticket=test&native=1`
(the redeem screen will then reject `test` as an invalid ticket — that's
expected; it confirms the deep-link routing works).

---

## 6. Code signing (optional, removes the Gatekeeper warning)

Skip this for now if you're just sharing with friends.  
Add these secrets to your GitHub repo when you're ready:

| Secret name           | What it is                                 |
|-----------------------|--------------------------------------------|
| `MAC_CERT_P12_BASE64` | Base64-encoded `.p12` Apple Developer cert |
| `MAC_CERT_PASSWORD`   | Password for the `.p12`                    |

Then uncomment the two `CSC_*` lines in `desktop-release.yml`.

---

## 7. File naming reference (electron-builder defaults)

| Platform | Output filename              |
|----------|------------------------------|
| macOS    | `Weblab.dmg` (universal, covers both Intel and Apple Silicon) |
| Windows  | `Weblab-Setup.exe` |
| Linux    | `Weblab.AppImage` |

> **Note:** The download URLs in `constants/index.ts` point to the *latest* release, not a specific version, so they stay valid across releases without any code changes.
