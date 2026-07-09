# Desktop Releases Guide

The Weblab desktop app is an Electron wrapper around [weblab.build](https://weblab.build).  
This doc covers three paths: building locally, sharing with friends, and publishing an official release.

## Changelog

### v0.2.6

- **Packaged startup fix.** The macOS app now includes `auth-hosts.js` in
  `app.asar`, fixing the launch-time `Cannot find module './auth-hosts'`
  crash reported from `/Applications/Weblab.app`.
- **Packaging regression guard.** Added a desktop test that walks the local
  runtime `require('./…')` graph and verifies every required file is covered by
  the `electron-builder` `build.files` allowlist before a release is cut.

### v0.2.5

- **Code-sign + notarize ready.** Build config now wires hardened-runtime
  entitlements (`build/entitlements.mac.plist` + `.inherit.plist`) and a
  conditional `afterSign` notarize hook (`scripts/notarize.js`). With a
  Developer ID Application cert and Apple notary credentials in env, the DMG
  ships ticket-stapled and Gatekeeper opens it without the "unidentified
  developer" warning. Without credentials the hook no-ops, so unsigned local
  builds still work. CI workflow (`.github/workflows/desktop-release.yml`)
  now forwards the signing/notarize secrets when present.
- **Signing guide.** Step-by-step terminal instructions added to this file
  (see "Code signing & notarization" below) covering one-time cert acquisition,
  notarytool keychain setup, local signed build, and CI secret config.

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

---

## 8. Code signing & notarization (eliminate the macOS warning)

To ship a `.dmg` that opens with **no warning at all** on every Mac, you need
two things from Apple:

1. A **Developer ID Application** certificate (one-time setup, $99/year via the
   Apple Developer Program).
2. An **App Store Connect API key** (or app-specific password) so notarytool
   can submit the signed `.app` for Apple's automated malware scan.

Once both are in place, every build automatically signs, notarizes, and
staples — the user sees Finder open the DMG normally and double-clicking the
app just works.

### 8.1 One-time setup — get the signing certificate

```bash
# 1. Enroll at https://developer.apple.com/programs/  ($99/yr).
#    Wait for the "Welcome to the Apple Developer Program" email.

# 2. Generate a Certificate Signing Request from Keychain Access:
#    Keychain Access → Certificate Assistant → Request a Certificate
#    From a Certificate Authority…
#      • User Email Address: ludvig@ludvighedin.com
#      • Common Name:        Ludvig Hedin
#      • CA Email Address:   (leave blank)
#      • Request is:         Saved to disk
#    Save the .certSigningRequest file (e.g. ~/Desktop/weblab.certSigningRequest)

# 3. Upload the CSR at https://developer.apple.com/account/resources/certificates/list
#    Click "+", pick "Developer ID Application", upload the CSR.
#    Download the resulting `developerID_application.cer`.

# 4. Double-click the .cer to install it into your login keychain.

# 5. Verify it landed and grab the full identity name:
security find-identity -v -p codesigning
# Expect a line like:
#   1) ABCDEF1234567890… "Developer ID Application: Ludvig Hedin (TEAMID12345)"
```

The 10-character team ID inside the parentheses is your `APPLE_TEAM_ID`.

### 8.2 Export the cert to a `.p12` (for CI)

```bash
# Open Keychain Access → "My Certificates" tab → expand the
# "Developer ID Application: Ludvig Hedin (TEAMID12345)" entry → right-click
# the private key → Export. Choose Personal Information Exchange (.p12).
# Set a strong password and save as ~/Desktop/weblab-developer-id.p12.

# Convert to base64 for GitHub Secrets:
base64 -i ~/Desktop/weblab-developer-id.p12 | pbcopy
# (now paste into the MAC_CERT_P12_BASE64 GitHub secret — see 8.5)
```

### 8.3 Create the notary credentials

Pick **one** of these two methods. API key is recommended (no 2FA prompts,
no Apple ID password reuse).

#### Option A — App Store Connect API key (recommended)

```bash
# 1. Go to https://appstoreconnect.apple.com/access/api  →  Keys tab.
# 2. Click "Generate API Key". Access = "Developer". Save the issuer ID and
#    key ID shown on the page (Apple never shows them again).
# 3. Download the .p8 file ONCE — it cannot be re-downloaded.
mkdir -p ~/.appstoreconnect/private_keys
mv ~/Downloads/AuthKey_*.p8 ~/.appstoreconnect/private_keys/

# 4. Test it works with notarytool:
xcrun notarytool history \
  --key ~/.appstoreconnect/private_keys/AuthKey_XXXXXXXX.p8 \
  --key-id XXXXXXXX \
  --issuer XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
# Should print "No history found" (or your previous submissions). No errors.
```

Optionally store the credentials in the system keychain so you don't have to
pass `--key/--key-id/--issuer` on every build:

```bash
xcrun notarytool store-credentials "WEBLAB_NOTARY" \
  --key ~/.appstoreconnect/private_keys/AuthKey_XXXXXXXX.p8 \
  --key-id XXXXXXXX \
  --issuer XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
```

#### Option B — App-specific password (alternative)

```bash
# 1. https://appleid.apple.com  →  Sign-In and Security  →
#    App-Specific Passwords  →  Generate.
#    Label it "weblab notarytool". Copy the password (e.g. abcd-efgh-ijkl-mnop).

# 2. Test it:
xcrun notarytool history \
  --apple-id ludvig@ludvighedin.com \
  --password abcd-efgh-ijkl-mnop \
  --team-id TEAMID12345
```

### 8.4 Local signed build — terminal recipe

```bash
# From the repo root, switch to a build-capable Node version (electron-builder
# requires Node 20+; the nvm default is 18 — see project memory).
nvm use 20

cd apps/desktop
bun install
bun add -d @electron/notarize     # only the first time

# Tell electron-builder which identity to use and unlock the keychain so the
# build can sign without interactive prompts.
export CSC_IDENTITY_AUTO_DISCOVERY=true
security unlock-keychain -p "<your login password>" ~/Library/Keychains/login.keychain-db

# --- Auth method A: App Store Connect API key ---
export APPLE_API_KEY="$HOME/.appstoreconnect/private_keys/AuthKey_XXXXXXXX.p8"
export APPLE_API_KEY_ID="XXXXXXXX"
export APPLE_API_ISSUER="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"

# --- OR auth method B: app-specific password ---
# export APPLE_ID="ludvig@ludvighedin.com"
# export APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"
# export APPLE_TEAM_ID="TEAMID12345"

# Enable notarization for this build (default is `notarize: false` in
# package.json so unsigned local builds keep working).
export NOTARIZE=1   # the hook reads creds from env — see scripts/notarize.js

# Build the universal DMG. electron-builder picks up the keychain identity,
# signs the .app with hardened runtime + entitlements, then the afterSign
# hook submits it to Apple notary and waits for the ticket.
bun run build:mac
# → apps/desktop/dist/Weblab.dmg (signed + notarized + stapled)

# Verify the result.
codesign --verify --deep --strict --verbose=2 dist/mac-universal/Weblab.app
# Expect: "Weblab.app: valid on disk … satisfies its Designated Requirement"

spctl --assess --type execute --verbose dist/mac-universal/Weblab.app
# Expect: "accepted source=Notarized Developer ID"

xcrun stapler validate dist/mac-universal/Weblab.app
# Expect: "The validate action worked!"

# Validate the DMG itself too.
spctl --assess --type install --verbose dist/Weblab.dmg
# Expect: "accepted source=Notarized Developer ID"
```

If any of the three verify commands fails, do NOT ship — re-run the build and
inspect the log printed by `scripts/notarize.js`.

### 8.5 CI — sign on every tagged release

Add these to **GitHub → Settings → Secrets and variables → Actions** so the
`Desktop Release` workflow signs and notarizes too:

| Secret | Value |
|--------|-------|
| `MAC_CERT_P12_BASE64`           | Output of `base64 -i weblab-developer-id.p12` |
| `MAC_CERT_PASSWORD`             | The .p12 export password from step 8.2 |
| `APPLE_API_KEY_P8_BASE64`       | `base64 -i AuthKey_XXXXXXXX.p8` |
| `APPLE_API_KEY_ID`              | Key ID from App Store Connect |
| `APPLE_API_ISSUER`              | Issuer UUID from App Store Connect |
| `APPLE_TEAM_ID`                 | Your 10-char team ID |

(Or, with Option B: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.)

The macOS job in `.github/workflows/desktop-release.yml` reads these env vars
and runs the same build as locally — no extra config needed after the secrets
land.

### 8.6 Verifying from a fresh Mac

The fastest sanity check is to download the released DMG from
`weblab.build/api/download/mac` on a Mac that has never run the app:

1. Double-click the DMG. Finder should open it with no warning.
2. Drag `Weblab.app` to `Applications`.
3. Double-click `Weblab.app`. macOS should launch it without any prompt.

If a "this app was downloaded from the internet, are you sure?" dialog
appears, that's normal first-run behavior, not the unsigned warning. The bad
one is *"Weblab can't be opened because Apple cannot check it for malicious
software"* — if you see that, the notarization step silently failed.

### 8.7 Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `errSecInternalComponent` during sign | Keychain locked | `security unlock-keychain ~/Library/Keychains/login.keychain-db` |
| `Asset has not completed processing` | Notarization queue slow | Wait ~5 min, re-run `xcrun notarytool history` — Apple usually returns in 1–3 min |
| `Invalid` from notarytool | Hardened runtime / entitlements missing | Re-check `build/entitlements.mac.plist` is referenced in `package.json` |
| `spctl: rejected` | Stapling missing | Re-run `xcrun stapler staple dist/mac-universal/Weblab.app` |
| `No identity found` in CI | `MAC_CERT_P12_BASE64` not decoded into the runner keychain | Confirm the workflow imports it via `security import` before build (see workflow) |
