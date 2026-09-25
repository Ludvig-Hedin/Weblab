// biome-ignore-all lint/correctness/noGlobalDirnameFilename: Electron loads this file as CommonJS, where import.meta does not exist.
const {
  app,
  BrowserWindow,
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

const TOP_BAR = 40;
const WEB_LINK = /^https?:/;
const BG = "#1E1E1E";

app.setName("Weblab");
// Lets a test run keep its own site list.
if (process.env.WEBLAB_USER_DATA) {
  app.setPath("userData", process.env.WEBLAB_USER_DATA);
}

let win = null;
let editorView = null;
let openSiteId = null;
let quitting = false;

const send = (channel, payload) => {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
};

const runner = new SiteRunner((event) => {
  // The editor view appears once its page has loaded, so there is no blank flash.
  if (event.type === "ready") {
    return showEditor(event.url, () => send("site:event", event));
  }
  if (event.type === "error") {
    hideEditor();
  }
  send("site:event", event);
});

function layoutEditor() {
  if (!(win && editorView)) {
    return;
  }
  const [width, height] = win.getContentSize();
  editorView.setBounds({
    height: Math.max(0, height - TOP_BAR),
    width,
    x: 0,
    y: TOP_BAR,
  });
}

function showEditor(url, onShown) {
  hideEditor();
  editorView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  editorView.setBackgroundColor(BG);
  const { origin } = new URL(url);
  editorView.webContents.setWindowOpenHandler(({ url: target }) => {
    if (WEB_LINK.test(target)) {
      shell.openExternal(target);
    }
    return { action: "deny" };
  });
  editorView.webContents.on("will-navigate", (event, target) => {
    if (new URL(target).origin !== origin) {
      event.preventDefault();
      if (WEB_LINK.test(target)) {
        shell.openExternal(target);
      }
    }
  });
  const view = editorView;
  // Attached (so the page gets its real size) but hidden until it has loaded.
  view.setVisible(false);
  win.contentView.addChildView(view);
  layoutEditor();
  let shown = false;
  const reveal = () => {
    if (shown || editorView !== view || !win || win.isDestroyed()) {
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

function hideEditor() {
  if (!editorView) {
    return;
  }
  const view = editorView;
  editorView = null;
  if (win && !win.isDestroyed()) {
    win.contentView.removeChildView(view);
  }
  view.webContents.close();
}

async function closeSite() {
  hideEditor();
  openSiteId = null;
  await runner.stop();
}

function createWindow() {
  win = new BrowserWindow({
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
  win.loadFile(join(__dirname, "../renderer/index.html"));
  win.once("ready-to-show", () => win.show());
  win.on("resize", layoutEditor);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());

  // Closing while a site is open goes back to the dashboard instead.
  win.on("close", (event) => {
    if (!quitting && openSiteId) {
      event.preventDefault();
      closeSite().then(() => send("nav:dashboard"));
    }
  });
  win.on("closed", () => {
    win = null;
  });
}

function buildMenu() {
  const template = [
    {
      label: "Weblab",
      submenu: [
        { label: "About Weblab", role: "about" },
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
          click: () => send("nav:new"),
          label: "New website…",
        },
        {
          accelerator: "CmdOrCtrl+O",
          click: () => send("nav:open"),
          label: "Open folder…",
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
          click: () => editorView?.webContents.reload(),
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

function registerIpc() {
  ipcMain.handle("auth:state", () => auth.state());
  ipcMain.handle("auth:login", () => {
    auth.startLogin((event) => send("auth:event", event));
  });
  ipcMain.handle("auth:code", (_e, code) => auth.submitCode(code));
  ipcMain.handle("auth:cancel", () => auth.cancelLogin());
  ipcMain.handle("auth:apiKey", (_e, key) => {
    try {
      auth.saveApiKey(key);
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

  ipcMain.handle("sites:list", () => sites.list());
  ipcMain.handle("sites:create", (_e, name) => {
    try {
      return { ok: true, site: sites.create(name) };
    } catch (err) {
      return { message: err.message, ok: false };
    }
  });
  ipcMain.handle("sites:pickFolder", async () => {
    const result = await dialog.showOpenDialog(win, {
      buttonLabel: "Open",
      properties: ["openDirectory"],
      title: "Open a website folder",
    });
    if (result.canceled || !result.filePaths[0]) {
      return { ok: false };
    }
    const [path] = result.filePaths;
    if (!sites.looksLikeSite(path)) {
      return {
        message: "This folder doesn’t look like a website Weblab can open.",
        ok: false,
      };
    }
    return { ok: true, site: sites.add(path) };
  });
  ipcMain.handle("sites:menu", (_e, id) => {
    const site = sites.get(id);
    if (!site) {
      return null;
    }
    return new Promise((resolve) => {
      const menu = Menu.buildFromTemplate([
        { click: () => resolve("open"), label: "Open" },
        {
          click: () => shell.showItemInFolder(site.path),
          label: "Show in Finder",
        },
        { type: "separator" },
        {
          click: () => {
            sites.remove(id);
            resolve("removed");
          },
          label: "Remove from list",
        },
      ]);
      menu.popup({
        callback: () => setTimeout(() => resolve(null), 50),
        window: win,
      });
    });
  });

  ipcMain.handle("site:open", (_e, id) => {
    const site = sites.get(id);
    if (!site) {
      return { ok: false };
    }
    sites.touch(id);
    openSiteId = id;
    runner.open(site);
    return { ok: true, site };
  });
  ipcMain.handle("site:close", () => closeSite());
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
  createWindow();
});

app.on("activate", () => {
  if (!win) {
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
  if (runner.running) {
    event.preventDefault();
    hideEditor();
    runner.stop().finally(() => app.quit());
  }
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    runner.stop().finally(() => app.exit(0));
  });
}
