# Desktop Releases Guide

The Weblab desktop app is an Electron wrapper around [weblab.build](https://weblab.build).  
This doc covers three paths: building locally, sharing with friends, and publishing an official release.

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
| macOS    | `github.com/weblab/weblab/releases/latest/download/Weblab.dmg` |
| Windows  | `github.com/weblab/weblab/releases/latest/download/Weblab-Setup.exe` |
| Linux    | `github.com/weblab/weblab/releases/latest/download/Weblab.AppImage` |

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

## 5. Sign-in (OAuth via deep link)

Google and a handful of other providers refuse to authenticate inside an
embedded BrowserWindow. To make sign-in work cleanly, the desktop app routes
OAuth through the user's default system browser and uses a `weblab://` deep
link to come back. **No web app code changes are required.**

### What happens, step by step

1. User clicks "Sign in with Google" inside the BrowserWindow.
2. The web app initiates the Supabase OAuth flow normally. The PKCE
   `code_verifier` cookie is set in the BrowserWindow's persistent partition
   (`persist:weblab`).
3. The BrowserWindow tries to navigate to `accounts.google.com`. We detect
   that host in `main.js` (`BLOCKED_OAUTH_HOSTS`) and intercept the
   navigation via `will-navigate` / `setWindowOpenHandler`, opening it via
   `shell.openExternal` instead.
4. The user signs in in their default browser.
5. Supabase redirects to `weblab://auth/callback?code=...`.
6. The OS dispatches that URL back to the desktop app via `open-url` on
   macOS or `second-instance` on Windows/Linux. We register `weblab://` as
   the default protocol handler in `app.setAsDefaultProtocolClient`.
7. `handleDeepLink` rewrites the URL to
   `https://weblab.build/auth/callback?code=...&native=1` and loads it in
   the existing BrowserWindow.
8. The server-side `/auth/callback` route exchanges the code using the
   `code_verifier` cookie that's still in this BrowserWindow's cookie jar.
   Session cookies get set in `persist:weblab`. User is signed in.

### Required Supabase configuration

In your Supabase project → **Authentication → URL Configuration**:

- Add `weblab://auth/callback` to the **Redirect URLs** allow-list.
- Keep `https://weblab.build/auth/callback` for the web app and the
  https-bounce step above.

That's all — same allow-list entry as iOS, no per-platform config.

### Testing the deep link locally

```bash
# macOS
open "weblab://auth/callback?code=test"

# Windows  (cmd)
start weblab://auth/callback?code=test

# Linux
xdg-open "weblab://auth/callback?code=test"
```

The desktop app should load `https://weblab.build/auth/callback?code=test&native=1`.

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
