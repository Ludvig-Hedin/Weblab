const { app, BrowserWindow, shell, Menu, ipcMain, dialog, session } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { safeStorage } = require('electron');
const { ReleaseStore } = require('./release/store');
const { PublishingService } = require('./release/service');
const { createPublishAuthorizer } = require('./release/authorize');
const { registerPublishingIpc } = require('./release/ipc');
const { hasSiteEngine } = require('./release/site-engine');
const { registerIpcHandlers: registerCliIpc, disposeCli } = require('./weblab-cli');
const { registerLocalIpc, grantLocalRoot, disposeLocal } = require('./weblab-local');
const { isOAuthHost } = require('./auth-hosts');
const { createLoginHandoff, externalHttpUrl, isTrustedSender } = require('./auth-policy');
const { resolveDesktopProfile, desktopBootstrapArgument } = require('./desktop-profile');
const { installDesktopLog } = require('./desktop-log');

const DESKTOP_PROFILE = resolveDesktopProfile({
    packaged: app.isPackaged,
    metadata: require('./package.json').weblabDesktopProfile,
    environment: process.env,
});
const APP_NAME = DESKTOP_PROFILE.name;
const APP_URL = DESKTOP_PROFILE.siteUrl;
const APP_ORIGIN = new URL(APP_URL).origin;
const SESSION_PARTITION = DESKTOP_PROFILE.partition;
const BOOTSTRAP_ARGUMENT = desktopBootstrapArgument(DESKTOP_PROFILE);
app.setName(APP_NAME);
// Cookie partitions, folder grants, private copies and the single-instance
// lock must all be isolated before any of them are opened.
if (DESKTOP_PROFILE.userDataName) {
    app.setPath('userData', path.join(app.getPath('appData'), DESKTOP_PROFILE.userDataName));
}
// Packaged apps have no terminal, so keep what the shell prints in a small file.
const DESKTOP_LOG_FILE = installDesktopLog(app.getPath('logs'));

// Boot the desktop shell straight into the auth flow instead of the marketing
// landing. /sign-in server-redirects already-signed-in users to /projects, so
// a single load handles both cases. `?native=1` mirrors the flag main.js
// already stamps on deep-link callbacks (see handleDeepLink) so the web side
// can show desktop-specific UI without UA sniffing.
//
// /login was the pre-migration entry; it was deleted in the Supabase → Clerk
// cut (commit 944b1e7ac). Middleware only redirects `/` → `/sign-in` for the
// WeblabDesktop UA, so `/login?native=1` would 404. Use the canonical route.
const DEFAULT_LAUNCH_URL = (() => {
    const u = new URL('/sign-in', APP_URL);
    u.searchParams.set('native', '1');
    return u.toString();
})();

// The main process and sandboxed preload receive the same one resolved origin.
const ALLOWED_IPC_ORIGINS = new Set([APP_ORIGIN]);

// Custom URL scheme used for OAuth deep-link callbacks: weblab://auth/callback?code=...
const PROTOCOL = DESKTOP_PROFILE.protocol;

// Which hosts get bounced to the real browser vs. allowed in-window lives in
// ./auth-hosts.js (unit-tested). Summary: third-party OAuth provider sign-in
// pages + Clerk's hosted account portal are bounced; Clerk's own FAPI/handshake
// hosts stay in-window so the dev-mode handshake can complete.

const WINDOW_WIDTH = 1400;
const WINDOW_HEIGHT = 900;

let mainWindow;
let readyForWindows = false;
let pendingDeepLink = null;
const loginHandoff = createLoginHandoff({ origin: APP_ORIGIN });

ipcMain.on('weblab:get-version', (event) => {
    event.returnValue = app.getVersion();
});

// Open `url` in the user's default OS browser. OAuth flows now run in the
// real browser because Google blocks embedded Chromium outright, GitHub /
// Vercel / Clerk OAuth construction behaves subtly differently inside the
// app shell, and splitting a flow across multiple cookie jars breaks PKCE.
// The browser-side flow finishes via a `weblab://auth/handoff?ticket=...`
// deep link that hands a Clerk sign-in token to the desktop session (see
// `handleDeepLink`). Returns true if Electron handed the URL off to the OS.
function openInExternalBrowser(url, trusted) {
    if (!trusted) return false;
    const safe = externalHttpUrl(url);
    if (!safe) return false;
    const login = loginHandoff.begin(safe);
    try {
        shell.openExternal(login?.url ?? safe).catch(() => {
            if (login) loginHandoff.cancel(login.state);
        });
        return true;
    } catch {
        if (login) loginHandoff.cancel(login.state);
        return false;
    }
}

ipcMain.handle('weblab:open-external', async (event, url) =>
    openInExternalBrowser(url, isTrustedSender(event, mainWindow?.webContents, ALLOWED_IPC_ORIGINS)));

ipcMain.handle('weblab:claim-login-handoff', (event, args) => {
    if (!isTrustedSender(event, mainWindow?.webContents, ALLOWED_IPC_ORIGINS)) return false;
    return loginHandoff.claim(args?.ticket, args?.state, event.senderFrame.url);
});

// --- Open a folder dropped on the dock icon / "Open With Weblab" (macOS) -------
// `open-file` can fire before the window exists or before the user has signed
// in, so queue the path and flush it once the renderer signals it has mounted
// the folder-drop listener (`weblab:renderer-ready`). The renderer then runs
// the same "open local folder" flow used by in-window drag-and-drop.
let rendererReady = false;
let pendingOpenFolderPath = null;

async function deliverOpenFolder(folderPath) {
    if (!folderPath || typeof folderPath !== 'string') return;
    if (rendererReady && mainWindow && !mainWindow.isDestroyed()) {
        let rootPath;
        try { rootPath = await grantLocalRoot(folderPath); }
        catch { return; }
        mainWindow.webContents.send('weblab:open-folder', { rootPath });
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    } else {
        // Keep only the most recent drop — we open one project at a time.
        pendingOpenFolderPath = folderPath;
    }
}

// Register as early as possible — macOS may emit this before `whenReady`.
app.on('open-file', (event, folderPath) => {
    event.preventDefault();
    void deliverOpenFolder(folderPath);
});

ipcMain.on('weblab:renderer-ready', (event) => {
    try {
        if (event.sender !== mainWindow?.webContents ||
            event.senderFrame !== event.sender.mainFrame ||
            !ALLOWED_IPC_ORIGINS.has(new URL(event.senderFrame.url).origin)) return;
    } catch { return; }
    rendererReady = true;
    if (pendingOpenFolderPath) {
        const p = pendingOpenFolderPath;
        pendingOpenFolderPath = null;
        void deliverOpenFolder(p);
    }
});

registerCliIpc({
    allowedOrigins: ALLOWED_IPC_ORIGINS,
    getWebContents: () => mainWindow?.webContents ?? null,
});

// Local-first mode: filesystem + dev-server + watch IPC backing NodeFsProvider.
registerLocalIpc({
    allowedOrigins: ALLOWED_IPC_ORIGINS,
    getWebContents: () => mainWindow?.webContents ?? null,
});

// Wait for the desktop-owned preview/install children to stop before the
// Electron process exits, especially on Windows where descendants survive a
// parent exit unless their process tree is terminated explicitly.
let localShutdownStarted = false;
app.on('before-quit', (event) => {
    if (localShutdownStarted) return;
    event.preventDefault();
    localShutdownStarted = true;
    // Stop CLI chat turns (Claude Code / Codex) first and wait briefly so
    // their handoff journaling finishes and no journal lock is left behind.
    Promise.resolve().then(() => disposeCli()).then(() => disposeLocal()).then(() => {
        app.quit();
    }).catch(() => {
        localShutdownStarted = false;
        dialog.showErrorBox('Cleanup is still pending',
            'Weblab could not confirm that its AI or preview processes stopped. Keep the app open and try again.');
    });
});

// --- Single-instance + custom protocol registration ---------------------------
// On Windows / Linux, deep links come in as command-line arguments to a second
// instance of the app, so we need a single-instance lock and forward URLs.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', (_event, argv) => {
        const url = argv.find((a) => a.startsWith(`${PROTOCOL}://`));
        if (url) handleDeepLink(url);
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
            path.resolve(process.argv[1]),
        ]);
    }
} else {
    app.setAsDefaultProtocolClient(PROTOCOL);
}

// macOS delivers deep links via this event.
app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
});

/**
 * Translate `weblab://…` deep links into in-app URLs and load them.
 *
 * Two recognized shapes:
 *
 *  - `weblab://auth/handoff?ticket=…` — the browser-side OAuth flow finished
 *    and minted a one-time Clerk sign-in token for this desktop session.
 *    Route to `/sign-in/redeem?ticket=…`, where the renderer redeems the
 *    ticket via `signIn.create({ strategy: 'ticket', ticket })` and lands
 *    on `/projects`. This is the new browser-handoff OAuth path.
 *
 *  - Legacy `weblab://<path>?…` — fall back to the original behavior of
 *    rewriting `host + pathname` into a same-origin URL on `APP_URL` and
 *    loading it. Kept so any older deep-link sender (e.g. the previous
 *    Supabase `/auth/callback?code=…` flow) still works during the
 *    transition. `?native=1` is stamped on so the web side can show
 *    desktop-specific UI.
 */
function handleDeepLink(rawUrl) {
    if (!readyForWindows) {
        pendingDeepLink = rawUrl;
        return false;
    }
    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch {
        return false;
    }
    if (parsed.protocol !== `${PROTOCOL}:` || parsed.username || parsed.password || parsed.port) return false;

    // weblab://<host>/<path?> — the "host" is actually the first path segment
    // because there's no real host in a custom-protocol URL.
    const pathname = `/${parsed.host}${parsed.pathname}`.replace(/\/+/g, '/');

    // New: browser handoff with a Clerk sign-in ticket.
    if (pathname === '/auth/handoff') {
        const target = loginHandoff.accept(
            parsed.searchParams.get('ticket'), parsed.searchParams.get('state'));
        if (!target) return false;
        if (!mainWindow) {
            createWindow(target);
        } else {
            mainWindow.loadURL(target);
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
        return true;
    }

    // Legacy links must never bypass the authenticated handoff route.
    if (pathname === '/sign-in/redeem' || pathname.startsWith('/sign-in/redeem/')) return false;

    // Legacy: rewrite to same-origin URL on APP_URL and load.
    const target = new URL(pathname, APP_URL);
    parsed.searchParams.forEach((value, key) => {
        target.searchParams.set(key, value);
    });
    target.searchParams.set('native', '1');

    if (!mainWindow) {
        createWindow(target.toString());
    } else {
        mainWindow.loadURL(target.toString());
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
    return true;
}

function createWindow(initialURL) {
    mainWindow = new BrowserWindow({
        width: WINDOW_WIDTH,
        height: WINDOW_HEIGHT,
        minWidth: 800,
        minHeight: 600,
        // Match the dark theme served by the web app so the empty window
        // between BrowserWindow creation and first paint doesn't flash white.
        backgroundColor: '#0a0a0a',
        title: APP_NAME,
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        // Center the traffic lights in the 56px (h-14) editor top bar, with the
        // same visual gap on the left as on top (~20px). Tuned against a
        // screenshot: y=20 sat ~3px low, so y=17 centers the dots and x=18
        // matches the left gap to the top gap.
        ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 18, y: 17 } } : {}),
        // macOS vibrancy gives the chrome a native blurred-material feel that
        // also visually anchors the hidden title bar drag region even before
        // the renderer mounts its CSS drag strip.
        ...(process.platform === 'darwin'
            ? { vibrancy: 'under-window', visualEffectState: 'active' }
            : {}),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            // Use a partition so cookies persist across launches under a
            // predictable name. (Default would also persist, but being
            // explicit makes the intent clear.)
            partition: SESSION_PARTITION,
            additionalArguments: [BOOTSTRAP_ARGUMENT],
        },
        icon: path.join(__dirname, 'assets', 'icon.png'),
        show: false,
    });

    // Tag the WebContents UA so the Next.js middleware can recognize requests
    // from the desktop shell (used to redirect `/` → `/login` so an in-app
    // logo click or reload doesn't drop the user back on the marketing site).
    try {
        const baseUA = mainWindow.webContents.userAgent;
        mainWindow.webContents.userAgent = `${baseUA} WeblabDesktop/${app.getVersion()} Platform/${process.platform}`;
    } catch {
        // Non-fatal: missing UA marker just means middleware falls through to
        // its normal behavior and the user sees the marketing page on `/`.
    }

    mainWindow.loadURL(initialURL || DEFAULT_LAUNCH_URL);

    // Lock the window title to the app name. Without this, macOS `hiddenInset`
    // surfaces the page <title> (e.g. marketing meta titles like
    // "Weblab — AI visual website builder…") in the chrome, which feels like a
    // browser tab rather than a native app.
    mainWindow.setTitle(APP_NAME);
    mainWindow.on('page-title-updated', (event) => {
        event.preventDefault();
        mainWindow.setTitle(APP_NAME);
    });

    // Toggle a root data attribute so the web side can drop the macOS
    // traffic-light inset (80px left padding) when the user fullscreens — the
    // lights are hidden in that mode and the inset becomes wasted space.
    const setFullscreenFlag = (on) => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        const script = on
            ? `document.documentElement.dataset.desktopFullscreen='true'`
            : `delete document.documentElement.dataset.desktopFullscreen`;
        mainWindow.webContents.executeJavaScript(script).catch(() => {
            // Page may be mid-navigation; the next paint will pick up the
            // correct state from the next listener call.
        });
    };
    mainWindow.on('enter-full-screen', () => setFullscreenFlag(true));
    mainWindow.on('leave-full-screen', () => setFullscreenFlag(false));

    if (!app.isPackaged) {
        // Show immediately in dev so the window is visible while Next.js compiles.
        mainWindow.show();
        // Open devtools automatically in dev so renderer errors are visible.
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        mainWindow.once('ready-to-show', () => {
            mainWindow.show();
        });
    }

    // Open external links in the system browser. Also: if the WebContents
    // tries to navigate to a known OAuth provider, hand the URL to the OS
    // browser instead — provider sign-in pages refuse to run inside the
    // embedded Chromium (Google blocks it outright, others mis-construct the
    // OAuth `client_id` when not in a real browser context).
    const webContents = mainWindow.webContents;
    webContents.setWindowOpenHandler(({ url }) => {
        // This callback cannot prove which frame initiated a popup.
        // External popups are denied; app controls use top-frame native IPC.
        const safe = externalHttpUrl(url);
        return safe && new URL(safe).origin === APP_ORIGIN
            ? { action: 'allow', overrideBrowserWindowOptions: { webPreferences: {
                preload: path.join(__dirname, 'preload.js'), nodeIntegration: false,
                contextIsolation: true, partition: SESSION_PARTITION,
                additionalArguments: [BOOTSTRAP_ARGUMENT],
            } } } : { action: 'deny' };
    });

    const guardOAuthNavigation = (event, url) => {
        try {
            const parsed = new URL(url);
            if (!externalHttpUrl(url) || isOAuthHost(parsed.hostname)) {
                event.preventDefault();
                const trusted = webContents === mainWindow?.webContents &&
                    event.isMainFrame === true && event.frame === webContents.mainFrame &&
                    (!event.initiator || event.initiator === webContents.mainFrame) &&
                    ALLOWED_IPC_ORIGINS.has(new URL(webContents.mainFrame.url).origin);
                if (isOAuthHost(parsed.hostname)) openInExternalBrowser(url, trusted);
            }
        } catch { event.preventDefault(); }
    };
    webContents.on('will-navigate', guardOAuthNavigation);
    webContents.on('will-redirect', guardOAuthNavigation);

    // A fresh document load means the renderer's folder-drop listener is gone
    // until it re-mounts and re-signals. Reset the flag so a folder dropped on
    // the dock mid-reload is queued (not sent into a void) and flushed on the
    // next `weblab:renderer-ready`. (SPA route changes don't fire this.)
    mainWindow.webContents.on('did-start-loading', () => {
        rendererReady = false;
    });

    // --- Robustness: surface renderer errors and recover from crashes -------

    // Forward renderer console output (errors/warnings) to the main process so
    // a user filing a bug report (or `Console.app` on macOS) actually has
    // something to look at. Without this, a renderer-side throw like the one
    // that fires our root error boundary leaves no native-side trace.
    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
        // Levels: 0=verbose, 1=info, 2=warning, 3=error.
        if (level >= 2) {
            const prefix = level === 3 ? '[renderer:error]' : '[renderer:warn]';
            console.log(`${prefix} ${sourceId}:${line} ${message}`);
        }
    });

    // Auto-retry once on transient load failures (network blip, DNS, etc.).
    // ERR_ABORTED (-3) is fired for legitimate cancellations like Electron
    // navigating away from the in-flight URL — ignore those. The retry latch
    // resets every time the main frame finishes loading so each fresh attempt
    // gets its own one-shot retry budget.
    let didFailLoadRetried = false;
    mainWindow.webContents.on('did-finish-load', () => {
        didFailLoadRetried = false;

        // Stamp data-desktop and inject drag CSS from the main process.
        // This is authoritative — it works regardless of whether the web
        // app's inline <head> script or DesktopChrome component has run,
        // and is immune to Tailwind's Lightning CSS pipeline stripping
        // -webkit-app-region from globals.css.
        const plt = JSON.stringify(process.platform);
        mainWindow.webContents
            .executeJavaScript(
                `(function(){` +
                    `var r=document.documentElement;` +
                    `r.setAttribute('data-desktop','true');` +
                    `r.setAttribute('data-desktop-platform',${plt});` +
                `})();`,
            )
            .catch(() => {});
        mainWindow.webContents
            .insertCSS(
                `[data-desktop="true"] :is(.top-bar,.desktop-drag-region),` +
                `[data-desktop="true"] :is(.top-bar,.desktop-drag-region)` +
                    ` :is(div,span,h1,h2,h3,h4,h5,h6,p,section,header,nav,img,svg,ul,ol,li)` +
                    `{-webkit-app-region:drag;}` +
                `[data-desktop="true"] .desktop-drag-region{pointer-events:auto;}` +
                // no-drag is GLOBAL (not scoped to drag containers): Chromium
                // builds the OS drag region in paint order, so any interactive
                // element — including ones portaled outside .top-bar — must
                // punch its own hole or a drag surface painted near it eats
                // the click as window-drag. Descendants (icons, labels) are
                // carved out too, with a :root prefix to beat the drag rule's
                // specificity — else an svg inside a button re-adds drag and
                // only the padding around it is clickable. Matches layout.tsx.
                `:root[data-desktop="true"]` +
                    ` :is(a,button,[role="button"],[role="menuitem"],[role="tab"],[role="switch"],[role="link"],[role="combobox"],input,select,textarea,[contenteditable="true"],[contenteditable=""]),` +
                `:root[data-desktop="true"]` +
                    ` :is(a,button,[role="button"],[role="menuitem"],[role="tab"],[role="switch"],[role="link"],[role="combobox"]) *,` +
                `:root[data-desktop="true"] .desktop-no-drag,` +
                `:root[data-desktop="true"] .desktop-no-drag *{-webkit-app-region:no-drag;}`,
            )
            .catch(() => {});
    });
    mainWindow.webContents.on(
        'did-fail-load',
        (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
            if (!isMainFrame) return;
            if (errorCode === -3) return; // ERR_ABORTED
            console.log(
                `[main] did-fail-load code=${errorCode} desc="${errorDescription}" url=${validatedURL}`,
            );
            if (didFailLoadRetried) {
                showLoadFailureDialog(errorDescription, validatedURL);
                return;
            }
            didFailLoadRetried = true;
            setTimeout(() => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.loadURL(validatedURL || DEFAULT_LAUNCH_URL);
                }
            }, 1000);
        },
    );

    // Renderer process crashed or was killed — offer to relaunch instead of
    // leaving a blank white window the user has to force-quit.
    mainWindow.webContents.on('render-process-gone', (_event, details) => {
        console.log(`[main] render-process-gone reason=${details.reason} code=${details.exitCode}`);
        if (details.reason === 'clean-exit') return;
        const choice = dialog.showMessageBoxSync(mainWindow, {
            type: 'error',
            buttons: ['Reload', 'Quit'],
            defaultId: 0,
            cancelId: 1,
            title: 'Weblab crashed',
            message: 'The Weblab window crashed.',
            detail: `Reason: ${details.reason}`,
        });
        if (choice === 0 && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.reload();
        } else {
            app.quit();
        }
    });

    // Detect a hung renderer and let the user decide whether to wait or kill.
    mainWindow.on('unresponsive', () => {
        console.log('[main] window unresponsive');
        const choice = dialog.showMessageBoxSync(mainWindow, {
            type: 'warning',
            buttons: ['Keep waiting', 'Reload'],
            defaultId: 0,
            cancelId: 0,
            title: 'Weblab is not responding',
            message: 'The Weblab window has become unresponsive.',
            detail: 'You can keep waiting, or reload the window to recover.',
        });
        if (choice === 1 && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.reload();
        }
    });

    mainWindow.on('responsive', () => {
        console.log('[main] window responsive again');
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function showLoadFailureDialog(errorDescription, attemptedURL) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'error',
        buttons: ['Retry', 'Quit'],
        defaultId: 0,
        cancelId: 1,
        title: 'Could not load Weblab',
        message: 'Weblab failed to load.',
        detail: `${errorDescription}\n\nCheck your internet connection and try again.`,
    });
    if (choice === 0) {
        mainWindow.loadURL(attemptedURL || DEFAULT_LAUNCH_URL);
    } else {
        app.quit();
    }
}

function buildMenu() {
    const template = [
        ...(process.platform === 'darwin'
            ? [
                  {
                      label: app.getName(),
                      submenu: [
                          { role: 'about' },
                          { type: 'separator' },
                          { role: 'services' },
                          { type: 'separator' },
                          { role: 'hide' },
                          { role: 'hideOthers' },
                          { role: 'unhide' },
                          { type: 'separator' },
                          { role: 'quit' },
                      ],
                  },
              ]
            : []),
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' },
            ],
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' },
            ],
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                ...(process.platform === 'darwin'
                    ? [{ type: 'separator' }, { role: 'front' }]
                    : [{ role: 'close' }]),
            ],
        },
        ...(DESKTOP_LOG_FILE
            ? [{
                  role: 'help',
                  submenu: [
                      { label: 'Show Log File', click: () => shell.showItemInFolder(DESKTOP_LOG_FILE) },
                  ],
              }]
            : []),
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Local previews run on http://localhost:<port>. The web app's CSP only
// allows https frames and fetches, which suits browsers but blocks the
// desktop canvas from showing or probing a local dev server. Widen it here,
// for the app origin only, so browser visitors keep the strict policy.
const LOCAL_PREVIEW_SOURCES = 'http://localhost:* http://127.0.0.1:*';
function allowLocalPreviewsInCsp(policy) {
    return policy.split(';').map((part) => {
        const directive = part.trim().split(/\s+/)[0];
        return directive === 'connect-src' || directive === 'frame-src'
            ? `${part.trimEnd()} ${LOCAL_PREVIEW_SOURCES}`
            : part;
    }).join(';');
}

app.whenReady().then(() => {
    app.setName(APP_NAME);
    buildMenu();

    const local = require('./weblab-local');
    const publishingStore = new ReleaseStore(path.join(app.getPath('userData'), 'publishing'), safeStorage);
    const publishing = new PublishingService({
        store: publishingStore,
        authorize: createPublishAuthorizer(APP_URL),
        requirePrivateRoot: local.requirePrivateWorkingRoot,
        snapshot: local.createPrivateReleaseSnapshot,
        validateSnapshot: local.validatePrivateReleaseSnapshot,
    });
    registerPublishingIpc({ ipcMain, service: publishing,
        // Builds without the private website engine keep content preparation off.
        content: hasSiteEngine()
            ? new (require('./release/sanity-content').SanityContentCoordinator)({ appUrl: APP_URL, store: publishingStore, local })
            : null,
        allowedOrigins: ALLOWED_IPC_ORIGINS,
        getWebContents: () => mainWindow?.webContents ?? null,
        plan: async (root) => {
            const result = await local.planPrivateRelease(root);
            const { sourceRootPath: _privateSource, ...review } = result;
            return review;
        },
    });

    // Same partition as the BrowserWindow below.
    session.fromPartition(SESSION_PARTITION).webRequest.onHeadersReceived((details, callback) => {
        let origin = null;
        try { origin = new URL(details.url).origin; } catch { /* ignore */ }
        if (origin !== APP_ORIGIN || details.resourceType !== 'mainFrame') {
            return callback({ responseHeaders: details.responseHeaders });
        }
        const responseHeaders = { ...details.responseHeaders };
        for (const key of Object.keys(responseHeaders)) {
            if (key.toLowerCase() !== 'content-security-policy') continue;
            responseHeaders[key] = responseHeaders[key].map(allowLocalPreviewsInCsp);
        }
        callback({ responseHeaders });
    });

    // Pick up a deep link that launched the app on Windows/Linux.
    readyForWindows = true;
    const launchUrl = pendingDeepLink ?? process.argv.find((a) => a.startsWith(`${PROTOCOL}://`));
    pendingDeepLink = null;
    const handled = launchUrl ? handleDeepLink(launchUrl) : false;
    if (!handled && !mainWindow) createWindow();

    if (DESKTOP_PROFILE.updates) autoUpdater.checkForUpdatesAndNotify();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        } else if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
