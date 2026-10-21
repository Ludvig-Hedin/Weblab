import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createContext, runInContext } from "node:vm";
import { afterEach, expect, test } from "vitest";

const requireOverlay = createRequire(
  new URL("../../../packages/overlay/package.json", import.meta.url)
);
const { Window } = requireOverlay("happy-dom");
const source = readFileSync(
  new URL("./inline-content.js", import.meta.url),
  "utf8"
);
const windows: InstanceType<typeof Window>[] = [];
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
afterEach(() => {
  for (const window of windows.splice(0)) {
    window.happyDOM.abort();
  }
});

interface Event {
  dirty: boolean;
  editId: string;
  phase: "editing" | "staged" | "saved" | "cancelled";
  revision: number;
  siteId: string;
}
interface Reply {
  canRedo?: boolean;
  canUndo?: boolean;
  message?: string;
  ok: boolean;
  revision?: number;
}
interface Status extends Reply {
  configured?: boolean;
  publishing?: { pending: boolean };
}
function setup(
  initialStatus: () => Promise<Status> = async () => ({
    configured: false,
    ok: true,
  })
) {
  const window = new Window();
  windows.push(window);
  const { document } = window;
  document.body.innerHTML =
    '<header><button id="back">Back</button><div class="topbar-right"></div></header><section data-screen="editor"></section>';
  let listener: (event: Event) => void = () => undefined;
  const calls: { action: string; input: string | number }[] = [];
  let response = async (): Promise<Reply> => ({
    canRedo: false,
    canUndo: true,
    ok: true,
    revision: 3,
  });
  let status = initialStatus;
  let statusReads = 0;
  const content: Record<string, unknown> = {
    onInline: (callback: typeof listener) => {
      listener = callback;
    },
    status: () => {
      statusReads += 1;
      return status();
    },
  };
  for (const action of ["commitInline", "cancelInline", "undo", "redo"]) {
    content[action] = (input: string | number) => {
      calls.push({ action, input });
      return response();
    };
  }
  window.weblab = { content };
  const context = createContext({
    currentSite: { id: "site-a" },
    document,
    MutationObserver: window.MutationObserver,
    window,
  });
  runInContext(source, context);
  const button = (label: string) =>
    [...document.querySelectorAll("button")].find(
      (item) => item.textContent === label
    );
  let navigated = 0;
  document.querySelector("#back").addEventListener("click", () => {
    navigated += 1;
  });
  return {
    button,
    calls,
    document,
    event: (patch: Partial<Event> = {}) =>
      listener({
        dirty: false,
        editId: "edit-1",
        phase: "editing",
        revision: 2,
        siteId: "site-a",
        ...patch,
      }),
    group: () => document.querySelector(".inline-content"),
    navigated: () => navigated,
    reply: (callback: typeof response) => {
      response = callback;
    },
    status: (callback: typeof status) => {
      status = callback;
    },
    statusReads: () => statusReads,
    switchSite: () => {
      runInContext('currentSite = { id: "site-b" }', context);
      document.body.dataset.site = "site-b";
    },
  };
}

test("saves dirty inline text and undo/redo use each exact returned revision", async () => {
  const app = setup();
  expect(app.group().hidden).toBe(true);
  app.event();
  expect(app.group().textContent).toContain("Edit text on page");
  expect(app.button("Save text").disabled).toBe(true);
  app.event({ dirty: true, phase: "staged" });
  app.button("Save text").click();
  await flush();
  expect(app.calls).toEqual([{ action: "commitInline", input: "edit-1" }]);
  expect(app.group().textContent).toContain("Text saved");
  expect(app.button("Undo").disabled).toBe(false);
  app.reply(async () => ({
    canRedo: true,
    canUndo: false,
    ok: true,
    revision: 4,
  }));
  app.button("Undo").click();
  await flush();
  expect(app.calls.at(-1)).toEqual({ action: "undo", input: 3 });
  expect(app.button("Redo").disabled).toBe(false);
  app.reply(async () => ({
    canRedo: false,
    canUndo: true,
    ok: true,
    revision: 5,
  }));
  app.button("Redo").click();
  await flush();
  expect(app.calls.at(-1)).toEqual({ action: "redo", input: 4 });
});

test("dirty text blocks header navigation until an explicit discard", async () => {
  const app = setup();
  app.event({ dirty: true });
  app.button("Back").click();
  expect(app.navigated()).toBe(0);
  expect(app.group().textContent).toContain("Save or discard text first");
  app.button("Discard").click();
  await flush();
  expect(app.calls).toEqual([{ action: "cancelInline", input: "edit-1" }]);
  expect(app.group().hidden).toBe(true);
  app.button("Back").click();
  expect(app.navigated()).toBe(1);
});

test("save errors remain visible and preserve dirty controls", async () => {
  const app = setup();
  app.reply(async () => ({
    message: "Text changed in another window.",
    ok: false,
  }));
  app.event({ dirty: true });
  app.button("Save text").click();
  await flush();
  expect(app.group().querySelector(".pub-error").textContent).toBe(
    "Text changed in another window."
  );
  expect(app.button("Save text").disabled).toBe(false);
  app.event({ dirty: true, phase: "staged" });
  expect(app.group().textContent).toContain("Text changed in another window.");
});

test("ignores stale save responses after switching site or hiding the editor", async () => {
  const app = setup();
  let finish: (result: Reply) => void = () => undefined;
  app.reply(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  app.event({ dirty: true });
  app.button("Save text").click();
  app.switchSite();
  await flush();
  expect(app.group().hidden).toBe(true);
  app.event({ dirty: true, editId: "edit-2", revision: 7, siteId: "site-b" });
  finish({ canUndo: true, ok: true, revision: 3 });
  await flush();
  expect(app.group().textContent).toContain("Edit text on page");
  expect(app.button("Save text").disabled).toBe(false);
  app.document.querySelector('[data-screen="editor"]').hidden = true;
  await flush();
  expect(app.group().hidden).toBe(true);
});

test("old replies and saved events cannot replace a newer edit", async () => {
  const app = setup();
  let finish: (result: Reply) => void = () => undefined;
  app.reply(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  app.event({ dirty: true });
  app.button("Save text").click();
  app.event({ dirty: true, editId: "edit-2", revision: 3 });
  app.event({ phase: "saved", revision: 3 });
  finish({ canUndo: true, ok: true, revision: 3 });
  await flush();
  expect(app.group().textContent).toContain("Edit text on page");
  expect(app.button("Save text").disabled).toBe(false);
  app.reply(async () => ({ canUndo: true, ok: true, revision: 4 }));
  app.button("Save text").click();
  await flush();
  expect(app.calls.at(-1)).toEqual({ action: "commitInline", input: "edit-2" });
});

test("a native saved event before the reply uses current revision and cancel clears controls", async () => {
  const app = setup();
  let finish: (result: Reply) => void = () => undefined;
  app.reply(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  app.event({ dirty: true });
  app.button("Save text").click();
  app.event({ phase: "saved", revision: 3 });
  finish({ canRedo: false, canUndo: true, ok: true, revision: 3 });
  await flush();
  expect(app.button("Undo").disabled).toBe(false);
  app.event({ phase: "cancelled", revision: 3 });
  expect(app.group().hidden).toBe(true);
  app.event({ phase: "saved", revision: 3 });
  expect(app.group().hidden).toBe(true);
});

test("restores saved Undo history on opening and reentering the editor", async () => {
  const app = setup(async () => ({
    canRedo: false,
    canUndo: true,
    configured: true,
    ok: true,
    revision: 12,
  }));
  await flush();
  expect(app.group().hidden).toBe(false);
  expect(app.group().textContent).toContain("Text saved");
  app.reply(async () => ({
    canRedo: true,
    canUndo: false,
    ok: true,
    revision: 13,
  }));
  app.button("Undo").click();
  await flush();
  expect(app.calls).toEqual([{ action: "undo", input: 12 }]);
  const editor = app.document.querySelector('[data-screen="editor"]');
  editor.hidden = true;
  await flush();
  expect(app.group().hidden).toBe(true);
  app.status(async () => ({
    canRedo: true,
    canUndo: false,
    configured: true,
    ok: true,
    revision: 13,
  }));
  editor.hidden = false;
  await flush();
  expect(app.button("Redo").disabled).toBe(false);
  expect(app.statusReads()).toBe(2);
});

test("late history reads cannot hide active edits or revive a previous site", async () => {
  let finish: (status: Status) => void = () => undefined;
  const app = setup(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  app.event({ dirty: true, revision: 20 });
  finish({ configured: false, ok: true });
  await flush();
  expect(app.button("Save text").disabled).toBe(false);
  expect(app.group().textContent).toContain("Edit text on page");
  app.status(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  app.switchSite();
  await flush();
  app.document.querySelector('[data-screen="editor"]').hidden = true;
  await flush();
  finish({ canUndo: true, configured: true, ok: true, revision: 22 });
  await flush();
  expect(app.group().hidden).toBe(true);
});

test("refreshes history when Content closes without an inline event and never polls", async () => {
  const app = setup(async () => ({
    canUndo: true,
    configured: true,
    ok: true,
    revision: 7,
  }));
  await flush();
  const panel = app.document.createElement("section");
  panel.id = "content-panel";
  app.document.body.append(panel);
  await flush();
  app.status(async () => ({
    canRedo: true,
    canUndo: false,
    configured: true,
    ok: true,
    revision: 8,
  }));
  panel.hidden = true;
  await flush();
  expect(app.button("Undo").disabled).toBe(true);
  expect(app.button("Redo").disabled).toBe(false);
  expect(app.statusReads()).toBe(2);
  app.reply(async () => ({
    canRedo: false,
    canUndo: true,
    ok: true,
    revision: 9,
  }));
  app.button("Redo").click();
  await flush();
  expect(app.calls).toEqual([{ action: "redo", input: 8 }]);
  expect(app.statusReads()).toBe(2);
});

test("missing, failed and pending content status do not show history errors", async () => {
  const apps = [
    async () => ({ configured: false, ok: true }),
    async () => ({ message: "No manifest", ok: false }),
    () => Promise.reject(new Error("Offline")),
    async () => ({
      canUndo: true,
      configured: true,
      ok: true,
      publishing: { pending: true },
      revision: 2,
    }),
  ].map(setup);
  await flush();
  for (const app of apps) {
    expect(app.group().hidden).toBe(true);
    expect(app.group().querySelector(".pub-error")).toBeNull();
  }
});

test("discard and clean cancellation restore earlier saved history", async () => {
  const app = setup();
  await flush();
  app.status(async () => ({
    canRedo: false,
    canUndo: true,
    configured: true,
    ok: true,
    revision: 8,
  }));
  app.event({ dirty: true, revision: 8 });
  app.button("Discard").click();
  await flush();
  expect(app.group().hidden).toBe(false);
  expect(app.button("Undo").disabled).toBe(false);
  expect(app.group().textContent).toContain("Text saved");
  app.event({ editId: "edit-2", revision: 8 });
  app.event({ editId: "edit-2", phase: "cancelled", revision: 8 });
  await flush();
  expect(app.button("Undo").disabled).toBe(false);
  app.button("Undo").click();
  expect(app.calls.at(-1)).toEqual({ action: "undo", input: 8 });
});

test("history after cancellation cannot overwrite a newer inline edit", async () => {
  const app = setup();
  await flush();
  let finish: (status: Status) => void = () => undefined;
  app.status(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  app.event({ revision: 8 });
  app.event({ phase: "cancelled", revision: 8 });
  app.event({ dirty: true, editId: "edit-2", revision: 8 });
  finish({ canUndo: true, configured: true, ok: true, revision: 8 });
  await flush();
  expect(app.group().textContent).toContain("Edit text on page");
  expect(app.button("Save text").disabled).toBe(false);
  expect(app.button("Undo").hidden).toBe(true);
});
