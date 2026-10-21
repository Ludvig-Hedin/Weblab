import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { afterEach, expect, test } from "vitest";

const requireNative = createRequire(import.meta.url);
const { createContentStore } = requireNative("./content.js");
const siteOperation = requireNative("./site-operation.js");
const source = fs.readFileSync(
  new URL("./content-ipc.js", import.meta.url),
  "utf8"
);
const roots: string[] = [];
const field = { documentId: "home", path: 'sections[_key=="hero"].title' };

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

interface Event {
  sender: object;
  senderFrame?: object;
}
interface Reply {
  fields?: { documentId: string; path: string; value: string }[];
  message?: string;
  ok: boolean;
  revision?: number;
  value?: string;
}
interface Provider {
  documents: () => Promise<unknown>;
  mutate: (mutations: object[], transactionId: string) => Promise<void>;
}

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "weblab-content-ipc-"));
  roots.push(root);
  fs.mkdirSync(path.join(root, "src/sanity"), { recursive: true });
  fs.writeFileSync(path.join(root, "src/sanity/weblab.ts"), "export {};\n");
  const content = createContentStore(root);
  content.initialize({
    dataset: "production",
    documents: [
      {
        _id: "home",
        _rev: "rev1",
        _type: "page",
        apiKey: "private-value",
        sections: [{ _key: "hero", title: "Original" }],
      },
    ],
    projectId: "example1",
  });
  let keys = new Map([
    ["NEXT_PUBLIC_SANITY_PROJECT_ID", "example1"],
    ["NEXT_PUBLIC_SANITY_DATASET", "production"],
    ["SANITY_API_READ_TOKEN", "read-one"],
  ]);
  let writeToken: string | null = "write-one";
  let keychainLocked = false;
  let tokenReads = 0;
  let environmentReads = 0;
  let pending: object | null = null;
  const headers: { url: string; authorization: string; body?: string }[] = [];
  const sends: { name: string; payload?: object }[] = [];
  const connections: { projectId: string; dataset: string; value: string }[] =
    [];
  const replacements: typeof connections = [];
  const frameA = {};
  const frameB = {};
  const parentA = { mainFrame: frameA };
  const parentB = { mainFrame: frameB };
  const siteFrame = {};
  const editor = {
    mainFrame: siteFrame,
    send: (name: string) => sends.push({ name }),
  };
  const sessions = [
    {
      editorView: { webContents: editor },
      openSiteId: "site-a",
      runner: { open: () => Promise.resolve() },
      win: { webContents: parentA },
    },
    {
      editorView: { webContents: editor },
      openSiteId: "site-a",
      runner: { open: () => Promise.resolve() },
      win: { webContents: parentB },
    },
  ];
  const handlers = new Map<
    string,
    (event: Event, input?: object | string) => Reply | Promise<Reply>
  >();
  let publish = (_provider: Provider, _input: unknown): Promise<object> =>
    Promise.resolve({});
  let onFetch = () => undefined;
  const mocks: Record<string, unknown> = {
    "./content": {
      createContentStore: (directory: string) => {
        const local = createContentStore(directory);
        return {
          ...local,
          initialize: (value: unknown) =>
            local.initialize(JSON.parse(JSON.stringify(value))),
        };
      },
    },
    "./content-credentials": {
      connect: (
        connection: { projectId: string; dataset: string },
        value: string
      ) => {
        connections.push({
          dataset: connection.dataset,
          projectId: connection.projectId,
          value,
        });
        return { ok: true };
      },
      has: () => writeToken !== null,
      replace: (
        connection: { projectId: string; dataset: string },
        value: string
      ) => {
        replacements.push({
          dataset: connection.dataset,
          projectId: connection.projectId,
          value,
        });
        return { ok: true };
      },
      token: () => {
        tokenReads += 1;
        if (keychainLocked) {
          throw new Error("Unlock your Mac keychain to publish text.");
        }
        return writeToken;
      },
    },
    "./content-publish": {
      createContentPublisher: ({ provider }: { provider: Provider }) => ({
        publish: (input: unknown) => publish(provider, input),
        reconcile: () => Promise.resolve({}),
        restore: () => Promise.resolve({}),
        review: () =>
          Promise.resolve({ review: { changes: [], id: "review1" } }),
        status: () => ({ canRestore: false, pending, review: null }),
      }),
    },
    "./deploy": {
      localKeys: () => {
        environmentReads += 1;
        return keys;
      },
    },
    "./site-operation": siteOperation,
    "./sites": {
      get: (id: string) => (id === "site-a" ? { id, path: root } : null),
    },
    electron: {
      ipcMain: {
        handle: (name: string, fn: (event: Event) => Reply) =>
          handlers.set(name, fn),
      },
    },
    "node:fs": fs,
    "node:path": path,
  };
  const exported: { exports: { register?: (ctx: object) => void } } = {
    exports: {},
  };
  vm.runInNewContext(source, {
    AbortSignal,
    fetch: (
      url: URL,
      options: { headers: { Authorization: string }; body?: string }
    ) => {
      headers.push({
        authorization: options.headers.Authorization,
        body: options.body,
        url: url.toString(),
      });
      onFetch();
      return Promise.resolve({
        json: () => Promise.resolve({ result: [] }),
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ result: [] })),
      });
    },
    module: exported,
    require: (name: string) => {
      if (!(name in mocks)) {
        throw new Error(`Unexpected dependency ${name}`);
      }
      return mocks[name];
    },
    URL,
  });
  exported.exports.register?.({
    send: (_session: object, name: string, payload: object) =>
      sends.push({ name, payload }),
    sessionFor: (event: Event) =>
      sessions.find(
        (session) =>
          session.win.webContents === event.sender ||
          session.editorView.webContents === event.sender
      ),
  });
  const parent = { sender: parentA, senderFrame: frameA };
  const otherParent = { sender: parentB, senderFrame: frameB };
  const site = { sender: editor, senderFrame: siteFrame };
  return {
    changeConnection: () => {
      keys = new Map([
        ["NEXT_PUBLIC_SANITY_PROJECT_ID", "example2"],
        ["NEXT_PUBLIC_SANITY_DATASET", "staging"],
        ["SANITY_API_READ_TOKEN", "read-two"],
      ]);
      writeToken = "write-two";
    },
    connections,
    content,
    credentialReads: () => ({ environmentReads, tokenReads }),
    disconnect: () => {
      writeToken = null;
    },
    headers,
    invoke: (name: string, event = parent, input?: object | string) =>
      Promise.resolve(handlers.get(`content:${name}`)?.(event, input)),
    lockKeychain: () => {
      keychainLocked = true;
    },
    otherParent,
    parent,
    removeEnvironment: () => {
      keys = new Map();
    },
    replacements,
    root,
    sends,
    setFetch: (operation: typeof onFetch) => {
      onFetch = operation;
    },
    setPending: (value: object | null) => {
      pending = value;
    },
    setPublish: (operation: typeof publish) => {
      publish = operation;
    },
    site,
  };
}

test("the website can select a known field but cannot read, write, or publish through native IPC", async () => {
  const app = setup();
  expect(await app.invoke("select", app.site, field)).toEqual({ ok: true });
  expect(app.sends).toEqual([{ name: "content:selected", payload: field }]);
  const actions = [
    "status",
    "read",
    "save",
    "undo",
    "redo",
    "prepare",
    "connect",
    "replaceConnection",
    "review",
    "publish",
    "restore",
    "reconcile",
  ];
  const results = await Promise.all(
    actions.map((action) => app.invoke(action, app.site, field))
  );
  for (const result of results) {
    expect(result?.ok).toBe(false);
  }
  expect((await app.invoke("select", app.parent, field))?.ok).toBe(false);
});

test("rejects unknown bindings and subframe callers", async () => {
  const app = setup();
  expect(
    (await app.invoke("select", app.site, { ...field, path: "apiKey" }))?.ok
  ).toBe(false);
  expect(
    (await app.invoke("select", { ...app.site, senderFrame: {} }, field))?.ok
  ).toBe(false);
  expect(
    (await app.invoke("status", { ...app.parent, senderFrame: {} }))?.ok
  ).toBe(false);
  expect(
    (await app.invoke("status", { sender: {}, senderFrame: {} }))?.ok
  ).toBe(false);
  expect(app.sends).toEqual([]);
});

test("status exposes permitted text and public state without connection secrets", async () => {
  const app = setup();
  const result = await app.invoke("status");
  expect(result?.ok).toBe(true);
  expect(result?.fields).toEqual([{ ...field, value: "Original" }]);
  const serialized = JSON.stringify(result);
  for (const secret of [
    "read-one",
    "write-one",
    "private-value",
    "SANITY_API_READ_TOKEN",
  ]) {
    expect(serialized).not.toContain(secret);
  }
});

test("save uses revisions, rejects stale writes, and notifies only successful edits", async () => {
  const app = setup();
  const before = await app.invoke("read", app.parent, field);
  const saved = await app.invoke("save", app.parent, {
    ...field,
    revision: before?.revision,
    value: "New exact text  \n",
  });
  expect(saved?.ok).toBe(true);
  const conflict = await app.invoke("save", app.parent, {
    ...field,
    revision: before?.revision,
    value: "Lost update",
  });
  expect(conflict?.ok).toBe(false);
  expect((await app.invoke("read", app.parent, field))?.value).toBe(
    "New exact text  \n"
  );
  expect(app.sends).toEqual([{ name: "content:changed" }]);
});

test("a publish operation in one window excludes writes in another window on the same site", async () => {
  const app = setup();
  let release: ((value: object) => void) | undefined;
  app.setPublish(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  const publishing = app.invoke("publish", app.parent, "review1");
  const current = await app.invoke("read", app.otherParent, field);
  const blocked = await app.invoke("save", app.otherParent, {
    ...field,
    revision: current?.revision,
    value: "Concurrent",
  });
  expect(blocked?.ok).toBe(false);
  expect(blocked?.message).toContain("saving or publishing");
  release?.({});
  await publishing;
  expect(
    (
      await app.invoke("save", app.otherParent, {
        ...field,
        revision: current?.revision,
        value: "After publish",
      })
    )?.ok
  ).toBe(true);
});

test("pending publication blocks text edits and missing write credentials block review", async () => {
  const app = setup();
  app.setPending({ kind: "publish" });
  const current = await app.invoke("read", app.parent, field);
  expect(
    (
      await app.invoke("save", app.parent, {
        ...field,
        revision: current?.revision,
        value: "Blocked",
      })
    )?.message
  ).toContain("pending");
  app.disconnect();
  expect((await app.invoke("review"))?.message).toContain("write token");
});

test("publication pins read and write connections across asynchronous provider calls", async () => {
  const app = setup();
  app.setFetch(() => {
    app.changeConnection();
  });
  app.setPublish(async (provider) => {
    await provider.documents();
    await provider.mutate([{ patch: { id: "home" } }], "transaction1");
    return {};
  });
  expect((await app.invoke("publish", app.parent, "review1"))?.ok).toBe(true);
  expect(app.headers.length).toBe(3);
  expect(
    app.headers.every(
      (request) =>
        request.url.startsWith("https://example1.api.sanity.io/") &&
        request.url.includes("/production")
    )
  ).toBe(true);
  expect(app.headers.map((request) => request.authorization)).toEqual([
    "Bearer read-one",
    "Bearer read-one",
    "Bearer write-one",
  ]);
  expect(app.headers[2].body).toContain('"transactionId":"transaction1"');
});

test("connect accepts a token only from the trusted window and pins its project", async () => {
  const app = setup();
  expect((await app.invoke("connect", app.site, "new-write-token"))?.ok).toBe(
    false
  );
  expect((await app.invoke("connect", app.parent, "new-write-token"))?.ok).toBe(
    true
  );
  expect(app.connections).toEqual([
    { dataset: "production", projectId: "example1", value: "new-write-token" },
  ]);
});

test("local status, reads and edit history work without read env and with a locked keychain", async () => {
  const app = setup();
  app.lockKeychain();
  app.removeEnvironment();
  expect((await app.invoke("status"))?.ok).toBe(true);
  const fieldValue = await app.invoke("read", app.parent, field);
  expect(fieldValue?.value).toBe("Original");
  const save = await app.invoke("save", app.parent, {
    ...field,
    revision: fieldValue?.revision,
    value: "Offline draft",
  });
  expect(save?.ok).toBe(true);
  const undo = await app.invoke("undo", app.parent, {
    revision: save?.revision,
  });
  expect(undo?.ok).toBe(true);
  const redo = await app.invoke("redo", app.parent, {
    revision: undo?.revision,
  });
  expect(redo?.ok).toBe(true);
  expect((await app.invoke("read", app.parent, field))?.value).toBe(
    "Offline draft"
  );
  expect(app.credentialReads()).toEqual({ environmentReads: 0, tokenReads: 0 });
  expect(app.headers).toEqual([]);
});

test("only the trusted main frame can replace the existing manifest's connection", async () => {
  const app = setup();
  expect(
    (await app.invoke("replaceConnection", app.site, "replacement"))?.ok
  ).toBe(false);
  expect(
    (
      await app.invoke(
        "replaceConnection",
        { ...app.parent, senderFrame: {} },
        "replacement"
      )
    )?.ok
  ).toBe(false);
  expect(app.replacements).toEqual([]);
  expect(
    (await app.invoke("replaceConnection", app.parent, "replacement"))?.ok
  ).toBe(true);
  expect(app.replacements).toEqual([
    { dataset: "production", projectId: "example1", value: "replacement" },
  ]);
  app.changeConnection();
  expect(
    (await app.invoke("replaceConnection", app.parent, "other"))?.message
  ).toContain("connection changed");
  expect(app.replacements).toHaveLength(1);
});

test("local pending-publication guards remain active without provider credentials", async () => {
  const app = setup();
  app.removeEnvironment();
  app.lockKeychain();
  app.setPending({ kind: "publish" });
  const blocked = { ...field, revision: 0, value: "Blocked" };
  const results = [
    await app.invoke("save", app.parent, blocked),
    await app.invoke("undo", app.parent, blocked),
    await app.invoke("redo", app.parent, blocked),
  ];
  for (const result of results) {
    expect(result?.ok).toBe(false);
    expect(result?.message).toContain("pending");
  }
  expect(app.credentialReads()).toEqual({ environmentReads: 0, tokenReads: 0 });
});

test("preparing text uses its read connection without decrypting a write token", async () => {
  const app = setup();
  app.lockKeychain();
  const result = await app.invoke("prepare");
  expect(result?.ok, result?.message).toBe(true);
  expect(app.credentialReads()).toEqual({ environmentReads: 1, tokenReads: 0 });
  expect(app.headers.map((request) => request.authorization)).toEqual([
    "Bearer read-one",
  ]);
});

test("online publication still requires unlocked credentials", async () => {
  const app = setup();
  app.lockKeychain();
  expect((await app.invoke("review"))?.message).toContain("Unlock");
  expect(
    (await app.invoke("publish", app.parent, "review1"))?.message
  ).toContain("Unlock");
  expect(app.headers).toEqual([]);
});

test("credential presence validates encrypted files without opening the keychain", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "weblab-content-credentials-")
  );
  roots.push(root);
  let keychainCalls = 0;
  const exports = {
    exports: {} as {
      has: (connection: object) => boolean;
      token: (connection: object) => string | null;
    },
  };
  vm.runInNewContext(
    fs.readFileSync(
      new URL("./content-credentials.js", import.meta.url),
      "utf8"
    ),
    {
      Buffer,
      module: exports,
      require: (name: string) =>
        name === "electron"
          ? {
              app: { getPath: () => root },
              safeStorage: {
                decryptString: () => {
                  keychainCalls += 1;
                  throw new Error("Locked");
                },
                isEncryptionAvailable: () => {
                  keychainCalls += 1;
                  return false;
                },
              },
            }
          : requireNative(name),
    }
  );
  const identity = { dataset: "production", projectId: "example1" };
  expect(exports.exports.has(identity)).toBe(false);
  expect(fs.existsSync(path.join(root, "content-connections"))).toBe(false);
  fs.mkdirSync(path.join(root, "content-connections"));
  const connectionHash = requireNative("node:crypto")
    .createHash("sha256")
    .update("example1/production")
    .digest("hex");
  const file = path.join(root, "content-connections", `${connectionHash}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify({
      encrypted: Buffer.from("encrypted fixture").toString("base64"),
    })
  );
  expect(exports.exports.has(identity)).toBe(true);
  expect(keychainCalls).toBe(0);
  expect(() => exports.exports.token(identity)).toThrow("Unlock");
  expect(keychainCalls).toBe(1);
  fs.writeFileSync(file, JSON.stringify({ encrypted: "not valid base64!" }));
  expect(() => exports.exports.has(identity)).toThrow("Invalid");
  expect(() =>
    exports.exports.has({ dataset: "production", projectId: "../outside" })
  ).toThrow("identity");
});
