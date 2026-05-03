const { contextBridge, ipcRenderer } = require('electron');

// Expose two surfaces to the renderer:
//   - `weblabNative` — a tiny detection object the web app can read to know
//     it's running inside the desktop wrapper. Mirrors the iOS injection.
//   - `weblabDesktop` — kept for backwards compatibility with existing checks.
const bridge = {
    platform: process.platform,
    target: 'desktop',
    version: ipcRenderer.sendSync('weblab:get-version'),
    /**
     * Open an OAuth URL in the user's default browser. Returns true if the
     * URL was handed off successfully. After the user signs in the OS will
     * dispatch the resulting `weblab://auth/callback?code=…` deep link back
     * to the app, which then loads the canonical https URL inside this
     * BrowserWindow so the existing `/auth/callback` handler can finish the
     * exchange in this cookie jar.
     */
    openOAuth: (url) => ipcRenderer.invoke('weblab:open-oauth', url),
};

contextBridge.exposeInMainWorld('weblabNative', bridge);
contextBridge.exposeInMainWorld('weblabDesktop', bridge);
