/** biome-ignore-all lint/suspicious/noEmptyBlockStatements: the Electron fakes below are intentional no-op stubs. */
import { EventEmitter } from "node:events";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { expect, test, vi } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const nodeRequire = createRequire(import.meta.url);
const SITE_FOLDER = /^\/site-[ab]$/;

interface MenuItem {
  click?: () => void;
  label?: string;
  submenu?: MenuItem[];
}

async function harness() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const sites = new Map<string, { id: string; path: string; name: string }>();
  const runners: { site: string | null; stops: number }[] = [];
  const windows: FakeWindow[] = [];
  let focused: FakeWindow | null = null;
  let ready = false;
  let menu: MenuItem[] = [];
  const pending = new Set<unknown>();
  const responses: number[] = [];
  const runnerEvents: ((event: unknown) => void)[] = [];
  const views: { closed: boolean; reloads: number }[] = [];
  let contentContext: {
    sessionFor: (event: { sender: unknown }) => unknown;
    inlineSettled: (session: unknown) => void;
  };
  const reset = vi.fn((session: unknown) => pending.delete(session));
  const showMessageBox = vi.fn(async () => ({
    response: responses.shift() ?? 0,
  }));

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
      let prevented = false;
      this.emit("close", {
        preventDefault() {
          prevented = true;
        },
      });
      if (prevented) {
        return;
      }
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
    quit: vi.fn(),
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
    dialog: { showMessageBox, showOpenDialog() {} },
    ipcMain: Object.assign(new EventEmitter(), {
      handle(channel: string, fn: (...args: unknown[]) => unknown) {
        handlers.set(channel, fn);
      },
    }),
    Menu: {
      buildFromTemplate: (items: MenuItem[]) => items,
      setApplicationMenu(items: MenuItem[]) {
        menu = items;
      },
    },
    nativeImage: { createFromPath() {} },
    shell: { openExternal() {}, showItemInFolder() {} },
    WebContentsView: class {
      state = { closed: false, reloads: 0 };
      constructor() {
        views.push(this.state);
      }
      webContents = Object.assign(new EventEmitter(), {
        close: () => {
          this.state.closed = true;
        },
        loadURL(this: EventEmitter) {
          this.emit("did-finish-load");
        },
        reload: () => {
          this.state.reloads += 1;
        },
        send() {},
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
      runnerEvents.push(onEvent);
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
    "./content-ipc": {
      register: (context: typeof contentContext) => {
        contentContext = context;
        return {
          hasPending: (session: unknown) => pending.has(session),
          reset,
        };
      },
    },
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
    setTimeout: (callback: () => void, delay: number) => {
      if (delay === 0) {
        queueMicrotask(callback);
      }
      return 0;
    },
    URL,
  });
  await new Promise(setImmediate);
  const sessionForWindow = (win: FakeWindow) =>
    contentContext.sessionFor({ sender: win.webContents });
  return {
    app,
    handlers,
    pending,
    reload: () =>
      menu
        .find((item) => item.label === "View")
        ?.submenu?.find((item) => item.label === "Reload editor")
        ?.click?.(),
    reset,
    responses,
    runnerEvents,
    runners,
    session: sessionForWindow,
    settled: (win: FakeWindow) =>
      contentContext.inlineSettled(sessionForWindow(win)),
    showMessageBox,
    sites,
    views,
    windows,
  };
}

test("Finder opens a second site in its own window and closing it stops only that site", async () => {
  const { app, handlers, runners, sites, windows } = await harness();
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

async function openFixture() {
  const h = await harness();
  h.app.emit("open-file", { preventDefault() {} }, "/site-a");
  const [win] = h.windows;
  await h.handlers.get("nav:ready")?.({ sender: win.webContents });
  await h.handlers.get("site:open")?.({ sender: win.webContents }, "/site-a");
  h.reset.mockClear();
  return { ...h, session: h.session(win), win };
}

test("native Reload keeps pending text and its view until the text is settled", async () => {
  const h = await openFixture();
  h.pending.add(h.session);
  h.reload();
  expect(h.views[0].reloads).toBe(0);
  expect(h.views[0].closed).toBe(false);
  expect(h.pending.has(h.session)).toBe(true);
  expect(h.reset).not.toHaveBeenCalled();
  expect(h.showMessageBox).toHaveBeenCalledTimes(1);
  h.pending.delete(h.session);
  h.reload();
  expect(h.views[0].reloads).toBe(1);
});

test("runner errors preserve pending text and the editor, then surface after Save or Discard", async () => {
  const h = await openFixture();
  h.pending.add(h.session);
  const failure = {
    details: "Target exited",
    message: "Site stopped",
    type: "error",
  };
  h.runnerEvents[0](failure);
  h.runnerEvents[0](failure);
  expect(h.showMessageBox).toHaveBeenCalledTimes(1);
  expect(h.pending.has(h.session)).toBe(true);
  expect(h.reset).not.toHaveBeenCalled();
  expect(h.views[0].closed).toBe(false);
  expect(
    h.win.webContents.messages.some(
      ([channel, event]) =>
        channel === "site:event" && (event as { type: string }).type === "error"
    )
  ).toBe(false);
  h.pending.delete(h.session);
  h.settled(h.win);
  await new Promise(setImmediate);
  expect(h.views[0].closed).toBe(true);
  expect(h.win.webContents.messages).toContainEqual(["site:event", failure]);
});

test("window close Keep editing preserves text; explicit discard closes only that window", async () => {
  const h = await openFixture();
  h.pending.add(h.session);
  h.responses.push(0);
  h.win.close();
  await new Promise(setImmediate);
  expect(h.win.destroyed).toBe(false);
  expect(h.pending.has(h.session)).toBe(true);
  expect(h.views[0].closed).toBe(false);
  expect(h.reset).not.toHaveBeenCalled();
  h.responses.push(1);
  h.win.close();
  await new Promise(setImmediate);
  expect(h.win.destroyed).toBe(true);
  expect(h.pending.has(h.session)).toBe(false);
  expect(h.views[0].closed).toBe(true);
  expect(h.runners[0].stops).toBe(1);
});

test("quit Keep editing preserves text and explicit discard clears pending before quitting", async () => {
  const h = await openFixture();
  h.pending.add(h.session);
  const preventDefault = vi.fn();
  h.responses.push(0);
  h.app.emit("before-quit", { preventDefault });
  await new Promise(setImmediate);
  expect(preventDefault).toHaveBeenCalledTimes(1);
  expect(h.app.quit).not.toHaveBeenCalled();
  expect(h.pending.has(h.session)).toBe(true);
  expect(h.reset).not.toHaveBeenCalled();
  h.responses.push(1);
  h.app.emit("before-quit", { preventDefault });
  await new Promise(setImmediate);
  expect(h.pending.has(h.session)).toBe(false);
  expect(h.app.quit).toHaveBeenCalledTimes(1);
});
