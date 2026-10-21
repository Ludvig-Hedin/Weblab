import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import content from "./content.js";

const { buildManifest, createContentStore } = content;
let root: string;
const field = { documentId: "home", path: 'sections[_key=="hero"].title' };

function input() {
  return {
    dataset: "production",
    documents: [
      {
        _id: "home",
        _rev: "revision1",
        _type: "page",
        apiKey: "secret",
        body: [
          {
            _key: "block",
            _type: "block",
            children: [
              { _key: "span", _type: "span", text: "Portable text\n" },
            ],
          },
        ],
        credentials: { text: "secret" },
        link: { label: "Read more", url: "https://example.test" },
        mixed: [
          { _key: "first", title: "Skip mixed arrays too" },
          { title: "No key" },
        ],
        related: { _ref: "other", _type: "reference", title: "Do not follow" },
        sections: [
          {
            _key: "hero",
            _type: "hero",
            description: "Original description",
            title: "First line\nSecond line  ",
          },
          {
            _key: "form",
            _type: "demoForm",
            fields: [{ _key: "field", label: "Email" }],
            title: "Never editable",
          },
        ],
        slug: { current: "home" },
        title: "Home",
        unkeyed: [{ title: "Skip this array" }],
      },
    ],
    projectId: "example1",
  };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "weblab-content-"));
});
afterEach(() => {
  fs.rmSync(root, { force: true, recursive: true });
});

test("extracts only human text with stable keys and preserves exact strings", () => {
  const manifest = buildManifest(input());
  expect(manifest.documents.home.fields).toEqual({
    'body[_key=="block"].children[_key=="span"].text': "Portable text\n",
    "link.label": "Read more",
    'sections[_key=="hero"].description': "Original description",
    'sections[_key=="hero"].title': "First line\nSecond line  ",
    title: "Home",
  });
  expect(JSON.stringify(manifest)).not.toContain("secret");
  expect(manifest.documents.home._rev).toBe("revision1");
});

test("rejects invalid identities, draft documents, duplicates, and ambiguous keys", () => {
  expect(() => buildManifest({ ...input(), projectId: "../other" })).toThrow();
  expect(() => buildManifest({ ...input(), dataset: "bad/path" })).toThrow();
  for (const patch of [
    { _id: "drafts.home" },
    { _id: "versions.release.home" },
    { _id: "__proto__" },
    { _rev: 123 },
    { _type: "form" },
  ]) {
    const value = input();
    Object.assign(value.documents[0], patch);
    expect(() => buildManifest(value)).toThrow();
  }
  const duplicate = input();
  duplicate.documents.push(duplicate.documents[0]);
  expect(() => buildManifest(duplicate)).toThrow();
  const keys = input();
  keys.documents[0].sections[1]._key = "hero";
  expect(() => buildManifest(keys)).toThrow();
});

test("includes formatted paragraph spans while keeping form content blocked", () => {
  const rich = {
    _key: "paragraph",
    _type: "block",
    children: [
      {
        _key: "span",
        _type: "span",
        marks: ["strong"],
        text: "Formatted copy",
      },
    ],
    markDefs: [],
  };
  const source = input();
  const document = {
    ...source.documents[0],
    form: { formattedText: [rich], title: "Protected" },
    formattedText: [rich],
    sections: [{ _key: "demo", _type: "demoForm", formattedText: [rich] }],
  };
  const manifest = buildManifest({ ...source, documents: [document] });
  expect(
    manifest.documents.home.fields[
      'formattedText[_key=="paragraph"].children[_key=="span"].text'
    ]
  ).toBe("Formatted copy");
  expect(
    Object.keys(manifest.documents.home.fields).some(
      (key) => key.startsWith("form.") || key.startsWith("sections")
    )
  ).toBe(false);
  expect(rich.children[0].marks).toEqual(["strong"]);
});

test("saves, reopens, undoes, and redoes only the local draft", () => {
  const store = createContentStore(root);
  expect(store.initialize(input())).toEqual({
    canRedo: false,
    canUndo: false,
    dirtyCount: 0,
    revision: 0,
  });
  const manifestFile = path.join(root, ".weblab/content/manifest.json");
  const originalManifest = fs.readFileSync(manifestFile, "utf8");
  expect(store.save({ ...field, revision: 0, value: "New\ntext" })).toEqual({
    canRedo: false,
    canUndo: true,
    dirtyCount: 1,
    revision: 1,
  });
  const reopened = createContentStore(root);
  expect(reopened.read(field)).toEqual({ revision: 1, value: "New\ntext" });
  expect(reopened.undo({ revision: 1 })).toEqual({
    canRedo: true,
    canUndo: false,
    dirtyCount: 0,
    revision: 2,
  });
  expect(reopened.read(field).value).toBe("First line\nSecond line  ");
  expect(reopened.redo({ revision: 2 }).revision).toBe(3);
  expect(reopened.read(field).value).toBe("New\ntext");
  expect(fs.readFileSync(manifestFile, "utf8")).toBe(originalManifest);
});

test("rejects stale writes from another window without losing the first edit", () => {
  const first = createContentStore(root);
  first.initialize(input());
  const second = createContentStore(root);
  const stale = second.read(field).revision;
  first.save({ ...field, revision: stale, value: "First writer" });
  expect(() =>
    second.save({ ...field, revision: stale, value: "Stale writer" })
  ).toThrow("another editor");
  expect(() => second.undo({ revision: stale })).toThrow("another editor");
  expect(() => second.redo({ revision: stale })).toThrow("another editor");
  expect(first.read(field).value).toBe("First writer");
});

test("requires exact manifest membership and bounded string values", () => {
  const store = createContentStore(root);
  store.initialize(input());
  for (const invalid of [
    { ...field, path: "apiKey", value: "bad" },
    { ...field, documentId: "other", value: "bad" },
    { ...field, path: "sections[0].title", value: "bad" },
    { ...field, value: 123 },
    { ...field, value: "x".repeat(65_537) },
    { ...field, value: "nul\0byte" },
  ]) {
    expect(() => store.save({ ...invalid, revision: 0 })).toThrow();
  }
  expect(store.status().revision).toBe(0);
  expect(store.read(field).value).toBe("First line\nSecond line  ");
});

test("refuses dirty replacement and project mismatch; clean refresh advances revision", () => {
  const store = createContentStore(root);
  store.initialize(input());
  expect(() => store.initialize({ ...input(), dataset: "other" })).toThrow(
    "different"
  );
  store.save({ ...field, revision: 0, value: "Local" });
  expect(() => store.initialize(input())).toThrow("local changes");
  expect(store.read(field).value).toBe("Local");
  store.undo({ revision: 1 });
  expect(store.initialize(input()).revision).toBe(3);
  expect(() =>
    store.save({ ...field, revision: 0, value: "Old view" })
  ).toThrow();
});

test("exposes validated fields and snapshots while status contains no text", () => {
  const store = createContentStore(root);
  store.initialize(input());
  store.save({ ...field, revision: 0, value: "Draft copy" });
  expect(store.fields()).toContainEqual({ ...field, value: "Draft copy" });
  expect(store.snapshot().draft.values.home[field.path]).toBe("Draft copy");
  expect(Object.keys(store.status()).sort()).toEqual([
    "canRedo",
    "canUndo",
    "dirtyCount",
    "revision",
  ]);
});

test("clears a draft only after edited text matches and refreshes untouched fields", () => {
  const store = createContentStore(root);
  store.initialize(input());
  store.save({ ...field, revision: 0, value: "Published edit" });
  const published = input().documents;
  expect(() =>
    store.acceptPublished({ documents: published, revision: 1 })
  ).toThrow("does not match");
  published[0].sections[0].title = "Published edit";
  published[0]._rev = "revision2";
  expect(() =>
    store.acceptPublished({ documents: published, revision: 0 })
  ).toThrow("another editor");
  published[0].title = "Unrelated remote change";

  expect(store.acceptPublished({ documents: published, revision: 1 })).toEqual({
    canRedo: false,
    canUndo: false,
    dirtyCount: 0,
    revision: 2,
  });
  expect(store.snapshot().manifest.documents.home._rev).toBe("revision2");
  expect(store.read({ documentId: "home", path: "title" }).value).toBe(
    "Unrelated remote change"
  );
  expect(store.read(field)).toEqual({ revision: 2, value: "Published edit" });
});

test("refuses locks rather than letting simultaneous writers enter", () => {
  const store = createContentStore(root);
  store.initialize(input());
  const lock = path.join(root, ".weblab/content.lock");
  fs.writeFileSync(lock, "another process");
  expect(() => store.save({ ...field, revision: 0, value: "blocked" })).toThrow(
    "busy"
  );
  expect(fs.readFileSync(lock, "utf8")).toBe("another process");
  fs.unlinkSync(lock);
  expect(store.status().revision).toBe(0);
});

test("rejects symlinked content folders and hard-linked draft files", () => {
  const store = createContentStore(root);
  store.initialize(input());
  const draftPath = path.join(root, ".weblab/content/draft.json");
  fs.linkSync(draftPath, path.join(root, "other-draft.json"));
  expect(() => store.status()).toThrow("content file");
  fs.unlinkSync(path.join(root, "other-draft.json"));
  const realContent = path.join(root, "other-content");
  fs.renameSync(path.dirname(draftPath), realContent);
  fs.symlinkSync(
    realContent,
    path.dirname(draftPath),
    process.platform === "win32" ? "junction" : "dir"
  );
  expect(() => store.status()).toThrow("real local directories");
});

test("rejects tampered and oversized persisted state before exposing a snapshot", () => {
  const store = createContentStore(root);
  store.initialize(input());
  const draftPath = path.join(root, ".weblab/content/draft.json");
  const draft = JSON.parse(fs.readFileSync(draftPath, "utf8"));
  fs.writeFileSync(
    draftPath,
    JSON.stringify({ ...draft, secret: "do not expose" })
  );
  expect(() => store.snapshot()).toThrow("Invalid local content draft");
  fs.writeFileSync(draftPath, " ".repeat(8 * 1024 * 1024 + 1));
  expect(() => store.snapshot()).toThrow("oversized");
});

test("new saves clear redo and returning to the original removes the dirty field", () => {
  const store = createContentStore(root);
  store.initialize(input());
  store.save({ ...field, revision: 0, value: "A" });
  store.undo({ revision: 1 });
  store.save({ ...field, revision: 2, value: "B" });
  expect(store.status().canRedo).toBe(false);
  store.save({ ...field, revision: 3, value: "First line\nSecond line  " });
  expect(store.status().dirtyCount).toBe(0);
  expect(store.snapshot().draft.values).toEqual({});
});

test("a failed atomic save preserves the complete previous draft", () => {
  const store = createContentStore(root);
  store.initialize(input());
  const file = path.join(root, ".weblab/content/draft.json");
  const before = fs.readFileSync(file, "utf8");
  const rename = vi.spyOn(fs, "renameSync").mockImplementation(() => {
    throw new Error("Simulated rename failure");
  });
  try {
    expect(() =>
      store.save({ ...field, revision: 0, value: "Unwritten" })
    ).toThrow("Simulated rename failure");
  } finally {
    rename.mockRestore();
  }
  expect(fs.readFileSync(file, "utf8")).toBe(before);
  expect(fs.readdirSync(path.dirname(file)).sort()).toEqual([
    "draft.json",
    "manifest.json",
  ]);
  expect(store.save({ ...field, revision: 0, value: "Retry" }).revision).toBe(
    1
  );
});

test("a failed snapshot swap restores the previous manifest and revision", () => {
  const store = createContentStore(root);
  store.initialize(input());
  const { renameSync } = fs;
  const rename = vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
    if (String(from).endsWith("content.next")) {
      throw new Error("Simulated snapshot failure");
    }
    return renameSync(from, to);
  });
  const refreshed = input();
  refreshed.documents[0].title = "Different snapshot";
  try {
    expect(() => store.initialize(refreshed)).toThrow(
      "Simulated snapshot failure"
    );
  } finally {
    rename.mockRestore();
  }
  expect(store.read({ documentId: "home", path: "title" })).toEqual({
    revision: 0,
    value: "Home",
  });
});

test("published acceptance preserves the draft when its document disappears or changes type", () => {
  const store = createContentStore(root);
  store.initialize(input());
  store.save({ ...field, revision: 0, value: "Published edit" });
  expect(() => store.acceptPublished({ documents: [], revision: 1 })).toThrow(
    "does not match"
  );
  const { documents } = input();
  documents[0].sections[0].title = "Published edit";
  documents[0]._type = "pressArticle";
  expect(() => store.acceptPublished({ documents, revision: 1 })).toThrow(
    "does not match"
  );
  expect(store.read(field).value).toBe("Published edit");
  expect(store.status().dirtyCount).toBe(1);
});
