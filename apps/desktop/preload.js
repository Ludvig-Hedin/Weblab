const { contextBridge, ipcRenderer, webUtils } = require('electron');

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
    // Use URL parsing to guard against malformed domains (e.g. ports, paths in
    // the env var) that would produce a non-origin string (CR-108).
    const domain = process.env.NEXT_PUBLIC_APP_DOMAIN || 'weblab.build';
    try {
        out.add(new URL(`https://${domain}`).origin);
    } catch {
        out.add('https://weblab.build');
    }
    // Dev convenience: standard Next.js dev ports (non-production only).
    if (process.env.NODE_ENV !== 'production') {
        out.add('http://localhost:3000');
        out.add('http://127.0.0.1:3000');
    }
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

// Local-first filesystem + dev-server bridge. Same origin gate as the CLI
// bridge — only attached when the window is on one of our origins. Backs the
// renderer-side NodeFsProvider in @weblab/code-provider.
const IS_APP_ORIGIN = !!(APP_ORIGIN_AT_PRELOAD && ALLOWED_ORIGINS.has(APP_ORIGIN_AT_PRELOAD));

const localfsBridge = IS_APP_ORIGIN
    ? {
          pickFolder: () => ipcRenderer.invoke('weblab:localfs:pickFolder'),
          read: (root, p) => ipcRenderer.invoke('weblab:localfs:read', { root, path: p }),
          write: (root, p, content) =>
              ipcRenderer.invoke('weblab:localfs:write', { root, path: p, content }),
          list: (root, p) => ipcRenderer.invoke('weblab:localfs:list', { root, path: p }),
          stat: (root, p) => ipcRenderer.invoke('weblab:localfs:stat', { root, path: p }),
          mkdir: (root, p) => ipcRenderer.invoke('weblab:localfs:mkdir', { root, path: p }),
          remove: (root, p, recursive) =>
              ipcRenderer.invoke('weblab:localfs:remove', { root, path: p, recursive }),
          rename: (root, oldPath, newPath) =>
              ipcRenderer.invoke('weblab:localfs:rename', { root, oldPath, newPath }),
          copy: (root, sourcePath, targetPath, recursive) =>
              ipcRenderer.invoke('weblab:localfs:copy', { root, sourcePath, targetPath, recursive }),
          watchStart: (root, excludes) =>
              ipcRenderer.invoke('weblab:localfs:watchStart', { root, excludes }),
          watchStop: (watchId) => ipcRenderer.invoke('weblab:localfs:watchStop', { watchId }),
          onWatchEvent: (listener) => {
              const handler = (_event, payload) => listener(payload);
              ipcRenderer.on('weblab:localfs:watch-event', handler);
              return () => ipcRenderer.removeListener('weblab:localfs:watch-event', handler);
          },
      }
    : undefined;

const localdevBridge = IS_APP_ORIGIN
    ? {
          start: (root, command, port) =>
              ipcRenderer.invoke('weblab:localdev:start', { root, command, port }),
          pickPort: (preferredPort) =>
              ipcRenderer.invoke('weblab:localdev:pickPort', { preferredPort }),
          stop: (root) => ipcRenderer.invoke('weblab:localdev:stop', { root }),
          status: (root) => ipcRenderer.invoke('weblab:localdev:status', { root }),
          run: (root, command) => ipcRenderer.invoke('weblab:localdev:run', { root, command }),
          onOutput: (listener) => {
              const handler = (_event, payload) => listener(payload);
              ipcRenderer.on('weblab:localdev:output', handler);
              return () => ipcRenderer.removeListener('weblab:localdev:output', handler);
          },
      }
    : undefined;

const bridge = {
    platform: process.platform,
    target: 'desktop',
    version: ipcRenderer.sendSync('weblab:get-version'),
    /**
     * Open a URL in the user's default OS browser. Used by the renderer to
     * hand off OAuth flows to a real browser (provider WebViews — like
     * Google's accounts.google.com — actively block embedded Chromium and
     * require sign-in through the system browser). The OAuth flow completes
     * in the browser, then redirects back into the desktop shell via the
     * `weblab://auth/handoff?ticket=...` deep link (see main.js).
     */
    openExternal: (url) => ipcRenderer.invoke('weblab:open-external', url),
    /**
     * Legacy alias kept so any in-flight renderer code that still calls
     * `weblabNative.openOAuth(url)` keeps working — the main-process handler
     * now also routes through `shell.openExternal`, so the behavior matches.
     */
    openOAuth: (url) => ipcRenderer.invoke('weblab:open-external', url),
    cli: cliBridge,
    localfs: localfsBridge,
    localdev: localdevBridge,
    /**
     * Resolve the absolute filesystem path of a `File` dropped into the window.
     * `File.path` was removed in Electron 32+, so the renderer cannot read it
     * directly — it must hand the `File` back here to `webUtils.getPathForFile`.
     * Origin-gated like the other native bridges.
     */
    getPathForDroppedFile: IS_APP_ORIGIN
        ? (file) => {
              try {
                  return webUtils.getPathForFile(file);
              } catch {
                  return null;
              }
          }
        : undefined,
    /**
     * Subscribe to "open this folder" requests from the main process — fired
     * when a folder is dropped on the dock icon / opened via "Open With Weblab"
     * (macOS `open-file`). Returns an unsubscribe function.
     */
    onOpenFolder: IS_APP_ORIGIN
        ? (listener) => {
              const handler = (_event, payload) => listener(payload);
              ipcRenderer.on('weblab:open-folder', handler);
              return () => ipcRenderer.removeListener('weblab:open-folder', handler);
          }
        : undefined,
    /**
     * Tell the main process the renderer has mounted its folder-drop listener,
     * so any folder queued from a cold launch-by-drop can be delivered now.
     */
    signalReady: IS_APP_ORIGIN ? () => ipcRenderer.send('weblab:renderer-ready') : undefined,
};

contextBridge.exposeInMainWorld('weblabNative', bridge);
contextBridge.exposeInMainWorld('weblabDesktop', bridge);
