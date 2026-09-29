// biome-ignore-all lint/correctness/noGlobalDirnameFilename: Electron loads this file as CommonJS, where import.meta does not exist.
const {
  app,
  BrowserWindow,
  clipboard,
  WebContentsView,
  ipcMain,
  dialog,
  shell,
  Menu,
  nativeImage,
} = require("electron");
const { join } = require("node:path");
const sites = require("./sites");
const auth = require("./auth");
const { SiteRunner } = require("./runner");
const cloner = require("./clone");
const envSettings = require("./env-settings");
const github = require("./github");
const publish = require("./publish-ipc");
const previews = require("./previews");
const favicon = require("./favicon");
const updates = require("./updates");

const TOP_BAR = 40;
const WEB_LINK = /^https?:/;
const BG = "#1E1E1E";

app.setName("Weblab");
// Lets a test run keep its own site list.
if (process.env.WEBLAB_USER_DATA) {
  app.setPath("userData", process.env.WEBLAB_USER_DATA);
}

const windows = new Map();
const pendingFiles = [];
const pendingStops = new Set();
let quitting = false;
let availableUpdate = null;
let updateCheck = null;

// Finder sends this before ready when a folder starts the app from the Dock.
app.on("open-file", (event, path) => {
  event.preventDefault();
  pendingFiles.push(path);
  if (app.isReady()) {
    flushFiles();
  }
});

function send(session, channel, payload) {
  if (session?.win && !session.win.isDestroyed()) {
    session.win.webContents.send(channel, payload);
  }
}

function broadcast(channel, payload) {
  for (const session of windows.values()) {
    send(session, channel, payload);
  }
}

function showUpdateDialog(options) {
  const window = focusedSession()?.win;
  return window
    ? dialog.showMessageBox(window, options)
    : dialog.showMessageBox(options);
}

async function downloadUpdate() {
  if (!availableUpdate) {
    return;
  }
  try {
    await shell.openExternal(availableUpdate.downloadUrl);
  } catch {
    await showUpdateDialog({
      buttons: ["OK"],
      message: "Couldn’t open the update download.",
      type: "error",
    });
  }
}

async function checkForUpdates(manual = false) {
  updateCheck ||= updates
    .findUpdate(app.getVersion())
    .then((result) => {
      availableUpdate = result;
      broadcast("updates:available", result?.version || null);
      return result;
    })
    .finally(() => {
      updateCheck = null;
    });
  try {
    const result = await updateCheck;
    if (!manual) {
      return;
    }
    if (!result) {
      await showUpdateDialog({
        buttons: ["OK"],
        message: `Weblab ${app.getVersion()} is up to date.`,
        type: "info",
      });
      return;
    }
    const { response } = await showUpdateDialog({
      buttons: ["Later", "Download"],
      defaultId: 1,
      detail: "Download the new Mac app and move it to Applications to update.",
      message: `Weblab ${result.version} is available.`,
      type: "info",
    });
    if (response === 1) {
      await downloadUpdate();
    }
  } catch {
    if (manual) {
      await showUpdateDialog({
        buttons: ["OK"],
        message: "Couldn’t check for updates. Try again later.",
        type: "warning",
      });
    }
  }
}

function sessionFor(event) {
  for (const session of windows.values()) {
    if (
      event.sender === session.win.webContents ||
      event.sender === session.editorView?.webContents
    ) {
      return session;
    }
  }
  return null;
}

function focusedSession() {
  return (
    windows.get(BrowserWindow.getFocusedWindow()) ||
    windows.values().next().value
  );
}

function onRunnerEvent(session, event) {
  if (session.closing || session.closePromise) {
    return;
  }
  if (event.type === "ready") {
    session.openSiteUrl = event.siteUrl || null;
    refreshPreview(session.openSiteId, session.openSiteUrl);
    showEditor(session, event.url, () => send(session, "site:event", event));
    return;
  }
  if (event.type === "error") {
    hideEditor(session);
  }
  send(session, "site:event", event);
}

function layoutEditor(session) {
  if (!(session.win && session.editorView)) {
    return;
  }
  const [width, height] = session.win.getContentSize();
  session.editorView.setBounds({
    height: Math.max(0, height - TOP_BAR),
    width,
    x: 0,
    y: TOP_BAR,
  });
}

function showEditor(session, url, onShown) {
  hideEditor(session);
  publishIpc?.reset(session);
  session.editorView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, "editor-preload.js"),
      sandbox: true,
    },
  });
  session.editorView.setBackgroundColor(BG);
  const { origin } = new URL(url);
  session.editorView.webContents.setWindowOpenHandler(({ url: target }) => {
    if (WEB_LINK.test(target)) {
      shell.openExternal(target);
    }
    return { action: "deny" };
  });
  session.editorView.webContents.on("will-navigate", (event, target) => {
    if (new URL(target).origin !== origin) {
      event.preventDefault();
      if (WEB_LINK.test(target)) {
        shell.openExternal(target);
      }
    }
  });
  const view = session.editorView;
  // Attached (so the page gets its real size) but hidden until it has loaded.
  view.setVisible(false);
  session.win.contentView.addChildView(view);
  layoutEditor(session);
  let shown = false;
  const reveal = () => {
    if (shown || session.editorView !== view || session.win.isDestroyed()) {
      return;
    }
    shown = true;
    view.setVisible(true);
    onShown();
  };
  view.webContents.once("did-finish-load", reveal);
  view.webContents.once("did-fail-load", reveal);
  setTimeout(reveal, 15_000);
  view.webContents.loadURL(url);
}

function hideEditor(session) {
  if (!session.editorView) {
    return;
  }
  const view = session.editorView;
  session.editorView = null;
  if (!session.win.isDestroyed()) {
    session.win.contentView.removeChildView(view);
  }
  view.webContents.close();
}

/** Saves a fresh dashboard picture, then tells the dashboard. */
function refreshPreview(id, url, timeoutMs) {
  if (!(id && url)) {
    return Promise.resolve();
  }
  return previews.capture(id, url, timeoutMs).then((saved) => {
    if (saved) {
      broadcast("sites:changed");
    }
  });
}

function closeSite(session) {
  if (session.closePromise) {
    return session.closePromise;
  }
  session.closePromise = (async () => {
    hideEditor(session);
    const id = session.openSiteId;
    const url = session.openSiteUrl;
    try {
      // One last picture so the card shows the latest edits. Kept short,
      // since the user is waiting to see the dashboard.
      if (!quitting) {
        await refreshPreview(id, url, 3000);
      }
    } finally {
      await session.runner.stop();
      session.openSiteId = null;
      session.openSiteUrl = null;
    }
  })().finally(() => {
    session.closePromise = null;
  });
  return session.closePromise;
}

function createWindow(siteId = null) {
  const session = {
    closePromise: null,
    closing: false,
    editorView: null,
    openSiteId: null,
    openSiteUrl: null,
    pendingSiteId: siteId,
    ready: false,
    runner: null,
    win: null,
  };
  session.runner = new SiteRunner((event) => onRunnerEvent(session, event));
  const win = new BrowserWindow({
    backgroundColor: BG,
    height: 820,
    minHeight: 560,
    minWidth: 820,
    show: false,
    title: "Weblab",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 14, y: 13 },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, "preload.js"),
      sandbox: true,
    },
    width: 1280,
  });
  session.win = win;
  windows.set(win, session);
  win.loadFile(join(__dirname, "../renderer/index.html"));
  win.once("ready-to-show", () => win.show());
  win.on("resize", () => layoutEditor(session));
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());

  win.on("closed", () => {
    session.closing = true;
    publishIpc?.close(session);
    const stop = closeSite(session);
    pendingStops.add(stop);
    stop.finally(() => pendingStops.delete(stop));
    windows.delete(win);
  });
  return session;
}

function queueSite(session, site) {
  session.pendingSiteId = site.id;
  session.win.show();
  session.win.focus();
  if (session.ready) {
    send(session, "nav:site", site);
    session.pendingSiteId = null;
  }
}

function openInNewWindow(site) {
  const existing = [...windows.values()].find(
    (session) =>
      (!session.closePromise && session.openSiteId === site.id) ||
      session.pendingSiteId === site.id
  );
  if (existing) {
    existing.win.show();
    existing.win.focus();
    return;
  }
  createWindow(site.id);
}

function openFolderPath(path, source = null) {
  if (
    typeof path !== "string" ||
    !(sites.looksLikeSite(path) || sites.looksLikeHtml(path))
  ) {
    send(
      source || focusedSession(),
      "nav:siteError",
      "Choose a website folder or HTML file."
    );
    return { ok: false };
  }
  let site;
  try {
    site = sites.looksLikeHtml(path) ? sites.addHtml(path) : sites.add(path);
  } catch (error) {
    send(source || focusedSession(), "nav:siteError", error.message);
    return { ok: false };
  }
  const existing = [...windows.values()].find(
    (session) =>
      (!session.closePromise && session.openSiteId === site.id) ||
      session.pendingSiteId === site.id
  );
  if (existing) {
    existing.win.show();
    existing.win.focus();
  } else {
    const hasOpenSite = [...windows.values()].some(
      (session) => session.openSiteId || session.pendingSiteId
    );
    const target = hasOpenSite
      ? createWindow()
      : source || focusedSession() || createWindow();
    queueSite(target, site);
  }
  broadcast("sites:changed");
  return { ok: true };
}

function flushFiles() {
  while (pendingFiles.length) {
    openFolderPath(pendingFiles.shift());
  }
}

function buildMenu() {
  const template = [
    {
      label: "Weblab",
      submenu: [
        { label: "About Weblab", role: "about" },
        {
          click: () => {
            checkForUpdates(true);
          },
          label: "Check for Updates…",
        },
        { type: "separator" },
        {
          click: () => {
            github.signOut();
            buildMenu();
            broadcast("github:changed");
          },
          enabled: Boolean(github.account()),
          label: "Sign out of GitHub",
        },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { label: "Quit Weblab", role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        {
          accelerator: "CmdOrCtrl+N",
          click: () => send(focusedSession(), "nav:new"),
          label: "New website…",
        },
        {
          accelerator: "CmdOrCtrl+O",
          click: () => send(focusedSession(), "nav:open"),
          label: "Open file or folder…",
        },
        { type: "separator" },
        { role: "close" },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        {
          accelerator: "CmdOrCtrl+R",
          click: () => focusedSession()?.editorView?.webContents.reload(),
          label: "Reload editor",
        },
        { role: "togglefullscreen" },
        ...(app.isPackaged ? [] : [{ role: "toggleDevTools" }]),
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

let publishIpc = null;

function registerIpc() {
  ipcMain.handle("updates:status", () => availableUpdate?.version || null);
  ipcMain.handle("updates:download", (event) => {
    if (event.sender === sessionFor(event)?.win.webContents) {
      return downloadUpdate();
    }
  });
  publishIpc = publish.register({
    send,
    sessionFor,
  });
  ipcMain.handle("nav:ready", (event) => {
    const session = sessionFor(event);
    if (!session || event.sender !== session.win.webContents) {
      return;
    }
    session.ready = true;
    if (session.pendingSiteId) {
      const site = sites.get(session.pendingSiteId);
      session.pendingSiteId = null;
      if (site) {
        send(session, "nav:site", site);
      }
    }
  });
  ipcMain.handle("auth:state", () => auth.state());
  ipcMain.handle("auth:login", (event) => {
    const session = sessionFor(event);
    auth.startLogin((payload) => {
      if (payload.type === "done" && payload.ok) {
        broadcast("auth:event", payload);
      } else {
        send(session, "auth:event", payload);
      }
    });
  });
  ipcMain.handle("auth:code", (_e, code) => auth.submitCode(code));
  ipcMain.handle("auth:cancel", () => auth.cancelLogin());
  ipcMain.handle("auth:apiKey", (event, key) => {
    try {
      auth.saveApiKey(key);
      const source = sessionFor(event);
      for (const session of windows.values()) {
        if (session !== source) {
          send(session, "auth:event", { ok: true, type: "done" });
        }
      }
      return { ok: true };
    } catch (err) {
      return { message: err.message, ok: false };
    }
  });
  ipcMain.handle("auth:openLink", (_e, url) => {
    if (typeof url === "string" && url.startsWith("https://")) {
      shell.openExternal(url);
    }
  });

  ipcMain.handle("sites:list", () =>
    Promise.all(
      sites.list().map(async (site) => ({
        ...site,
        favicon: site.missing ? null : await favicon.read(site.path),
        preview: await previews.read(site.id),
      }))
    )
  );
  ipcMain.handle("sites:create", (_e, name) => {
    try {
      return { ok: true, site: sites.create(name) };
    } catch (err) {
      return { message: err.message, ok: false };
    }
  });
  ipcMain.handle("sites:pickFolder", async (event) => {
    const session = sessionFor(event);
    if (!session || event.sender !== session.win.webContents) {
      return { ok: false };
    }
    const result = await dialog.showOpenDialog(session.win, {
      buttonLabel: "Open",
      properties: ["openFile", "openDirectory"],
      title: "Open a website folder or HTML file",
    });
    if (result.canceled || !result.filePaths[0]) {
      return { ok: false };
    }
    const [path] = result.filePaths;
    if (!(sites.looksLikeSite(path) || sites.looksLikeHtml(path))) {
      return {
        message: "Choose a website folder or HTML file.",
        ok: false,
      };
    }
    try {
      return {
        ok: true,
        site: sites.looksLikeHtml(path) ? sites.addHtml(path) : sites.add(path),
      };
    } catch (error) {
      return {
        message: `Couldn’t import this HTML file: ${error.message}`,
        ok: false,
      };
    }
  });
  ipcMain.handle("sites:dropFolder", (event, path) => {
    const session = sessionFor(event);
    if (!session) {
      return { ok: false };
    }
    return openFolderPath(path, session);
  });
  ipcMain.handle("sites:openNewWindow", (event, id) => {
    const session = sessionFor(event);
    const site = sites.get(id);
    if (!session || event.sender !== session.win.webContents || !site) {
      return { ok: false };
    }
    openInNewWindow(site);
    return { ok: true };
  });
  ipcMain.handle("sites:menu", (event, id) => {
    const session = sessionFor(event);
    const site = sites.get(id);
    if (!session || event.sender !== session.win.webContents || !site) {
      return null;
    }
    return new Promise((resolve) => {
      const menu = Menu.buildFromTemplate([
        { click: () => resolve("open"), label: "Open" },
        { click: () => resolve("new-window"), label: "Open in New Window" },
        ...(!site.entry && envSettings.describe(site.path).length > 0
          ? [{ click: () => resolve("settings"), label: "Site settings" }]
          : []),
        {
          click: () =>
            shell.showItemInFolder(
              site.entry ? join(site.path, site.entry) : site.path
            ),
          label: "Show in Finder",
        },
        { type: "separator" },
        {
          click: () => {
            sites.remove(id);
            previews.remove(id);
            broadcast("sites:changed");
            resolve("removed");
          },
          label: "Remove from list",
        },
      ]);
      menu.popup({
        callback: () => setTimeout(() => resolve(null), 50),
        window: session.win,
      });
    });
  });

  ipcMain.handle("site:open", async (event, id, options) => {
    const session = sessionFor(event);
    const site = sites.get(id);
    if (!session || event.sender !== session.win.webContents || !site) {
      return { ok: false };
    }
    const closing = [...windows.values()].find(
      (candidate) =>
        candidate !== session &&
        candidate.openSiteId === id &&
        candidate.closePromise
    );
    if (closing) {
      await closing.closePromise;
    }
    const other = [...windows.values()].find(
      (candidate) =>
        candidate !== session &&
        !candidate.closePromise &&
        candidate.openSiteId === id
    );
    if (other) {
      other.win.show();
      other.win.focus();
      return { code: "already-open", ok: false };
    }
    if (session.openSiteId || session.closePromise) {
      await closeSite(session);
    }
    sites.touch(id);
    session.openSiteId = id;
    session.openSiteUrl = null;
    session.runner.open(site, { fresh: Boolean(options?.fresh) });
    return { ok: true, site };
  });
  ipcMain.handle("site:close", (event) => {
    const session = sessionFor(event);
    return session && event.sender === session.win.webContents
      ? closeSite(session)
      : undefined;
  });

  ipcMain.handle("clone:parse", (_e, link) => cloner.parseRepo(link));
  ipcMain.handle("clone:start", async (_e, link, name) => {
    try {
      const site = await cloner.clone(link, name, (text) =>
        broadcast("clone:progress", text)
      );
      return { ok: true, site };
    } catch (err) {
      return { message: err.message, ok: false };
    }
  });
  ipcMain.handle("clone:cancel", () => cloner.cancel());

  ipcMain.handle("github:account", () => github.account());
  ipcMain.handle("github:repos", () => github.listRepos());
  ipcMain.handle("github:signIn", () => {
    github.startSignIn((payload) => {
      if (payload.type === "code") {
        // Copy the code so the user can paste it on GitHub's page.
        clipboard.writeText(payload.userCode);
      }
      if (payload.type === "done" && payload.ok) {
        buildMenu();
      }
      broadcast("github:event", payload);
    });
  });
  ipcMain.handle("github:cancel", () => github.cancelSignIn());
  ipcMain.handle("github:signOut", () => {
    github.signOut();
    buildMenu();
  });
  ipcMain.handle("github:copy", (_e, text) => {
    if (typeof text === "string" && text.length < 64) {
      clipboard.writeText(text);
    }
  });

  // Settings the site asks for in its example env file.
  ipcMain.handle("settings:get", (_e, id) => {
    const site = sites.get(id);
    return site && !site.entry ? envSettings.describe(site.path) : [];
  });
  /** Missing settings the user has not already chosen to skip. */
  ipcMain.handle("settings:needed", (_e, id) => {
    const site = sites.get(id);
    if (!site || site.entry) {
      return false;
    }
    const skipped = new Set(site.skippedSettings || []);
    return envSettings.missingKeys(site.path).some((key) => !skipped.has(key));
  });
  ipcMain.handle("settings:save", (_e, id, answers) => {
    const site = sites.get(id);
    if (!site) {
      return { ok: false };
    }
    try {
      envSettings.save(site.path, answers);
      return { ok: true };
    } catch {
      return { message: "Weblab couldn’t save the settings.", ok: false };
    }
  });
  ipcMain.handle("settings:skip", (_e, id) => {
    const site = sites.get(id);
    if (site) {
      sites.setSkipped(id, envSettings.missingKeys(site.path));
    }
  });
  // The editor is a native view on top of the page; hide it while a screen
  // such as Site settings is showing.
  ipcMain.handle("editor:visible", (event, visible) => {
    const session = sessionFor(event);
    if (event.sender === session?.win.webContents) {
      session.editorView?.setVisible(Boolean(visible));
    }
  });
  // Edit and Preview: the top bar picks, the editor reports back. Only the
  // editor view may report, and only these two words pass.
  ipcMain.handle("editor:setMode", (event, mode) => {
    const session = sessionFor(event);
    if (
      event.sender === session?.win.webContents &&
      (mode === "edit" || mode === "view")
    ) {
      session.editorView?.webContents.send("editor:setMode", mode);
    }
  });
  // Top-bar buttons for surfaces the editor owns. Only these names pass.
  ipcMain.handle("editor:command", (e, name) => {
    const session = sessionFor(e);
    if (
      e.sender === session?.win.webContents &&
      (name === "palette" || name === "shortcuts")
    ) {
      session.editorView?.webContents.focus();
      session.editorView?.webContents.send("editor:command", name);
    }
  });
  ipcMain.on("editor:modeChanged", (e, mode) => {
    const session = sessionFor(e);
    if (
      e.sender === session?.editorView?.webContents &&
      (mode === "edit" || mode === "view")
    ) {
      send(session, "editor:mode", mode);
    }
  });
}

app.whenReady().then(() => {
  if (process.platform === "darwin" && !app.isPackaged) {
    app.dock?.setIcon(
      nativeImage.createFromPath(join(__dirname, "../assets/icon.png"))
    );
  }
  app.setAboutPanelOptions({
    applicationName: "Weblab",
    copyright: "Made by Ludvig Hedin",
  });
  buildMenu();
  registerIpc();
  if (windows.size === 0) {
    createWindow();
  }
  flushFiles();
  if (app.isPackaged) {
    checkForUpdates();
  }
});

app.on("activate", () => {
  if (windows.size === 0) {
    createWindow();
  }
});

app.on("window-all-closed", () => app.quit());

// Never leave a site running behind a closed app.
app.on("before-quit", (event) => {
  if (quitting) {
    return;
  }
  quitting = true;
  auth.cancelLogin();
  const stops = [...windows.values()].flatMap((session) => {
    if (session.closePromise) {
      return [session.closePromise];
    }
    if (session.runner.running) {
      session.closing = true;
      hideEditor(session);
      return [session.runner.stop()];
    }
    return [];
  });
  if (stops.length || pendingStops.size) {
    event.preventDefault();
    Promise.allSettled([...stops, ...pendingStops]).finally(() => app.quit());
  }
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    Promise.allSettled([
      ...pendingStops,
      ...[...windows.values()].map(
        (session) => session.closePromise || session.runner.stop()
      ),
    ]).finally(() => app.exit(0));
  });
}
