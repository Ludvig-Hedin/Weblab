const { app, BrowserWindow, shell, Menu, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { registerIpcHandlers: registerCliIpc } = require('./weblab-cli');

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

// OAuth provider hosts that should leave the main app window. They are opened
// in a small first-party auth BrowserWindow that shares the app's persistent
// cookie partition, then the final Weblab callback is handed back to the main
// window.
const BLOCKED_OAUTH_HOSTS = new Set([
    'accounts.google.com',
    'appleid.apple.com',
    'github.com',
    'vercel.com',
    'clerk.weblab.build',
    'accounts.weblab.build',
]);

const WINDOW_WIDTH = 1400;
const WINDOW_HEIGHT = 900;

let mainWindow;
let authWindow;

ipcMain.on('weblab:get-version', (event) => {
    event.returnValue = app.getVersion();
});

function isOAuthHost(hostname) {
    for (const host of BLOCKED_OAUTH_HOSTS) {
        if (hostname === host || hostname.endsWith(`.${host}`)) return true;
    }
    return hostname.endsWith('.clerk.accounts.dev');
}

function isAppUrl(url) {
    try {
        return new URL(url).origin === APP_ORIGIN;
    } catch {
        return false;
    }
}

function completeAuthInMainWindow(url) {
    if (!mainWindow || mainWindow.isDestroyed()) {
        createWindow(url);
        return;
    }
    mainWindow.loadURL(url);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
}

function openAuthWindow(url) {
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        return false;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

    if (authWindow && !authWindow.isDestroyed()) {
        authWindow.loadURL(url);
        authWindow.focus();
        return true;
    }

    authWindow = new BrowserWindow({
        width: 520,
        height: 720,
        minWidth: 420,
        minHeight: 560,
        title: `${APP_NAME} Sign In`,
        parent: mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
        modal: false,
        backgroundColor: '#ffffff',
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            partition: 'persist:weblab',
        },
        show: false,
    });

    authWindow.once('ready-to-show', () => {
        if (authWindow && !authWindow.isDestroyed()) authWindow.show();
    });

    authWindow.on('closed', () => {
        authWindow = null;
    });

    const finishIfAppUrl = (event, nextUrl) => {
        if (!isAppUrl(nextUrl)) return false;
        event.preventDefault();
        completeAuthInMainWindow(nextUrl);
        if (authWindow && !authWindow.isDestroyed()) authWindow.close();
        return true;
    };

    authWindow.webContents.setWindowOpenHandler(({ url: nextUrl }) => {
        if (isAppUrl(nextUrl)) {
            completeAuthInMainWindow(nextUrl);
            if (authWindow && !authWindow.isDestroyed()) authWindow.close();
            return { action: 'deny' };
        }
        try {
            const parsedNext = new URL(nextUrl);
            if (parsedNext.protocol === 'http:' || parsedNext.protocol === 'https:') {
                authWindow.loadURL(nextUrl);
            } else {
                shell.openExternal(nextUrl);
            }
        } catch {
            // Invalid target — keep it out of the auth window.
        }
        return { action: 'deny' };
    });

    authWindow.webContents.on('will-navigate', (event, nextUrl) => {
        finishIfAppUrl(event, nextUrl);
    });

    authWindow.webContents.on('will-redirect', (event, nextUrl) => {
        finishIfAppUrl(event, nextUrl);
    });

    authWindow.loadURL(url);
    return true;
}

// Renderer can ask the main process to open an OAuth URL in the native auth window.
ipcMain.handle('weblab:open-oauth', async (_event, url) => {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
        return openAuthWindow(url);
    } catch {
        return false;
    }
});

registerCliIpc({
    allowedOrigins: ALLOWED_IPC_ORIGINS,
    getWebContents: () => mainWindow?.webContents ?? null,
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
 * Convert `weblab://auth/callback?code=...` into
 * `https://weblab.build/auth/callback?code=...&native=1` and load it inside
 * the BrowserWindow. The existing server-side `/auth/callback` handler then
 * exchanges the code for a session — using the PKCE code_verifier cookie that
 * is already in this WebContents' cookie jar — and sets the session cookies
 * here, where they persist.
 */
function handleDeepLink(rawUrl) {
    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch {
        return;
    }
    if (parsed.protocol !== `${PROTOCOL}:`) return;

    // weblab://auth/callback → /auth/callback
    // For weblab:// URLs, the "host" is actually the first path segment.
    const pathname = `/${parsed.host}${parsed.pathname}`.replace(/\/+/g, '/');
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

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Open external links in the system browser. Also: if the WebContents
    // tries to navigate to a known OAuth provider, route through the native
    // auth window so sign-in doesn't involve the user's default browser.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        try {
            const parsed = new URL(url);
            if (parsed.origin === APP_ORIGIN) {
                return { action: 'allow' };
            }
            if (isOAuthHost(parsed.hostname)) {
                openAuthWindow(url);
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
                openAuthWindow(url);
            }
        } catch {
            // ignore
        }
    });

    // HTTP redirects (e.g. Supabase's /auth/v1/authorize → accounts.google.com)
    // do NOT fire `will-navigate` — Electron fires `will-redirect` instead.
    // Without this listener a provider reached via a 302 in the redirect chain
    // would render inside the BrowserWindow, splitting the OAuth flow across
    // two cookie jars and breaking PKCE.
    mainWindow.webContents.on('will-redirect', (event, url) => {
        try {
            const parsed = new URL(url);
            if (isOAuthHost(parsed.hostname)) {
                event.preventDefault();
                openAuthWindow(url);
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
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
