import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createContext, runInContext } from "node:vm";
import { afterEach, expect, test } from "vitest";

const requireOverlay = createRequire(
  new URL("../../../packages/overlay/package.json", import.meta.url)
);
const { Window } = requireOverlay("happy-dom");
const source = readFileSync(new URL("./app.js", import.meta.url), "utf8");
const markup = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const windows: InstanceType<typeof Window>[] = [];
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  for (const window of windows.splice(0)) {
    window.happyDOM.abort();
  }
});

function setup({ connected = false, authFailure = false } = {}) {
  const window = new Window({
    settings: {
      disableJavaScriptEvaluation: true,
      disableJavaScriptFileLoading: true,
    },
    url: "http://localhost",
  });
  windows.push(window);
  const { document } = window;
  document.documentElement.innerHTML = markup;
  const calls: { name: string; args: unknown[] }[] = [];
  const listeners = new Map<string, (...args: unknown[]) => unknown>();
  const responses: Record<string, () => unknown> = {
    "auth.saveApiKey": () => ({ ok: true }),
    "auth.state": () =>
      authFailure ? Promise.reject(new Error("Unavailable")) : { connected },
    "folders.list": () => [],
    "settings.get": () => [],
    "settings.needed": () => false,
    "site.open": () => ({ ok: true }),
    "sites.list": () => [],
  };
  window.weblab = new Proxy(
    {},
    {
      get: (_target, service: string) =>
        new Proxy(
          {},
          {
            get:
              (_child, method: string) =>
              (...args: unknown[]) => {
                const name = `${service}.${method}`;
                if (method.startsWith("on")) {
                  listeners.set(
                    name,
                    args[0] as (...values: unknown[]) => unknown
                  );
                  return;
                }
                calls.push({ args, name });
                return Promise.resolve(responses[name]?.());
              },
          }
        ),
    }
  );
  runInContext(
    source,
    createContext({ document, localStorage: window.localStorage, window })
  );
  return {
    calls,
    click: (id: string) => document.getElementById(id).click(),
    document,
    event: (name: string, value: unknown) => listeners.get(name)?.(value),
    openSite: async () => {
      await listeners.get("nav.onSite")?.({
        id: "example",
        name: "Example",
        path: "/local/example",
      });
      await flush();
      listeners.get("site.onEvent")?.({ type: "ready" });
    },
    shown: (name: string) =>
      !document.querySelector(`[data-screen="${name}"]`).hidden,
    window,
  };
}

test("a disconnected user can open sites without starting an AI login", async () => {
  const app = setup();
  await flush();
  expect(app.shown("connect")).toBe(true);
  expect(
    app.document.querySelector('[data-screen="connect"]').textContent
  ).toContain("shared fonts in Variables");
  app.click("continue-without-ai");
  await flush();
  expect(app.shown("dashboard")).toBe(true);
  expect(app.document.getElementById("topbar-connect").hidden).toBe(false);
  expect(app.calls.some((call) => call.name === "auth.login")).toBe(false);
  await app.openSite();
  expect(app.shown("editor")).toBe(true);
  expect(app.calls.some((call) => call.name === "site.open")).toBe(true);
});

test("connect can be opened from a live editor and skipped without restarting the site", async () => {
  const app = setup();
  await flush();
  app.click("continue-without-ai");
  await flush();
  await app.openSite();
  app.click("topbar-connect");
  await flush();
  expect(app.shown("connect")).toBe(true);
  app.click("continue-without-ai");
  await flush();
  expect(app.shown("editor")).toBe(true);
  expect(app.calls.filter((call) => call.name === "site.open").length).toBe(1);
  expect(
    app.calls
      .filter((call) => call.name === "editor.setVisible")
      .map((call) => call.args[0])
  ).toEqual([false, true]);
});

test("existing OAuth sign-in returns to the same editor after success", async () => {
  const app = setup();
  await flush();
  app.click("continue-without-ai");
  await flush();
  await app.openSite();
  app.click("topbar-connect");
  await flush();
  app.click("signin");
  expect(app.calls.some((call) => call.name === "auth.login")).toBe(true);
  app.event("auth.onEvent", { ok: true, type: "done" });
  await flush();
  expect(app.shown("editor")).toBe(true);
  expect(app.document.getElementById("topbar-connect").hidden).toBe(true);
  expect(app.calls.filter((call) => call.name === "site.open").length).toBe(1);
});

test("saving an API key keeps edits open and explains that AI needs a site reopen", async () => {
  const app = setup();
  await flush();
  app.click("continue-without-ai");
  await flush();
  await app.openSite();
  app.click("topbar-connect");
  await flush();
  app.click("use-key");
  expect(app.document.getElementById("connect-key-note").hidden).toBe(false);
  app.document.getElementById("key-input").value = "test-only-key";
  app.document
    .getElementById("key-form")
    .dispatchEvent(new app.window.Event("submit", { cancelable: true }));
  await flush();
  expect(app.shown("editor")).toBe(true);
  expect(app.document.getElementById("key-input").value).toBe("");
  expect(app.document.getElementById("status").textContent).toContain(
    "Reopen this site to use AI"
  );
  expect(app.calls.filter((call) => call.name === "site.open").length).toBe(1);
});

test("an auth-check error still permits local editing", async () => {
  const app = setup({ authFailure: true });
  await flush();
  expect(app.shown("connect")).toBe(true);
  expect(app.document.getElementById("connect-error").textContent).toContain(
    "continue without AI"
  );
  app.click("continue-without-ai");
  await flush();
  expect(app.shown("dashboard")).toBe(true);
});

test("a signed-in user retains the direct dashboard startup", async () => {
  const app = setup({ connected: true });
  await flush();
  expect(app.shown("dashboard")).toBe(true);
  expect(app.document.getElementById("topbar-connect").hidden).toBe(true);
});
