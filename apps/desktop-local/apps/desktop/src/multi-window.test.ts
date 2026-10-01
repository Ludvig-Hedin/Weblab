/** biome-ignore-all lint/suspicious/noEmptyBlockStatements: the Electron fakes below are intentional no-op stubs. */
import { EventEmitter } from "node:events";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { expect, test } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const nodeRequire = createRequire(import.meta.url);
const SITE_FOLDER = /^\/site-[ab]$/;

test("Finder opens a second site in its own window and closing it stops only that site", async () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const sites = new Map<string, { id: string; path: string; name: string }>();
  const runners: { site: string | null; stops: number }[] = [];
  const windows: FakeWindow[] = [];
  let focused: FakeWindow | null = null;
  let ready = false;

  class FakeWindow extends EventEmitter {
    webContents = Object.assign(new EventEmitter(), {
      messages: [] as [string, unknown][],
      send(channel: string, payload: unknown) {
        this.messages.push([channel, payload]);
      },
      setWindowOpenHandler() {},
    });
    contentView = { addChildView() {}, removeChildView() {} };
    destroyed = false;
    constructor() {
      super();
      windows.push(this);
    }
    loadFile() {}
    show() {}
    focus() {
      focused = this;
    }
    isDestroyed() {
      return this.destroyed;
    }
    getContentSize() {
      return [1280, 820];
    }
    close() {
      this.destroyed = true;
      this.emit("closed");
    }
    static getFocusedWindow() {
      return focused;
    }
  }

  const app = Object.assign(new EventEmitter(), {
    dock: { setIcon() {} },
    exit() {},
    isPackaged: false,
    isReady: () => ready,
    quit() {},
    setAboutPanelOptions() {},
    setName() {},
    setPath() {},
    whenReady: () =>
      Promise.resolve().then(() => {
        ready = true;
      }),
  });
  const electron = {
    app,
    BrowserWindow: FakeWindow,
    clipboard: { writeText() {} },
    dialog: { showOpenDialog() {} },
    ipcMain: Object.assign(new EventEmitter(), {
      handle(channel: string, fn: (...args: unknown[]) => unknown) {
        handlers.set(channel, fn);
      },
    }),
    Menu: {
      buildFromTemplate: (items: unknown) => items,
      setApplicationMenu() {},
    },
    nativeImage: { createFromPath() {} },
    shell: { openExternal() {}, showItemInFolder() {} },
    WebContentsView: class {
      webContents = Object.assign(new EventEmitter(), {
        close() {},
        loadURL() {
          this.emit("did-finish-load");
        },
        setWindowOpenHandler() {},
      });
      setBackgroundColor() {}
      setVisible() {}
      setBounds() {}
    },
  };
  class SiteRunner {
    state = { site: null as string | null, stops: 0 };
    private readonly onEvent: (event: unknown) => void;
    constructor(onEvent: (event: unknown) => void) {
      this.onEvent = onEvent;
      runners.push(this.state);
    }
    get running() {
      return Boolean(this.state.site);
    }
    open(site: { id: string }) {
      this.state.site = site.id;
      this.onEvent({
        siteUrl: "http://localhost:4100/",
        type: "ready",
        url: "http://localhost:4101/",
      });
    }
    stop() {
      this.state.stops += 1;
      this.state.site = null;
      return Promise.resolve();
    }
  }
  const mocks: Record<string, unknown> = {
    "./auth": {
      cancelLogin() {},
      saveApiKey() {},
      state: async () => ({ connected: true }),
    },
    "./clone": {},
    "./env-settings": {},
    "./favicon": { read: async () => null },
    "./github": { account: () => null },
    "./previews": { capture: async () => false, read: async () => null },
    "./publish-ipc": { register: () => ({ close() {}, reset() {} }) },
    "./runner": { SiteRunner },
    "./sites": {
      add: (folder: string) => {
        const site = { id: folder, name: folder, path: folder };
        sites.set(site.id, site);
        return Promise.resolve(site);
      },
      assertVerified: (site: { id: string }) => {
        if (!sites.has(site.id)) {
          throw new Error("Site no longer listed");
        }
        return Promise.resolve(site);
      },
      get: (id: string) => sites.get(id),
      list: async () => [...sites.values()],
      looksLikeHtml: () => false,
      looksLikeSite: (folder: string) => SITE_FOLDER.test(folder),
      setOpenChecker() {},
      touch() {},
      verified: (id: string) => {
        const site = sites.get(id);
        if (!site) {
          throw new Error("Site no longer listed");
        }
        return Promise.resolve(site);
      },
    },
    electron,
  };
  const source = fs.readFileSync(path.join(testDir, "main.js"), "utf8");
  vm.runInNewContext(source, {
    __dirname: testDir,
    module: { exports: {} },
    process: { env: {}, on() {}, platform: "darwin" },
    require: (name: string) => mocks[name] || nodeRequire(name),
    setTimeout: () => 0,
    URL,
  });
  app.emit("open-file", { preventDefault() {} }, "/site-a");
  await new Promise(setImmediate);
  expect(windows).toHaveLength(1);
  await handlers.get("nav:ready")?.({ sender: windows[0].webContents });
  expect(
    windows[0].webContents.messages.some(([channel]) => channel === "nav:site")
  ).toBe(true);
  await handlers.get("site:open")?.(
    { sender: windows[0].webContents },
    "/site-a"
  );

  expect(
    await handlers.get("sites:locate")?.(
      { sender: windows[0].webContents },
      "/site-a"
    )
  ).toEqual({
    error: "Close this site in every window before choosing a folder.",
  });

  app.emit("open-file", { preventDefault() {} }, "/site-b");
  await new Promise(setImmediate);
  expect(windows).toHaveLength(2);
  await handlers.get("auth:apiKey")?.(
    { sender: windows[0].webContents },
    "test-key"
  );
  expect(
    windows[1].webContents.messages.some(
      ([channel]) => channel === "auth:event"
    )
  ).toBe(true);
  await handlers.get("nav:ready")?.({ sender: windows[1].webContents });
  await handlers.get("site:open")?.(
    { sender: windows[1].webContents },
    "/site-b"
  );
  expect(runners.map((runner) => runner.site)).toEqual(["/site-a", "/site-b"]);

  const closing = handlers.get("site:close")?.({
    sender: windows[1].webContents,
  });
  const reopening = handlers.get("site:open")?.(
    { sender: windows[1].webContents },
    "/site-b"
  );
  await Promise.all([closing, reopening]);
  expect(runners[1].site).toBe("/site-b");

  sites.set("/site-c", { id: "/site-c", name: "C", path: "/site-c" });
  await handlers.get("sites:openNewWindow")?.(
    { sender: windows[0].webContents },
    "/site-c"
  );
  expect(windows).toHaveLength(3);
  await handlers.get("nav:ready")?.({ sender: windows[2].webContents });
  await handlers.get("site:open")?.(
    { sender: windows[2].webContents },
    "/site-c"
  );
  expect(runners[2].site).toBe("/site-c");

  windows[1].close();
  await new Promise(setImmediate);
  expect(runners[1].stops).toBeGreaterThan(0);
  expect(runners[0].site).toBe("/site-a");
  expect(runners[2].site).toBe("/site-c");
});
