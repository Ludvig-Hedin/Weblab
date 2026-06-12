const { app, BrowserWindow, shell, Menu, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { registerIpcHandlers: registerCliIpc } = require('./weblab-cli');
const { registerLocalIpc, disposeLocal } = require('./weblab-local');
const { isOAuthHost } = require('./auth-hosts');

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Weblab';
const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || 'weblab.build';
const APP_URL = process.env.NEXT_PUBLIC_SITE_URL || `https://${APP_DOMAIN}`;
const APP_ORIGIN = new URL(APP_URL).origin;

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

// Origins the IPC layer accepts requests from. Mirrors the preload's allow-list
// so dev (localhost:3000) and production (the configured site URL) both work.
// The CLI bridge handlers re-check senderFrame.url against this set on every
// call — preload's check alone isn't enough because the renderer can navigate.
// CR-109: localhost entries are gated to non-production so release builds don't
// accept IPC from http://localhost.
const ALLOWED_IPC_ORIGINS = new Set([
    APP_ORIGIN,
    `https://${APP_DOMAIN}`,
    ...(!app.isPackaged
        ? ['http://localhost:3000', 'http://127.0.0.1:3000']
        : []),
]);

// Custom URL scheme used for OAuth deep-link callbacks: weblab://auth/callback?code=...
const PROTOCOL = 'weblab';

// Which hosts get bounced to the real browser vs. allowed in-window lives in
// ./auth-hosts.js (unit-tested). Summary: third-party OAuth provider sign-in
// pages + Clerk's hosted account portal are bounced; Clerk's own FAPI/handshake
// hosts stay in-window so the dev-mode handshake can complete.

const WINDOW_WIDTH = 1400;
const WINDOW_HEIGHT = 900;

let mainWindow;

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
function openInExternalBrowser(url) {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    } catch {
        return false;
    }
    // `shell.openExternal` resolves true on macOS / Windows when the URL was
    // handed off to the OS, even before the browser actually paints — that's
    // the right signal: the desktop's job is done once the URL is dispatched.
    shell.openExternal(url).catch(() => {
        // Errors from `openExternal` mean no default handler is registered or
        // the OS refused to launch it. Non-fatal here — the renderer already
        // shows a "Continue in browser" UI; the user can retry.
    });
    return true;
}

// Renderer-side bridge: `window.weblabNative.openExternal(url)` →
// `weblab:open-external`. The legacy `weblab:open-oauth` channel is aliased
// to the same handler in `preload.js` so any in-flight code that still
// references it keeps working.
//
// TODO(bug-hunt): defense-in-depth — validate `event.senderFrame.url` against
// ALLOWED_IPC_ORIGINS before opening. A renderer that has navigated off-origin
// (XSS escape, escaped iframe) can otherwise drive the user's default browser
// to any https:// URL via `weblabNative.openExternal('https://phish.example')`.
// See CODE_REVIEW_BACKLOG.md → "Bug Hunt 2026-05-28 — Desktop auth".
ipcMain.handle('weblab:open-external', async (_event, url) => {
    if (typeof url !== 'string') return false;
    return openInExternalBrowser(url);
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

// Tear down any spawned local dev servers + file watchers on shutdown.
app.on('before-quit', () => {
    try {
        disposeLocal();
    } catch {
        // best-effort cleanup
    }
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
    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch {
        return;
    }
    if (parsed.protocol !== `${PROTOCOL}:`) return;

    // weblab://<host>/<path?> — the "host" is actually the first path segment
    // because there's no real host in a custom-protocol URL.
    const pathname = `/${parsed.host}${parsed.pathname}`.replace(/\/+/g, '/');

    // New: browser handoff with a Clerk sign-in ticket.
    if (pathname === '/auth/handoff') {
        const ticket = parsed.searchParams.get('ticket');
        // Drop malformed deep-link launches outright — we never want the
        // desktop to navigate to a redeem URL with an empty / non-string
        // ticket (Clerk would surface a noisy error in the renderer).
        if (!ticket || typeof ticket !== 'string') return;
        // TODO(bug-hunt): CSRF gap — any process that can launch a `weblab://`
        // URL can deliver a ticket here and sign the user into the attacker's
        // Clerk account. Mitigation requires a per-launch nonce: persist a
        // random value when openExternal first fires, require the handoff
        // deep link to echo the same nonce, reject otherwise. See
        // CODE_REVIEW_BACKLOG.md → "Bug Hunt 2026-05-28 — Desktop auth".
        const target = new URL('/sign-in/redeem', APP_URL);
        target.searchParams.set('ticket', ticket);
        target.searchParams.set('native', '1');
        if (!mainWindow) {
            createWindow(target.toString());
        } else {
            mainWindow.loadURL(target.toString());
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
        return;
    }

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
            partition: 'persist:weblab',
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
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        try {
            const parsed = new URL(url);
            if (parsed.origin === APP_ORIGIN) {
                return { action: 'allow' };
            }
            if (isOAuthHost(parsed.hostname)) {
                openInExternalBrowser(url);
                return { action: 'deny' };
            }
        } catch {
            // Invalid URL — fall through to deny.
        }
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.webContents.on('will-navigate', (event, url) => {
        try {
            const parsed = new URL(url);
            if (isOAuthHost(parsed.hostname)) {
                event.preventDefault();
                openInExternalBrowser(url);
            }
        } catch {
            // ignore
        }
    });

    // HTTP redirects (e.g. a 302 from the in-app callback into an OAuth
    // provider) do NOT fire `will-navigate` — Electron fires `will-redirect`
    // instead. Without this listener a provider reached via a redirect would
    // render inside the BrowserWindow and the provider would reject it.
    mainWindow.webContents.on('will-redirect', (event, url) => {
        try {
            const parsed = new URL(url);
            if (isOAuthHost(parsed.hostname)) {
                event.preventDefault();
                openInExternalBrowser(url);
            }
        } catch {
            // ignore
        }
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
                // the click as window-drag. Matches the web app's layout.tsx.
                `[data-desktop="true"]` +
                    ` :is(a,button,[role="button"],[role="menuitem"],[role="tab"],[role="switch"],[role="link"],[role="combobox"],input,select,textarea,[contenteditable="true"],[contenteditable=""]),` +
                `[data-desktop="true"] .desktop-no-drag{-webkit-app-region:no-drag;}`,
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
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
    app.setName(APP_NAME);
    buildMenu();

    // Pick up a deep link that launched the app on Windows/Linux.
    const launchUrl = process.argv.find((a) => a.startsWith(`${PROTOCOL}://`));
    if (launchUrl) {
        handleDeepLink(launchUrl);
    } else {
        createWindow();
    }

    autoUpdater.checkForUpdatesAndNotify();

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
