const { app, BrowserWindow, shell, Menu, ipcMain, session } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { registerIpcHandlers: registerCliIpc } = require('./weblab-cli');

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Weblab';
const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || 'weblab.build';
const APP_URL = process.env.NEXT_PUBLIC_SITE_URL || `https://${APP_DOMAIN}`;
const APP_ORIGIN = new URL(APP_URL).origin;

// Boot the desktop shell straight into the auth flow instead of the marketing
// landing. /login server-redirects already-signed-in users to /projects, so a
// single load handles both cases. `?native=1` mirrors the flag main.js already
// stamps on deep-link callbacks (see handleDeepLink) so the web side can show
// desktop-specific UI without UA sniffing.
const DEFAULT_LAUNCH_URL = (() => {
    const u = new URL('/login', APP_URL);
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

// OAuth provider hosts that block embedded webviews — we route these through
// the user's default browser instead of the BrowserWindow.
const BLOCKED_OAUTH_HOSTS = new Set([
    'accounts.google.com',
    'appleid.apple.com',
]);

const WINDOW_WIDTH = 1400;
const WINDOW_HEIGHT = 900;

let mainWindow;

ipcMain.on('weblab:get-version', (event) => {
    event.returnValue = app.getVersion();
});

// Renderer can ask the main process to open an OAuth URL in the system browser.
ipcMain.handle('weblab:open-oauth', async (_event, url) => {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
        await shell.openExternal(url);
        return true;
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
    // tries to navigate to a known-blocked OAuth provider, route through
    // the system browser so OAuth actually completes.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        try {
            const parsed = new URL(url);
            if (parsed.origin === APP_ORIGIN) {
                return { action: 'allow' };
            }
            if (BLOCKED_OAUTH_HOSTS.has(parsed.host)) {
                shell.openExternal(url);
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
            if (BLOCKED_OAUTH_HOSTS.has(parsed.host)) {
                event.preventDefault();
                shell.openExternal(url);
            }
        } catch {
            // ignore
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
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
