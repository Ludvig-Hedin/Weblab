const { contextBridge, ipcRenderer } = require('electron');

const APP_ORIGIN_AT_PRELOAD = (() => {
    try {
        return location.origin;
    } catch {
        return null;
    }
})();
const EXPECTED_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL && new URL(process.env.NEXT_PUBLIC_SITE_URL).origin)
    || `https://${process.env.NEXT_PUBLIC_APP_DOMAIN || 'weblab.build'}`;

// CLI bridge is only attached when this preload runs against the canonical
// app origin. Defense in depth — a senderFrame check still runs in main.js
// for every call, since location can be lied about post-load.
const cliBridge = APP_ORIGIN_AT_PRELOAD === EXPECTED_ORIGIN
    ? {
          providerStatus: () => ipcRenderer.invoke('weblab-cli:provider-status'),
          startStream: (req) => ipcRenderer.invoke('weblab-cli:start', req),
          abort: (streamId) => ipcRenderer.send('weblab-cli:abort', { streamId }),
          onEvent: (listener) => {
              const handler = (_event, payload) => listener(payload);
              ipcRenderer.on('weblab-cli:event', handler);
              return () => ipcRenderer.removeListener('weblab-cli:event', handler);
          },
          ollamaPullModel: (model) => ipcRenderer.invoke('weblab-cli:ollama-pull', { model }),
          ollamaQuit: () => ipcRenderer.invoke('weblab-cli:ollama-quit'),
      }
    : undefined;

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
    cli: cliBridge,
};

contextBridge.exposeInMainWorld('weblabNative', bridge);
contextBridge.exposeInMainWorld('weblabDesktop', bridge);
