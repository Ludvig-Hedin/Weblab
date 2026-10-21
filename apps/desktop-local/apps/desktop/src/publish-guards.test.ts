import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { expect, test, vi } from "vitest";

const nativeRequire = createRequire(import.meta.url);
const source = fs.readFileSync(
  new URL("./publish-ipc.js", import.meta.url),
  "utf8"
);
type Handler = (
  event: { sender: object },
  input: string[]
) => Promise<{ ok: boolean }>;
function fixture() {
  const handlers = new Map<string, Handler>();
  const site = { id: "site", path: "/site" };
  const sender = {};
  const session = { openSiteId: site.id, win: { webContents: sender } };
  let valid = true;
  let finishSummary: (text: string) => void = () => undefined;
  let beginSummary: () => void = () => undefined;
  const started = new Promise<void>((resolve) => {
    beginSummary = resolve;
  });
  const summary = new Promise<string>((resolve) => {
    finishSummary = resolve;
  });
  const write = vi.fn(async () => ({ ok: true }));
  const modules: Record<string, unknown> = {
    "./deploy": {},
    "./note": { write },
    "./sites": {
      assertVerified: vi.fn(async () => undefined),
      checkVerifiedSite: () => {
        if (!valid) {
          throw new Error("The site folder moved.");
        }
      },
      get: () => site,
      verified: async () => site,
      withVerified: (_site: object, operation: () => unknown) => operation(),
    },
    "./upload": {
      changeSummary: () => {
        beginSummary();
        return summary;
      },
      status: async () => ({ files: [{ path: "page.tsx", secret: false }] }),
    },
    electron: {
      ipcMain: {
        handle: (name: string, registeredHandler: Handler) =>
          handlers.set(name, registeredHandler),
        on: vi.fn(),
      },
      shell: {},
    },
  };
  const module = { exports: {} as { register: (ctx: object) => void } };
  vm.runInNewContext(source, {
    module,
    require: (name: string) => modules[name] ?? nativeRequire(name),
  });
  module.exports.register({ sessionFor: () => session });
  const handler = handlers.get("publish:note");
  if (!handler) {
    throw new Error("Note handler was not registered.");
  }
  return {
    finishSummary,
    move: () => {
      valid = false;
    },
    run: () => handler({ sender }, ["page.tsx"]),
    session,
    started,
    write,
  };
}

test("a root change during source summary refuses the later AI request", async () => {
  const h = fixture();
  const result = h.run();
  await h.started;
  h.move();
  h.finishSummary("source summary");
  expect((await result).ok).toBe(false);
  expect(h.write).not.toHaveBeenCalled();
});

test("a changed open site during source summary refuses the later AI request", async () => {
  const h = fixture();
  const result = h.run();
  await h.started;
  h.session.openSiteId = "another-site";
  h.finishSummary("source summary");
  expect((await result).ok).toBe(false);
  expect(h.write).not.toHaveBeenCalled();
});
