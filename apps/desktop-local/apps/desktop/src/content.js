// Local text drafts. This module never contacts a CMS or reads credentials.
const fs = require("node:fs");
const { join, resolve } = require("node:path");
const { randomUUID } = require("node:crypto");

const MAX_FILE = 8 * 1024 * 1024;
const MAX_TEXT = 64 * 1024;
const MAX_FIELDS = 10_000;
const MAX_HISTORY = 100;
const TYPES = new Set(["page", "siteContent", "pressArticle"]);
const TEXT_KEYS = new Set([
  "title",
  "titleSmall",
  "textXl",
  "lead",
  "note",
  "logosLabel",
  "tooltip",
  "privacyNote",
  "text",
  "label",
  "description",
  "question",
  "answer",
  "caption",
  "alt",
  "playLabel",
  "actionLabel",
  "closeLabel",
  "heading",
  "subheading",
  "subtitle",
  "eyebrow",
  "kicker",
  "summary",
  "excerpt",
  "quote",
  "author",
  "role",
  "buttonLabel",
  "linkLabel",
  "ariaLabel",
  "intro",
  "paragraph",
]);
const BLOCKED =
  /secret|password|token|credential|apiKey|private|url|href|slug|email|phone|reference|asset|form/i;
const NAME = /^[A-Za-z][A-Za-z0-9]*$/;
const KEY = /^[A-Za-z0-9_-]{1,128}$/;
const DOCUMENT_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const PROJECT_ID = /^[a-z0-9]{1,64}$/;
const DATASET = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const PATH_PART =
  /^([A-Za-z][A-Za-z0-9]*)(?:\[_key=="([A-Za-z0-9_-]{1,128})"\])?$/;
const FORM_TYPE = /form$/i;
const REFERENCE_TYPE = /reference/i;
const own = (object, key) => Object.hasOwn(object, key);
// This is a rich-text container, not a form or its delivery contract.
const blockedProperty = (key) => key !== "formattedText" && BLOCKED.test(key);

function fail(message) {
  throw new Error(message);
}

function record(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value))
  );
}

function exactKeys(value, keys) {
  return (
    record(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => own(value, key))
  );
}

function validId(id) {
  return (
    typeof id === "string" &&
    DOCUMENT_ID.test(id) &&
    !id.startsWith("drafts.") &&
    !id.startsWith("versions.") &&
    !["__proto__", "prototype", "constructor"].includes(id)
  );
}

function identity(input) {
  if (
    !record(input) ||
    typeof input.projectId !== "string" ||
    !PROJECT_ID.test(input.projectId) ||
    typeof input.dataset !== "string" ||
    !DATASET.test(input.dataset)
  ) {
    fail("Invalid content project or dataset.");
  }
}

function text(value) {
  if (
    typeof value !== "string" ||
    Buffer.byteLength(value, "utf8") > MAX_TEXT ||
    value.includes("\0")
  ) {
    fail("Text must be a string of at most 64 KiB without null characters.");
  }
}

function validPath(path) {
  if (typeof path !== "string" || path.length > 4096) {
    return false;
  }
  const parts = path.split(".");
  return (
    parts.length <= 30 &&
    parts.every((part) => {
      const match = PATH_PART.exec(part);
      return (
        match &&
        !blockedProperty(match[1]) &&
        !["constructor", "prototype"].includes(match[1])
      );
    }) &&
    TEXT_KEYS.has(parts.at(-1))
  );
}

function encode(value) {
  const body = JSON.stringify(value);
  if (Buffer.byteLength(body, "utf8") > MAX_FILE) {
    fail("Local content exceeds the 8 MiB file limit.");
  }
  return body;
}

function visitArray(value, path, depth, budget, fields) {
  // Never address arrays by index: reordering would silently retarget an edit.
  if (
    !value.every(
      (item) =>
        record(item) && typeof item._key === "string" && KEY.test(item._key)
    )
  ) {
    return;
  }
  const keys = new Set();
  for (const item of value) {
    if (keys.has(item._key)) {
      fail("Duplicate content array key.");
    }
    keys.add(item._key);
    visitContent(
      item,
      `${path}[_key=="${item._key}"]`,
      depth + 1,
      budget,
      fields
    );
  }
}

function visitProperty(key, child, path, depth, budget, fields) {
  if (
    !NAME.test(key) ||
    blockedProperty(key) ||
    ["constructor", "prototype"].includes(key)
  ) {
    return;
  }
  const childPath = path ? `${path}.${key}` : key;
  if (typeof child === "string" && TEXT_KEYS.has(key)) {
    text(child);
    if (!validPath(childPath)) {
      fail("Invalid content field path.");
    }
    budget.fields += 1;
    if (budget.fields > MAX_FIELDS) {
      fail("Too many editable content fields.");
    }
    fields[childPath] = child;
  } else if (child !== null && typeof child === "object") {
    visitContent(child, childPath, depth + 1, budget, fields);
  }
}

function visitContent(value, path, depth, budget, fields) {
  budget.nodes += 1;
  if (budget.nodes > 100_000 || depth > 30) {
    fail("Content is too deeply nested or too large.");
  }
  if (Array.isArray(value)) {
    visitArray(value, path, depth, budget, fields);
    return;
  }
  if (
    !record(value) ||
    FORM_TYPE.test(value._type ?? "") ||
    own(value, "_ref") ||
    REFERENCE_TYPE.test(value._type ?? "")
  ) {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    visitProperty(key, child, path, depth, budget, fields);
  }
}

/** Reduce published documents to reviewed, human text fields only. */
function buildManifest(input) {
  identity(input);
  if (!Array.isArray(input.documents) || input.documents.length > 250) {
    fail("Expected at most 250 published documents.");
  }
  const documents = Object.create(null);
  const budget = { fields: 0, nodes: 0 };
  for (const document of input.documents) {
    if (
      !(record(document) && validId(document._id)) ||
      typeof document._rev !== "string" ||
      !KEY.test(document._rev) ||
      !TYPES.has(document._type)
    ) {
      fail("Invalid published content document.");
    }
    if (own(documents, document._id)) {
      fail("Duplicate content document.");
    }
    const fields = Object.create(null);
    visitContent(document, "", 0, budget, fields);
    documents[document._id] = {
      _rev: document._rev,
      _type: document._type,
      fields,
    };
  }
  const manifest = {
    dataset: input.dataset,
    documents,
    projectId: input.projectId,
    version: 1,
  };
  encode(manifest);
  return manifest;
}

function validateManifest(manifest) {
  identity(manifest);
  if (
    !exactKeys(manifest, ["version", "projectId", "dataset", "documents"]) ||
    manifest.version !== 1 ||
    !record(manifest.documents) ||
    Object.keys(manifest.documents).length > 250
  ) {
    fail("Invalid local content manifest.");
  }
  let count = 0;
  for (const [id, document] of Object.entries(manifest.documents)) {
    if (
      !(validId(id) && exactKeys(document, ["_rev", "_type", "fields"])) ||
      typeof document._rev !== "string" ||
      !KEY.test(document._rev) ||
      !TYPES.has(document._type) ||
      !record(document.fields)
    ) {
      fail("Invalid local content document.");
    }
    for (const [path, value] of Object.entries(document.fields)) {
      count += 1;
      if (!validPath(path) || count > MAX_FIELDS) {
        fail("Invalid local content field.");
      }
      text(value);
    }
  }
}

function original(manifest, documentId, path) {
  if (
    !(
      validId(documentId) &&
      validPath(path) &&
      own(manifest.documents, documentId) &&
      own(manifest.documents[documentId].fields, path)
    )
  ) {
    fail("This text field is not in the content manifest.");
  }
  return manifest.documents[documentId].fields[path];
}

function valueAt(manifest, draft, documentId, path) {
  const initial = original(manifest, documentId, path);
  return own(draft.values, documentId) && own(draft.values[documentId], path)
    ? draft.values[documentId][path]
    : initial;
}

function put(manifest, draft, documentId, path, value) {
  if (value === original(manifest, documentId, path)) {
    if (own(draft.values, documentId)) {
      delete draft.values[documentId][path];
      if (!Object.keys(draft.values[documentId]).length) {
        delete draft.values[documentId];
      }
    }
  } else {
    if (!own(draft.values, documentId)) {
      draft.values[documentId] = Object.create(null);
    }
    draft.values[documentId][path] = value;
  }
}

function validateDraft(manifest, draft) {
  if (
    !exactKeys(draft, ["version", "revision", "values", "history", "future"]) ||
    draft.version !== 1 ||
    !Number.isSafeInteger(draft.revision) ||
    draft.revision < 0 ||
    !record(draft.values) ||
    !Array.isArray(draft.history) ||
    !Array.isArray(draft.future) ||
    draft.history.length + draft.future.length > MAX_HISTORY
  ) {
    fail("Invalid local content draft.");
  }
  for (const [id, fields] of Object.entries(draft.values)) {
    if (
      !(
        validId(id) &&
        own(manifest.documents, id) &&
        record(fields) &&
        Object.keys(fields).length
      )
    ) {
      fail("Invalid draft text fields.");
    }
    for (const [path, value] of Object.entries(fields)) {
      if (value === original(manifest, id, path)) {
        fail("Draft text does not differ from its original.");
      }
      text(value);
    }
  }
  for (const change of [...draft.history, ...draft.future]) {
    if (!exactKeys(change, ["documentId", "path", "before", "after"])) {
      fail("Invalid draft history.");
    }
    original(manifest, change.documentId, change.path);
    text(change.before);
    text(change.after);
  }
}

function validatePublished(manifest, draft, published) {
  for (const [id, fields] of Object.entries(draft.values)) {
    const actual = published.documents[id];
    if (!actual || actual._type !== manifest.documents[id]._type) {
      fail("Published document type does not match this draft.");
    }
    for (const [path, value] of Object.entries(fields)) {
      if (!own(actual.fields, path) || actual.fields[path] !== value) {
        fail(
          "Published text does not match this draft. Local changes were kept."
        );
      }
    }
  }
}

function summary(draft) {
  return {
    canRedo: draft.future.length > 0,
    canUndo: draft.history.length > 0,
    dirtyCount: Object.values(draft.values).reduce(
      (count, fields) => count + Object.keys(fields).length,
      0
    ),
    revision: draft.revision,
  };
}

function stat(path) {
  try {
    return fs.lstatSync(path);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function directory(path, create = false) {
  let info = stat(path);
  if (!info && create) {
    fs.mkdirSync(path, { mode: 0o700 });
    info = fs.lstatSync(path);
  }
  if (!info || info.isSymbolicLink() || !info.isDirectory()) {
    fail("Content folders must be real local directories.");
  }
}

function readJson(path) {
  const info = stat(path);
  if (
    !info?.isFile() ||
    info.isSymbolicLink() ||
    info.nlink !== 1 ||
    info.size > MAX_FILE
  ) {
    fail("Invalid or oversized local content file.");
  }
  // biome-ignore lint/suspicious/noBitwiseOperators: Node file-open flags are a bit mask.
  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0);
  const fd = fs.openSync(path, flags);
  try {
    const opened = fs.fstatSync(fd);
    if (
      !opened.isFile() ||
      opened.nlink !== 1 ||
      opened.size > MAX_FILE ||
      opened.ino !== info.ino ||
      opened.dev !== info.dev
    ) {
      fail("Local content file changed while opening.");
    }
    const body = Buffer.alloc(MAX_FILE + 1);
    let length = 0;
    while (length < body.length) {
      const count = fs.readSync(fd, body, length, body.length - length, null);
      if (count === 0) {
        break;
      }
      length += count;
    }
    if (length > MAX_FILE) {
      fail("Local content file is too large.");
    }
    return JSON.parse(body.subarray(0, length).toString("utf8"));
  } finally {
    fs.closeSync(fd);
  }
}

function writeNew(path, value) {
  const body = encode(value);
  const fd = fs.openSync(path, "wx", 0o600);
  try {
    fs.writeFileSync(fd, body);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

/** A process-wide lock also prevents two native editor windows from racing. */
function createContentStore(root) {
  if (typeof root !== "string" || !root) {
    fail("A local project folder is required.");
  }
  const requested = resolve(root);
  directory(requested);
  const base = fs.realpathSync(requested);
  const parent = join(base, ".weblab");
  const content = join(parent, "content");
  const previous = join(parent, "content.previous");
  const next = join(parent, "content.next");
  const lock = join(parent, "content.lock");

  function removeOwnedFolder(path) {
    directory(path);
    const names = fs.readdirSync(path);
    if (names.some((name) => !["manifest.json", "draft.json"].includes(name))) {
      fail("Unexpected file in content recovery folder.");
    }
    for (const name of names) {
      readJson(join(path, name));
      fs.unlinkSync(join(path, name));
    }
    fs.rmdirSync(path);
  }

  function locked(run) {
    directory(base);
    directory(parent, true);
    let fd;
    try {
      fd = fs.openSync(lock, "wx", 0o600);
    } catch (error) {
      if (error.code === "EEXIST") {
        fail(
          "Content is busy in another editor, or a previous operation was interrupted."
        );
      }
      throw error;
    }
    try {
      // Recover only our fixed, validated directories. A killed process leaves
      // its lock in place; we never guess whether that writer is still alive.
      if (stat(previous)) {
        directory(previous);
        if (stat(content)) {
          removeOwnedFolder(previous);
        } else {
          fs.renameSync(previous, content);
        }
      }
      if (stat(next)) {
        removeOwnedFolder(next);
      }
      return run();
    } finally {
      fs.closeSync(fd);
      fs.unlinkSync(lock);
    }
  }

  function load() {
    directory(content);
    const manifest = readJson(join(content, "manifest.json"));
    const draft = readJson(join(content, "draft.json"));
    validateManifest(manifest);
    validateDraft(manifest, draft);
    return { draft, manifest };
  }

  function checkRevision(draft, revision) {
    if (!Number.isSafeInteger(revision) || revision !== draft.revision) {
      fail(
        "Content changed in another editor. Reload the field before saving."
      );
    }
  }

  function persist(draft) {
    if (draft.revision >= Number.MAX_SAFE_INTEGER) {
      fail("Local content revision limit reached.");
    }
    draft.revision += 1;
    const temp = join(content, `.draft-${randomUUID()}.tmp`);
    try {
      writeNew(temp, draft);
      readJson(join(content, "draft.json"));
      fs.renameSync(temp, join(content, "draft.json"));
    } finally {
      if (stat(temp)) {
        fs.unlinkSync(temp);
      }
    }
    return summary(draft);
  }

  function replace(manifest, draft) {
    directory(next, true);
    try {
      writeNew(join(next, "manifest.json"), manifest);
      writeNew(join(next, "draft.json"), draft);
      if (stat(content)) {
        fs.renameSync(content, previous);
      }
      try {
        fs.renameSync(next, content);
      } catch (error) {
        if (stat(previous)) {
          fs.renameSync(previous, content);
        }
        throw error;
      }
      if (stat(previous)) {
        removeOwnedFolder(previous);
      }
    } finally {
      if (stat(next)) {
        removeOwnedFolder(next);
      }
    }
    return summary(draft);
  }

  return {
    // The caller supplies an independently verified published read. This only
    // accepts that read locally; it has no authority or transport to publish.
    acceptPublished({ revision, documents }) {
      return locked(() => {
        const { manifest, draft } = load();
        checkRevision(draft, revision);
        if (revision >= Number.MAX_SAFE_INTEGER) {
          fail("Local content revision limit reached.");
        }
        const published = buildManifest({
          dataset: manifest.dataset,
          documents,
          projectId: manifest.projectId,
        });
        validatePublished(manifest, draft, published);
        return replace(published, {
          future: [],
          history: [],
          revision: revision + 1,
          values: {},
          version: 1,
        });
      });
    },
    fields() {
      return locked(() => {
        const { manifest, draft } = load();
        return Object.entries(manifest.documents).flatMap(
          ([documentId, document]) =>
            Object.keys(document.fields).map((path) => ({
              documentId,
              path,
              value: valueAt(manifest, draft, documentId, path),
            }))
        );
      });
    },
    initialize(input) {
      const manifest = buildManifest(input);
      return locked(() => {
        let revision = 0;
        if (stat(content)) {
          const existing = load();
          if (
            existing.manifest.projectId !== manifest.projectId ||
            existing.manifest.dataset !== manifest.dataset
          ) {
            fail(
              "This draft belongs to a different content project or dataset."
            );
          }
          if (summary(existing.draft).dirtyCount) {
            fail(
              "Undo the local changes before replacing the content snapshot."
            );
          }
          if (existing.draft.revision >= Number.MAX_SAFE_INTEGER) {
            fail("Local content revision limit reached.");
          }
          revision = existing.draft.revision + 1;
        }
        const draft = {
          future: [],
          history: [],
          revision,
          values: {},
          version: 1,
        };
        return replace(manifest, draft);
      });
    },
    read({ documentId, path }) {
      return locked(() => {
        const { manifest, draft } = load();
        return {
          revision: draft.revision,
          value: valueAt(manifest, draft, documentId, path),
        };
      });
    },
    redo({ revision }) {
      return locked(() => {
        const { manifest, draft } = load();
        checkRevision(draft, revision);
        const change = draft.future.pop();
        if (!change) {
          return summary(draft);
        }
        if (
          valueAt(manifest, draft, change.documentId, change.path) !==
          change.before
        ) {
          fail("Draft history does not match the current text.");
        }
        put(manifest, draft, change.documentId, change.path, change.after);
        draft.history.push(change);
        return persist(draft);
      });
    },
    save({ documentId, path, value, revision }) {
      text(value);
      return locked(() => {
        const { manifest, draft } = load();
        checkRevision(draft, revision);
        const before = valueAt(manifest, draft, documentId, path);
        if (before === value) {
          return summary(draft);
        }
        put(manifest, draft, documentId, path, value);
        draft.history.push({ after: value, before, documentId, path });
        draft.history = draft.history.slice(-MAX_HISTORY);
        draft.future = [];
        return persist(draft);
      });
    },
    snapshot() {
      return locked(load);
    },
    status() {
      return locked(() => summary(load().draft));
    },
    undo({ revision }) {
      return locked(() => {
        const { manifest, draft } = load();
        checkRevision(draft, revision);
        const change = draft.history.pop();
        if (!change) {
          return summary(draft);
        }
        if (
          valueAt(manifest, draft, change.documentId, change.path) !==
          change.after
        ) {
          fail("Draft history does not match the current text.");
        }
        put(manifest, draft, change.documentId, change.path, change.before);
        draft.future.push(change);
        return persist(draft);
      });
    },
  };
}

module.exports = { buildManifest, createContentStore };
