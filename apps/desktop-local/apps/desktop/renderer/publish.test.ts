import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createContext, runInContext } from "node:vm";
import { afterEach, expect, test } from "vitest";

const requireOverlay = createRequire(
  new URL("../../../packages/overlay/package.json", import.meta.url)
);
const { Window } = requireOverlay("happy-dom");
const source = readFileSync(new URL("./publish.js", import.meta.url), "utf8");
const windows: InstanceType<typeof Window>[] = [];
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  for (const window of windows.splice(0)) {
    window.happyDOM.abort();
  }
});

interface Entry {
  id: string;
  previousId?: string;
  reviewed: boolean;
  url: string;
}

function setup() {
  const window = new Window();
  windows.push(window);
  const { document } = window;
  document.body.innerHTML =
    '<header><div id="title">Site</div><div class="topbar-right"><button id="topbar-settings">Settings</button></div></header><section data-screen="editor"></section><div id="gh-dialog" hidden></div>';
  const release: {
    preview: Entry | null;
    candidate: Entry | null;
    live: Entry | null;
    pending: object | null;
  } = { candidate: null, live: null, pending: null, preview: null };
  const calls: string[] = [];
  let failure = "";
  const deploy = {
    abandonBuild: (id: string) => {
      calls.push(`abandon:${id}`);
      release.pending = null;
      return Promise.resolve({ ok: true });
    },
    onLogin: () => undefined,
    onProgress: () => undefined,
    prepare: () => Promise.resolve({ ok: true }),
    publish: () => {
      calls.push("publish");
      release.live = release.candidate;
      release.candidate = null;
      return Promise.resolve({ ok: true });
    },
    reconcile: () => {
      calls.push("reconcile");
      release.pending = null;
      return Promise.resolve({ ok: true });
    },
    review: (id: string) => {
      calls.push(`review:${id}`);
      const entry = [release.preview, release.candidate].find(
        (item) => item?.id === id
      );
      if (entry) {
        entry.reviewed = true;
      }
      return Promise.resolve({ ok: true });
    },
    rollback: () => {
      calls.push("rollback");
      return Promise.resolve({ ok: true });
    },
    start: (target: string) => {
      calls.push(`build:${target}`);
      if (failure) {
        release.pending = { kind: "build" };
        return Promise.resolve({ message: failure, ok: false });
      }
      const entry = {
        id: target,
        reviewed: false,
        url: `https://${target}.vercel.app`,
      };
      release[target === "preview" ? "preview" : "candidate"] = entry;
      return Promise.resolve({ ok: true, url: entry.url });
    },
    status: () => Promise.resolve({ connected: true, release }),
  };
  window.weblab = {
    deploy,
    publish: {
      freeze: () => Promise.resolve(null),
      onJob: () => undefined,
      openLink: (url: string) => {
        calls.push(`open:${url}`);
        return Promise.resolve();
      },
      status: () => Promise.resolve({ files: [], repo: false }),
    },
  };
  const context = createContext({
    CSS: window.CSS,
    currentSite: { id: "site-a" },
    document,
    MutationObserver: window.MutationObserver,
    navigator: window.navigator,
    setInterval: () => 0,
    window,
  });
  runInContext(source, context);
  const button = (action: string, id?: string) =>
    document.querySelector(
      `[data-act="${action}"]${id ? `[data-id="${id}"]` : ""}`
    );
  const click = (action: string, id?: string) => {
    const target = button(action, id);
    if (!target) {
      throw new Error(`Missing action: ${action}`);
    }
    target.click();
  };
  return {
    button,
    calls,
    click,
    context,
    deploy,
    document,
    fail: (message: string) => {
      failure = message;
    },
    open: async () => {
      document.querySelector('[data-panel="deploy"]').click();
      await flush();
    },
    release,
  };
}

test("requires separate reviews of test and prepared live versions before publishing", async () => {
  const app = setup();
  await app.open();
  expect(app.button("build-production").disabled).toBe(true);
  expect(app.button("publish-live").disabled).toBe(true);
  app.click("build-preview");
  await flush();
  expect(app.button("review", "preview").disabled).toBe(true);
  app.click("open-release", "preview");
  app.click("review", "preview");
  await flush();
  expect(app.button("build-production").disabled).toBe(false);
  app.click("build-production");
  await flush();
  expect(app.document.body.textContent).toContain(
    "The public address has not changed"
  );
  expect(app.button("publish-live").disabled).toBe(true);
  expect(app.calls).not.toContain("publish");
  app.click("open-release", "production");
  app.click("review", "production");
  await flush();
  app.click("publish-live");
  await flush();
  expect(app.calls).toEqual([
    "build:preview",
    "open:https://preview.vercel.app",
    "review:preview",
    "build:production",
    "open:https://production.vercel.app",
    "review:production",
    "publish",
  ]);
  expect(app.document.body.textContent).toContain(
    "The reviewed version is now live"
  );
});

test("requires confirmation before restoring a live version", async () => {
  const app = setup();
  app.release.live = {
    id: "live",
    previousId: "old",
    reviewed: true,
    url: "https://live.vercel.app",
  };
  await app.open();
  app.click("restore");
  expect(app.calls).not.toContain("rollback");
  expect(app.document.body.textContent).toContain(
    "Visitors will see the previous published version"
  );
  app.click("confirm-restore");
  await flush();
  expect(app.calls).toEqual(["rollback"]);
});

test("pending releases block new builds and provide reconciliation", async () => {
  const app = setup();
  app.release.pending = { kind: "promote" };
  await app.open();
  expect(app.button("build-preview")).toBeNull();
  expect(app.button("publish-live")).toBeNull();
  expect(app.button("abandon-build")).toBeNull();
  app.click("reconcile");
  await flush();
  expect(app.calls).toEqual(["reconcile"]);
  expect(app.button("build-preview")).not.toBeNull();
});

test("build recovery needs a second explicit confirmation and exact intent", async () => {
  const app = setup();
  app.release.pending = { id: "attempt1", kind: "build" };
  await app.open();
  app.click("abandon-build");
  expect(app.calls).toEqual([]);
  expect(app.document.body.textContent).toContain(
    "A late build may still finish"
  );
  app.click("confirm-abandon-build");
  await flush();
  expect(app.calls).toEqual(["abandon:attempt1"]);
  expect(app.button("build-preview")).not.toBeNull();
});

test("ambiguous failures never claim that the online site did not change", async () => {
  const app = setup();
  app.fail("Timed out while checking the release.");
  await app.open();
  app.click("build-preview");
  await flush();
  expect(app.document.body.textContent).toContain("Release step not confirmed");
  expect(app.document.body.textContent).not.toContain("Nothing changed online");
  app.click("again");
  await flush();
  expect(app.button("build-preview")).toBeNull();
  expect(app.button("reconcile")).not.toBeNull();
});

test("a site switch during preparation cannot build the newly opened site", async () => {
  const app = setup();
  let finish: ((value: { ok: boolean }) => void) | undefined;
  app.deploy.prepare = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  await app.open();
  app.click("build-preview");
  runInContext('currentSite = {id: "site-b"}', app.context);
  finish?.({ ok: true });
  await flush();
  expect(app.calls).toEqual([]);
});
