const { contextBridge, ipcRenderer, webUtils } = require('electron');

// A sandboxed preload cannot require local helpers. Main passes one mandatory
// resolved bootstrap; no runtime env or missing-hint fallback grants access.
function buildAllowedOrigins() {
    const out = new Set();
    try {
        const prefix = '--weblab-desktop-bootstrap=';
        const hints = process.argv.filter(arg => arg.startsWith('--weblab-desktop-bootstrap'));
        if (hints.length !== 1 || !hints[0].startsWith(prefix) || hints[0].length > 4096) return out;
        const value = JSON.parse(decodeURIComponent(hints[0].slice(prefix.length)));
        if (!value || typeof value !== 'object' || Array.isArray(value) ||
            Object.keys(value).sort().join(',') !== 'channel,siteUrl,version' || value.version !== 1 ||
            !['stable', 'development', 'beta'].includes(value.channel) || typeof value.siteUrl !== 'string') return out;
        const url = new URL(value.siteUrl);
        if (url.origin !== value.siteUrl || url.username || url.password) return out;
        const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
        if (url.protocol !== 'https:' && !(value.channel === 'development' && local && url.protocol === 'http:')) return out;
        if (value.channel === 'beta' && (url.port ||
            !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$/.test(url.hostname) ||
            url.hostname === 'weblab.build' || url.hostname.endsWith('.weblab.build') ||
            url.hostname.endsWith('.localhost') || url.hostname.endsWith('.local'))) return out;
        out.add(url.origin);
    } catch { /* Invalid bootstrap exposes no privileged bridge. */ }
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
          createPrivateWorkingCopy: (sourceRoot) =>
              ipcRenderer.invoke('weblab:localfs:createPrivateWorkingCopy', { sourceRoot }),
          planPrivateHandoff: (root) =>
              ipcRenderer.invoke('weblab:localfs:planPrivateHandoff', { root }),
          exportPrivateHandoff: (root, planToken, files) =>
              ipcRenderer.invoke('weblab:localfs:exportPrivateHandoff', { root, planToken, files }),
          read: (root, p) => ipcRenderer.invoke('weblab:localfs:read', { root, path: p }),
          writeIfUnchanged: (root, p, content, expectedSha256) =>
              ipcRenderer.invoke('weblab:localfs:writeIfUnchanged', {
                  root, path: p, content, expectedSha256,
              }),
          deleteFileIfUnchanged: (root, p, expectedSha256) =>
              ipcRenderer.invoke('weblab:localfs:deleteFileIfUnchanged', {
                  root, path: p, expectedSha256,
              }),
          createPreparationPublicDirectory: (root) =>
              ipcRenderer.invoke('weblab:localfs:createPreparationPublicDirectory', { root }),
          deletePreparationPublicDirectory: (root) =>
              ipcRenderer.invoke('weblab:localfs:deletePreparationPublicDirectory', { root }),
          list: (root, p) => ipcRenderer.invoke('weblab:localfs:list', { root, path: p }),
          stat: (root, p) => ipcRenderer.invoke('weblab:localfs:stat', { root, path: p }),
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
          installDependencies: (root) =>
              ipcRenderer.invoke('weblab:localdev:installDependencies', { root }),
          dependenciesReady: (root) =>
              ipcRenderer.invoke('weblab:localdev:dependenciesReady', { root }),
          cancelInstallDependencies: (root) =>
              ipcRenderer.invoke('weblab:localdev:cancelInstallDependencies', { root }),
          start: (root, command, port) =>
              ipcRenderer.invoke('weblab:localdev:start', { root, command, port }),
          pickPort: (root, preferredPort) =>
              ipcRenderer.invoke('weblab:localdev:pickPort', { root, preferredPort }),
          previewEnvNames: (root) =>
              ipcRenderer.invoke('weblab:localdev:previewEnvNames', { root }),
          previewEnvUpdate: (root, set, remove) =>
              ipcRenderer.invoke('weblab:localdev:previewEnvUpdate', { root, set, remove }),
          stop: (root) => ipcRenderer.invoke('weblab:localdev:stop', { root }),
          status: (root) => ipcRenderer.invoke('weblab:localdev:status', { root }),
          gitInfo: (root) => ipcRenderer.invoke('weblab:localdev:gitInfo', { root }),
          gitStatus: (root) => ipcRenderer.invoke('weblab:localdev:gitStatus', { root }),
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
    version: IS_APP_ORIGIN ? ipcRenderer.sendSync('weblab:get-version') : undefined,
    /**
     * Open a URL in the user's default OS browser. Used by the renderer to
     * hand off OAuth flows to a real browser (provider WebViews — like
     * Google's accounts.google.com — actively block embedded Chromium and
     * require sign-in through the system browser). The OAuth flow completes
     * in the browser, then redirects back into the desktop shell via the
     * `weblab://auth/handoff?ticket=...` deep link (see main.js).
     */
    openExternal: IS_APP_ORIGIN
        ? (url) => ipcRenderer.invoke('weblab:open-external', url) : undefined,
    claimLoginHandoff: IS_APP_ORIGIN
        ? (ticket, state) => ipcRenderer.invoke('weblab:claim-login-handoff', { ticket, state })
        : undefined,
    /**
     * Legacy alias kept so any in-flight renderer code that still calls
     * `weblabNative.openOAuth(url)` keeps working — the main-process handler
     * now also routes through `shell.openExternal`, so the behavior matches.
     */
    openOAuth: IS_APP_ORIGIN
        ? (url) => ipcRenderer.invoke('weblab:open-external', url) : undefined,
    publishing: IS_APP_ORIGIN ? {
        request: (method, input) => ipcRenderer.invoke('weblab:publishing', { method, input }),
        cancel: () => ipcRenderer.invoke('weblab:publishing-cancel'),
    } : undefined,
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
        ? async (file) => {
              try {
                  const nativePath = webUtils.getPathForFile(file);
                  if (!nativePath) return null;
                  return await ipcRenderer.invoke('weblab:localfs:grantDroppedFolder', nativePath);
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
