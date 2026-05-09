const { contextBridge, ipcRenderer } = require('electron');

/**
 * Build the set of origins this preload considers "us". The CLI bridge is
 * attached only when the BrowserWindow is currently on one of these origins.
 *
 * This is defense in depth — the main process re-checks `event.senderFrame.url`
 * against the same list on every IPC call. The preload-time gate exists so a
 * compromised renderer that navigates away from us can't simply call our IPC
 * methods on `window.weblabNative.cli`.
 *
 * Origins included:
 *   - The hosted production origin (NEXT_PUBLIC_SITE_URL or the app domain)
 *   - localhost on common dev ports — without this, running the desktop app
 *     against `bun dev` (NEXT_PUBLIC_SITE_URL=http://localhost:3000) would
 *     fail the origin check and the picker would render every CLI provider
 *     as "Desktop only" even though we ARE in the desktop app.
 */
function buildAllowedOrigins() {
    const out = new Set();
    try {
        if (process.env.NEXT_PUBLIC_SITE_URL) {
            out.add(new URL(process.env.NEXT_PUBLIC_SITE_URL).origin);
        }
    } catch {
        // ignore malformed env value
    }
    out.add(`https://${process.env.NEXT_PUBLIC_APP_DOMAIN || 'weblab.build'}`);
    // Dev convenience: standard Next.js dev ports.
    out.add('http://localhost:3000');
    out.add('http://127.0.0.1:3000');
    return out;
}

const ALLOWED_ORIGINS = buildAllowedOrigins();

const APP_ORIGIN_AT_PRELOAD = (() => {
    try {
        return location.origin;
    } catch {
        return null;
    }
})();

const cliBridge = APP_ORIGIN_AT_PRELOAD && ALLOWED_ORIGINS.has(APP_ORIGIN_AT_PRELOAD)
    ? {
          providerStatus: () => ipcRenderer.invoke('weblab-cli:provider-status'),
          startStream: (req) => ipcRenderer.invoke('weblab-cli:start', req),
          abort: (streamId) => ipcRenderer.send('weblab-cli:abort', { streamId }),
          onEvent: (listener) => {
              const handler = (_event, payload) => listener(payload);
              ipcRenderer.on('weblab-cli:event', handler);
              return () => ipcRenderer.removeListener('weblab-cli:event', handler);
          },
          ollamaPullModel: (model, pullId) =>
              ipcRenderer.invoke('weblab-cli:ollama-pull', { model, pullId }),
          onOllamaPullProgress: (listener) => {
              const handler = (_event, payload) => listener(payload);
              ipcRenderer.on('weblab-cli:ollama-pull-progress', handler);
              return () =>
                  ipcRenderer.removeListener('weblab-cli:ollama-pull-progress', handler);
          },
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
