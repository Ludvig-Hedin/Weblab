import { randomUUID } from "node:crypto";
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
  editId?: string;
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

function setup(realPublisher = false) {
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
  const rootStat = fs.statSync(root, { bigint: true });
  const boundSite = {
    _location: {
      generation: 1,
      identity: {
        birthtimeNs: rootStat.birthtimeNs,
        dev: rootStat.dev,
        ino: rootStat.ino,
      },
    },
    id: "site-a",
    path: root,
  };
  let rejectMutation = false;
  let initializeCalls = 0;
  let admission: (() => Promise<void>) | null = null;
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
      runner: { boundSite, open: () => Promise.resolve() },
      win: { webContents: parentA },
    },
    {
      editorView: { webContents: editor },
      openSiteId: "site-a",
      runner: { boundSite, open: () => Promise.resolve() },
      win: { webContents: parentB },
    },
  ];
  const handlers = new Map<
    string,
    (event: Event, input?: object | string) => Reply | Promise<Reply>
  >();
  let publish = (_provider: Provider, _input: unknown): Promise<object> =>
    Promise.resolve({});
  let onFetch: () => void | Promise<void> = () => undefined;
  const mocks: Record<string, unknown> = {
    "./content": {
      createContentStore: (directory: string) => {
        const local = createContentStore(directory);
        return {
          ...local,
          initialize: (value: unknown) => {
            initializeCalls += 1;
            return local.initialize(JSON.parse(JSON.stringify(value)));
          },
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
    "./content-publish": realPublisher
      ? {
          createContentPublisher: (options: {
            provider: Provider;
            root: string;
            store: object;
            verify: () => void;
          }) =>
            requireNative("./content-publish.js").createContentPublisher({
              ...options,
              provider: {
                ...options.provider,
                documents: async () =>
                  JSON.parse(
                    JSON.stringify(await options.provider.documents())
                  ),
              },
            }),
        }
      : {
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
    "./site-operation": {
      exclusive: (directory: string, action: () => unknown) =>
        admission
          ? admission().then(() => siteOperation.exclusive(directory, action))
          : siteOperation.exclusive(directory, action),
    },
    "./sites": {
      checkVerifiedSite: (verifiedSite: typeof boundSite) => {
        const stat = fs.statSync(verifiedSite.path, { bigint: true });
        const locationIdentity = verifiedSite._location.identity;
        if (
          stat.dev !== locationIdentity.dev ||
          stat.ino !== locationIdentity.ino ||
          stat.birthtimeNs !== locationIdentity.birthtimeNs
        ) {
          throw new Error("This site's source folder is unavailable.");
        }
        return verifiedSite;
      },
      get: (id: string) => (id === "site-a" ? boundSite : null),
      withVerified: (_site: object, action: () => unknown) => action(),
    },
    electron: {
      ipcMain: {
        handle: (name: string, fn: (event: Event) => Reply) =>
          handlers.set(name, fn),
      },
    },
    "node:crypto": { randomUUID },
    "node:fs": fs,
    "node:path": path,
  };
  const exported: { exports: { register?: (ctx: object) => void } } = {
    exports: {},
  };
  vm.runInNewContext(source, {
    AbortSignal,
    fetch: async (
      url: URL,
      options: { headers: { Authorization: string }; body?: string }
    ) => {
      headers.push({
        authorization: options.headers.Authorization,
        body: options.body,
        url: url.toString(),
      });
      await onFetch();
      return Promise.resolve({
        json: () => Promise.resolve({ result: [] }),
        ok: !(rejectMutation && options.body),
        status: rejectMutation && options.body ? 409 : 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              result: [
                {
                  _id: "home",
                  _rev: "rev1",
                  _type: "page",
                  sections: [{ _key: "hero", title: "Original" }],
                },
              ],
            })
          ),
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
    changeSession: () => {
      sessions[0].openSiteId = "site-other";
    },
    connections,
    content,
    credentialReads: () => ({ environmentReads, tokenReads }),
    disconnect: () => {
      writeToken = null;
    },
    headers,
    initializeCalls: () => initializeCalls,
    invoke: (name: string, event = parent, input?: object | string) =>
      Promise.resolve(handlers.get(`content:${name}`)?.(event, input)),
    invokeSync: (name: string, event: Event, input?: object) =>
      handlers.get(`content:${name}`)?.(event, input),
    lockKeychain: () => {
      keychainLocked = true;
    },
    moveRoot: (replace = true) => {
      const moved = `${root}-moved`;
      fs.renameSync(root, moved);
      roots.push(moved);
      if (replace) {
        fs.cpSync(moved, root, { recursive: true });
      }
      return moved;
    },
    otherParent,
    parent,
    rejectMutation: () => {
      rejectMutation = true;
    },
    removeEnvironment: () => {
      keys = new Map();
    },
    replacements,
    root,
    sends,
    setAdmission: (operation: () => Promise<void>) => {
      admission = operation;
    },
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

test("inline proposals never write; only the native window can save and undo the exact field", async () => {
  const app = setup();
  const begun = await app.invoke("beginInline", app.site, field);
  expect(begun?.ok).toBe(true);
  expect(begun?.value).toBe("Original");
  const editId = begun?.editId;
  expect(typeof editId).toBe("string");
  expect(
    await app.invoke("stageInline", app.site, {
      editId,
      value: "Typed on page",
    })
  ).toEqual({ ok: true });
  expect(app.content.read(field).value).toBe("Original");
  expect(app.content.status().revision).toBe(begun?.revision);
  expect((await app.invoke("commitInline", app.site, editId))?.ok).toBe(false);
  expect((await app.invoke("cancelInline", app.site, editId))?.ok).toBe(false);
  expect((await app.invoke("commitInline", app.otherParent, editId))?.ok).toBe(
    false
  );
  expect((await app.invoke("abandonInline", app.site, editId))?.ok).toBe(false);
  const saved = await app.invoke("commitInline", app.parent, editId);
  expect(saved?.ok).toBe(true);
  expect(app.content.read(field).value).toBe("Typed on page");
  expect(
    (await app.invoke("undo", app.parent, { revision: saved?.revision }))?.ok
  ).toBe(true);
  expect(app.content.read(field).value).toBe("Original");
  expect((await app.invoke("commitInline", app.parent, editId))?.ok).toBe(
    false
  );
  expect(app.headers).toHaveLength(0);
  expect(app.credentialReads()).toEqual({ environmentReads: 0, tokenReads: 0 });
});

test("inline access rejects unknown fields, child frames, forged edits, oversized proposals and pending publication", async () => {
  const app = setup();
  expect(
    (await app.invoke("beginInline", app.site, { ...field, path: "apiKey" }))
      ?.ok
  ).toBe(false);
  expect(
    (await app.invoke("beginInline", { ...app.site, senderFrame: {} }, field))
      ?.ok
  ).toBe(false);
  expect((await app.invoke("beginInline", app.parent, field))?.ok).toBe(false);
  const begun = await app.invoke("beginInline", app.site, field);
  const editId = begun?.editId;
  expect(
    (
      await app.invoke("stageInline", app.site, {
        editId: "forged",
        value: "Wrong",
      })
    )?.ok
  ).toBe(false);
  expect(
    (
      await app.invoke(
        "stageInline",
        { ...app.site, senderFrame: {} },
        { editId, value: "Wrong" }
      )
    )?.ok
  ).toBe(false);
  expect(
    (
      await app.invoke("stageInline", app.site, {
        editId,
        value: "x".repeat(65_537),
      })
    )?.ok
  ).toBe(false);
  expect(
    (await app.invoke("stageInline", app.site, { editId, value: {} }))?.ok
  ).toBe(false);
  await app.invoke("stageInline", app.site, { editId, value: "Pending" });
  expect((await app.invoke("beginInline", app.site, field))?.ok).toBe(false);
  app.setPending({ id: "in-flight" });
  expect((await app.invoke("commitInline", app.parent, editId))?.ok).toBe(
    false
  );
  expect(app.content.read(field).value).toBe("Original");
  expect((await app.invoke("cancelInline", app.parent, editId))?.ok).toBe(true);
  expect((await app.invoke("beginInline", app.site, field))?.ok).toBe(false);
});

test("invalid latest text blocks saving an older accepted proposal until corrected", async () => {
  const app = setup();
  const begun = await app.invoke("beginInline", app.site, field);
  const editId = begun?.editId;
  await app.invoke("stageInline", app.site, {
    editId,
    value: "Earlier valid text",
  });
  await app.invoke("stageInline", app.site, {
    editId,
    value: "x".repeat(65_537),
  });
  expect((await app.invoke("commitInline", app.parent, editId))?.ok).toBe(
    false
  );
  expect(app.content.read(field).value).toBe("Original");
  await app.invoke("stageInline", app.site, {
    editId,
    value: "Corrected text",
  });
  expect((await app.invoke("commitInline", app.parent, editId))?.ok).toBe(true);
  expect(app.content.read(field).value).toBe("Corrected text");
});

test("unsaved inline text excludes competing panel mutations and selection", async () => {
  const app = setup();
  const begun = await app.invoke("beginInline", app.site, field);
  await app.invoke("stageInline", app.site, {
    editId: begun?.editId,
    value: "Keep typing",
  });
  const results = await Promise.all(
    ["save", "undo", "redo", "prepare", "review", "publish", "restore"].map(
      (action) =>
        app.invoke(action, app.parent, {
          ...field,
          revision: begun?.revision,
          value: "Competing",
        })
    )
  );
  for (const reply of results) {
    expect(reply?.ok).toBe(false);
    expect(reply?.message).toContain("Save or discard");
  }
  expect((await app.invoke("select", app.site, field))?.ok).toBe(false);
  expect(app.content.read(field).value).toBe("Original");
  expect(
    (await app.invoke("commitInline", app.parent, begun?.editId))?.ok
  ).toBe(true);
  expect(app.content.read(field).value).toBe("Keep typing");
});

test("a later draft change rejects inline save without losing the proposal or overwriting newer text", async () => {
  const app = setup();
  const begun = await app.invoke("beginInline", app.site, field);
  const editId = begun?.editId;
  await app.invoke("stageInline", app.site, {
    editId,
    value: "Inline proposal",
  });
  app.content.save({
    ...field,
    revision: begun?.revision,
    value: "Newer saved text",
  });
  expect((await app.invoke("commitInline", app.parent, editId))?.ok).toBe(
    false
  );
  expect(app.content.read(field).value).toBe("Newer saved text");
  expect((await app.invoke("abandonInline", app.site, editId))?.ok).toBe(false);
  expect((await app.invoke("cancelInline", app.parent, editId))?.ok).toBe(true);
  expect(app.content.read(field).value).toBe("Newer saved text");
});

test("clean inline reads can be abandoned without changing text or revision", async () => {
  const app = setup();
  const begun = await app.invoke("beginInline", app.site, field);
  expect((await app.invoke("abandonInline", app.site, begun?.editId))?.ok).toBe(
    true
  );
  expect(app.content.read(field)).toEqual({
    revision: begun?.revision,
    value: "Original",
  });
  expect(
    (
      await app.invoke("stageInline", app.site, {
        editId: begun?.editId,
        value: "Late",
      })
    )?.ok
  ).toBe(false);
});

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

for (const change of ["replacement", "move", "session"]) {
  test(`content refuses ${change} while waiting for exclusive admission`, async () => {
    const app = setup();
    const waiting = deferred();
    app.setAdmission(() => waiting.promise);
    const save = app.invoke("save", app.parent, {
      ...field,
      revision: 0,
      value: "Wrong folder",
    });
    if (change === "session") {
      app.changeSession();
    } else {
      app.moveRoot(change === "replacement");
    }
    waiting.resolve();
    expect((await save)?.ok).toBe(false);
    if (change === "replacement") {
      expect(app.content.read(field).value).toBe("Original");
    }
    expect(app.credentialReads()).toEqual({
      environmentReads: 0,
      tokenReads: 0,
    });
    expect(app.headers).toHaveLength(0);
    expect(app.sends).toHaveLength(0);
  });
}

for (const change of ["replacement", "move", "session"]) {
  test(`prepare refuses ${change} during a pending content fetch`, async () => {
    const app = setup();
    const waiting = deferred();
    const entered = deferred();
    app.setFetch(() => {
      entered.resolve();
      return waiting.promise;
    });
    const prepare = app.invoke("prepare");
    await entered.promise;
    const moved =
      change === "session" ? app.root : app.moveRoot(change === "replacement");
    if (change === "session") {
      app.changeSession();
    }
    waiting.resolve();
    expect((await prepare)?.ok).toBe(false);
    expect(app.initializeCalls()).toBe(0);
    expect(createContentStore(moved).read(field).value).toBe("Original");
    if (change === "replacement") {
      expect(app.content.read(field).value).toBe("Original");
    }
    expect(app.sends).toHaveLength(0);
  });
}

for (const change of ["replacement", "move", "session"]) {
  for (const rejected of [false, true]) {
    test(`publication keeps the original pending journal after ${change} during ${rejected ? "rejected" : "successful"} provider response`, async () => {
      const app = setup(true);
      await app.invoke("save", app.parent, {
        ...field,
        revision: 0,
        value: "Published proposal",
      });
      const review = (await app.invoke("review")) as Reply & {
        review: { id: string };
      };
      expect(review.ok).toBe(true);
      const waiting = deferred();
      const entered = deferred();
      app.setFetch(() => {
        if (app.headers.at(-1)?.body) {
          entered.resolve();
          return waiting.promise;
        }
      });
      const publish = app.invoke("publish", app.parent, review.review.id);
      await entered.promise;
      const moved =
        change === "session"
          ? app.root
          : app.moveRoot(change === "replacement");
      if (change === "session") {
        app.changeSession();
      }
      const file = path.join(moved, ".weblab/content-release.json");
      const before = fs.readFileSync(file, "utf8");
      // A rejected response is also unsafe to journal in the replacement root.
      if (rejected) {
        app.rejectMutation();
      }
      waiting.resolve();
      expect((await publish)?.ok).toBe(false);
      expect(fs.readFileSync(file, "utf8")).toBe(before);
      if (change === "replacement") {
        expect(
          fs.readFileSync(
            path.join(app.root, ".weblab/content-release.json"),
            "utf8"
          )
        ).toBe(before);
      }
      expect(
        JSON.parse(
          fs.readFileSync(
            path.join(moved, ".weblab/content-release.json"),
            "utf8"
          )
        ).pending
      ).toBeTruthy();
      expect(createContentStore(moved).read(field).value).toBe(
        "Published proposal"
      );
    });
  }
}

test("inline staging stays synchronous and refuses a replaced source folder", async () => {
  const app = setup();
  const begun = await app.invoke("beginInline", app.site, field);
  const input = { editId: begun?.editId, value: "Synchronous proposal" };
  expect(app.invokeSync("stageInline", app.site, input)).toEqual({ ok: true });
  app.moveRoot();
  expect(app.invokeSync("stageInline", app.site, input)).toMatchObject({
    ok: false,
  });
  expect(app.content.read(field).value).toBe("Original");
});
