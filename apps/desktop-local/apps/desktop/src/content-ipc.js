// Content credentials stay in main. The website can select and propose known
// text fields; only the native window can save, undo or publish them.
const { ipcMain } = require("electron");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const { join } = require("node:path");
const sites = require("./sites");
const { localKeys } = require("./deploy");
const { createContentStore } = require("./content");
const credentials = require("./content-credentials");
const { createContentPublisher } = require("./content-publish");

const PROJECT_ID = /^[a-z0-9]{1,32}$/;
const DATASET = /^[a-zA-Z0-9_-]{1,64}$/;
function connection(root, verify = () => undefined) {
  verify();
  const keys = localKeys(root);
  const projectId = keys.get("NEXT_PUBLIC_SANITY_PROJECT_ID");
  const dataset = keys.get("NEXT_PUBLIC_SANITY_DATASET");
  const token = keys.get("SANITY_API_READ_TOKEN");
  if (
    !(PROJECT_ID.test(projectId || "") && DATASET.test(dataset || "") && token)
  ) {
    throw new Error(
      "This site needs its Sanity read connection before text editing can start."
    );
  }
  return { dataset, projectId, token };
}

async function publishedDocuments(
  root,
  includeDrafts = false,
  pinned = null,
  verify = () => undefined
) {
  verify();
  const { projectId, dataset, token } = pinned || connection(root, verify);
  const query =
    '*[_type in ["page", "siteContent", "pressArticle"] && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0...251]';
  const url = new URL(
    `https://${projectId}.api.sanity.io/v2025-02-19/data/query/${dataset}`
  );
  url.searchParams.set("query", query);
  url.searchParams.set("perspective", "published");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  verify();
  if (!response.ok) {
    throw new Error(
      `Sanity could not load published content (${response.status}).`
    );
  }
  const text = await response.text();
  verify();
  if (text.length > 8 * 1024 * 1024) {
    throw new Error("This site's content is too large for local editing.");
  }
  const documents = JSON.parse(text).result;
  if (!Array.isArray(documents) || documents.length > 250) {
    throw new Error("The complete content list could not be loaded.");
  }
  let draftIds = [];
  if (includeDrafts) {
    url.searchParams.set(
      "query",
      '*[_id in path("drafts.**") && _type in ["page", "siteContent", "pressArticle"]][0...251]._id'
    );
    url.searchParams.set("perspective", "raw");
    verify();
    const drafts = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    verify();
    if (!drafts.ok) {
      throw new Error("Sanity drafts could not be checked.");
    }
    draftIds = (await drafts.json()).result;
    verify();
    if (!Array.isArray(draftIds) || draftIds.length > 250) {
      throw new Error("Sanity drafts could not be checked completely.");
    }
  }
  return { dataset, documents, draftIds, projectId };
}

function register(ctx) {
  const { exclusive } = require("./site-operation");
  const stores = new Map();
  const inline = new WeakMap();
  function bound(event, editor = false) {
    const session = ctx.sessionFor(event);
    const sender = editor
      ? session?.editorView?.webContents
      : session?.win.webContents;
    if (
      !session ||
      event.sender !== sender ||
      (event.senderFrame && event.senderFrame !== sender.mainFrame)
    ) {
      throw new Error("Open content editing from this site's window.");
    }
    const site = session.runner.boundSite;
    if (!site || site.id !== session.openSiteId) {
      throw new Error("Open a site first.");
    }
    const verify = () => {
      if (
        ctx.sessionFor(event) !== session ||
        session.openSiteId !== site.id ||
        (editor ? session.editorView?.webContents : session.win.webContents) !==
          sender ||
        session.runner.boundSite?.path !== site.path ||
        session.runner.boundSite?._location?.generation !==
          site._location?.generation
      ) {
        throw new Error("The open site changed.");
      }
      sites.checkVerifiedSite(site);
    };
    verify();
    return { session, site, verify };
  }
  function store(root) {
    if (!stores.has(root)) {
      stores.set(root, createContentStore(root));
    }
    return stores.get(root);
  }
  function configured(root) {
    return fs.existsSync(join(root, ".weblab/content/manifest.json"));
  }
  function status(root) {
    if (!configured(root)) {
      return { configured: false, dirtyCount: 0, fields: [] };
    }
    const state = store(root).status();
    const { manifest } = store(root).snapshot();
    let connected = false;
    try {
      connected = credentials.has(manifest);
    } catch {
      // Broken connection storage must not block access to local text drafts.
    }
    return {
      ...state,
      configured: true,
      connected,
      fields: store(root).fields(),
      publishing: localPublisher(root).status(),
    };
  }
  function localPublisher(root) {
    const offline = () => {
      throw new Error("This local status read cannot contact Sanity.");
    };
    return createContentPublisher({
      provider: { documents: offline, mutate: offline },
      root,
      store: store(root),
    });
  }
  function publisher(root, verify) {
    const pinned = connection(root, verify);
    verify();
    const writeToken = credentials.token(pinned);
    return createContentPublisher({
      provider: {
        documents: () => publishedDocuments(root, true, pinned, verify),
        mutate: async (mutations, transactionId) => {
          verify();
          const config = pinned;
          const token = writeToken;
          if (!token) {
            throw Object.assign(
              new Error("Connect a Sanity write token before publishing text."),
              { definitelyRejected: true }
            );
          }
          const url = new URL(
            `https://${config.projectId}.api.sanity.io/v2025-02-19/data/mutate/${config.dataset}`
          );
          url.searchParams.set("visibility", "sync");
          url.searchParams.set("returnIds", "true");
          const response = await fetch(url, {
            body: JSON.stringify({ mutations, transactionId }),
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            method: "POST",
            redirect: "error",
            signal: AbortSignal.timeout(30_000),
          });
          verify();
          if (!response.ok) {
            const error = new Error(
              response.status === 409
                ? "Online text changed. Refresh before publishing."
                : `Sanity did not confirm publication (${response.status}).`
            );
            error.definitelyRejected = [400, 401, 403, 409, 422].includes(
              response.status
            );
            throw error;
          }
        },
      },
      root,
      store: store(root),
      verify,
    });
  }

  function handle(name, operation) {
    ipcMain.handle(`content:${name}`, async (event, input) => {
      try {
        const { session, site, verify } = bound(event);
        if (
          !["status", "read", "commitInline", "cancelInline"].includes(name) &&
          hasPending(session)
        ) {
          throw new Error("Save or discard the page text first.");
        }
        const perform = () => {
          verify();
          return sites.withVerified(site, () =>
            operation(session, site, input, verify)
          );
        };
        const result = ["status", "read"].includes(name)
          ? await perform()
          : await exclusive(site.path, perform);
        return { ok: true, ...result };
      } catch (error) {
        return {
          message: error.message || "The text change could not be saved.",
          ok: false,
        };
      }
    });
  }
  function inlineState(session, pending, phase, summary = {}) {
    ctx.send(session, "content:inline", {
      ...summary,
      dirty: Boolean(pending.invalid || pending.value !== pending.original),
      editId: pending.editId,
      phase,
      revision: summary.revision ?? pending.revision,
      siteId: pending.siteId,
    });
  }
  function endInline(session, phase = "cancelled", summary = {}) {
    const pending = inline.get(session);
    if (!pending) {
      return;
    }
    inline.delete(session);
    session.editorView?.webContents.send("content:inlineEnd", {
      editId: pending.editId,
    });
    inlineState(
      session,
      { ...pending, invalid: false, value: pending.original },
      phase,
      summary
    );
    ctx.inlineSettled?.(session);
  }
  function hasPending(session) {
    const pending = inline.get(session);
    return Boolean(
      pending && (pending.invalid || pending.value !== pending.original)
    );
  }
  function pendingInline(session, site, editId) {
    const pending = inline.get(session);
    if (
      !pending ||
      pending.editId !== editId ||
      pending.siteId !== site.id ||
      pending.root !== site.path ||
      pending.generation !== site._location.generation ||
      pending.sender !== session.editorView?.webContents
    ) {
      throw new Error("This text edit has ended. Select the text again.");
    }
    return pending;
  }
  function editorHandle(name, operation) {
    ipcMain.handle(`content:${name}`, (event, input) => {
      try {
        const { session, site, verify } = bound(event, true);
        return sites.withVerified(site, () => {
          verify();
          return { ok: true, ...operation(session, site, input) };
        });
      } catch (error) {
        return {
          message: error.message || "This text could not be edited.",
          ok: false,
        };
      }
    });
  }
  editorHandle("beginInline", (session, site, input) => {
    if (localPublisher(site.path).status().pending) {
      throw new Error("Check the pending text publish before editing again.");
    }
    const existing = inline.get(session);
    if (
      existing &&
      (existing.invalid || existing.value !== existing.original)
    ) {
      throw new Error(
        "Save or discard the current text before editing another field."
      );
    }
    const field = store(site.path).read(input);
    endInline(session);
    const pending = {
      documentId: input.documentId,
      editId: randomUUID(),
      generation: site._location.generation,
      original: field.value,
      path: input.path,
      revision: field.revision,
      root: site.path,
      sender: session.editorView.webContents,
      siteId: site.id,
      value: field.value,
    };
    inline.set(session, pending);
    inlineState(session, pending, "editing");
    return { editId: pending.editId, ...field };
  });
  editorHandle("stageInline", (session, site, input) => {
    const pending = pendingInline(session, site, input?.editId);
    if (typeof input.value !== "string" || input.value.length > 64 * 1024) {
      pending.invalid = true;
      inlineState(session, pending, "staged");
      throw new Error("Text must be shorter than 64,000 characters.");
    }
    // Synchronous: every input proposal reaches main before a later Save click.
    // This never writes a file or contacts the content provider.
    pending.value = input.value;
    pending.invalid = false;
    inlineState(session, pending, "staged");
    return {};
  });
  editorHandle("abandonInline", (session, site, editId) => {
    const pending = pendingInline(session, site, editId);
    if (pending.invalid || pending.value !== pending.original) {
      throw new Error("Save or discard the text in the app first.");
    }
    endInline(session);
    return {};
  });
  handle("commitInline", (session, site, editId) => {
    const pending = pendingInline(session, site, editId);
    if (pending.invalid) {
      throw new Error(
        "The latest text is not valid. Fix it on the page or discard it."
      );
    }
    if (localPublisher(site.path).status().pending) {
      throw new Error("Check the pending text publish before editing again.");
    }
    const result = store(site.path).save(pending);
    endInline(session, "saved", result);
    session.editorView?.webContents.send("content:changed");
    return result;
  });
  handle("cancelInline", (session, site, editId) => {
    pendingInline(session, site, editId);
    endInline(session);
    session.editorView?.webContents.send("content:changed");
    return {};
  });
  handle("status", (_session, site) => status(site.path));
  handle("prepare", async (session, site, _input, verify) => {
    if (!fs.existsSync(join(site.path, "src/sanity/weblab.ts"))) {
      throw new Error(
        "This site needs the local content adapter before text editing can start."
      );
    }
    const source = await publishedDocuments(site.path, false, null, verify);
    verify();
    store(site.path).initialize(source);
    await session.runner.open(site);
    verify();
    return status(site.path);
  });
  handle("connect", (_session, site, value) =>
    credentials.connect(connection(site.path), value)
  );
  handle("replaceConnection", (_session, site, value) => {
    const pinned = connection(site.path);
    const { manifest } = store(site.path).snapshot();
    if (
      pinned.projectId !== manifest.projectId ||
      pinned.dataset !== manifest.dataset
    ) {
      throw new Error(
        "The content connection changed. Reopen this site's settings."
      );
    }
    return credentials.replace(pinned, value);
  });
  for (const action of ["review", "publish", "reconcile", "restore"]) {
    handle(action, async (session, site, input, verify) => {
      if (
        ["review", "publish"].includes(action) &&
        !credentials.token(connection(site.path))
      ) {
        throw Object.assign(
          new Error("Connect a Sanity write token before publishing text."),
          { definitelyRejected: true }
        );
      }
      const result = await publisher(site.path, verify)[action](input);
      verify();
      if (action !== "review") {
        session.editorView?.webContents.send("content:changed");
      }
      return result;
    });
  }
  handle("read", (_session, site, input) => store(site.path).read(input));
  for (const operation of ["save", "undo", "redo"]) {
    handle(operation, (session, site, input) => {
      if (localPublisher(site.path).status().pending) {
        throw new Error("Check the pending text publish before editing again.");
      }
      const result = store(site.path)[operation](input);
      session.editorView?.webContents.send("content:changed");
      return result;
    });
  }
  ipcMain.handle("content:select", (event, input) => {
    try {
      const { session, site } = bound(event, true);
      if (hasPending(session)) {
        throw new Error("Save or discard the page text first.");
      }
      store(site.path).read(input);
      ctx.send(session, "content:selected", {
        documentId: input.documentId,
        path: input.path,
      });
      return { ok: true };
    } catch (error) {
      return {
        message:
          error.message || "This text is not available for local editing.",
        ok: false,
      };
    }
  });
  return {
    hasPending,
    reset: endInline,
  };
}

module.exports = { connection, publishedDocuments, register };
