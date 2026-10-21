import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import content from "./content.js";
import publishing from "./content-publish.js";

const { createContentStore } = content;
const { createContentPublisher } = publishing;
let root: string;
const movedRoots: string[] = [];
interface Patch {
  patch: { id: string; ifRevisionID: string; set: Record<string, string> };
}

function fixture(verify = () => undefined) {
  const remote = {
    dataset: "production",
    documents: [
      {
        _id: "home",
        _rev: "revision1",
        _type: "page",
        description: "Keep",
        title: "Original",
      },
      {
        _id: "about",
        _rev: "about1",
        _type: "page",
        description: "About description",
        title: "About original",
      },
    ],
    draftIds: [] as string[],
    projectId: "project1",
  };
  const store = createContentStore(root);
  store.initialize(remote);
  const provider = {
    documents: vi.fn(async () => structuredClone(remote)),
    mutate: vi.fn((mutations: Patch[], _transactionId: string) => {
      for (const { patch } of mutations) {
        const doc = remote.documents.find(
          (document) => document._id === patch.id
        );
        if (!doc || doc._rev !== patch.ifRevisionID) {
          throw Object.assign(new Error("Revision conflict"), {
            definitelyRejected: true,
          });
        }
      }
      for (const { patch } of mutations) {
        const doc = remote.documents.find(
          (document) => document._id === patch.id
        );
        if (!doc) {
          throw new Error("Missing fixture");
        }
        Object.assign(doc, patch.set, { _rev: `${doc._rev}x` });
      }
      return Promise.resolve();
    }),
  };
  const publisher = createContentPublisher({ provider, root, store, verify });
  function edit(value = "Edited") {
    return store.save({
      documentId: "home",
      path: "title",
      revision: store.status().revision,
      value,
    });
  }
  return { edit, provider, publisher, remote, store };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "weblab-content-publish-"));
});
afterEach(() => {
  fs.rmSync(root, { force: true, recursive: true });
  for (const moved of movedRoots.splice(0)) {
    fs.rmSync(moved, { force: true, recursive: true });
  }
});

test("publishes exactly reviewed fields with the original document revision", async () => {
  const f = fixture();
  f.edit();
  const { review } = await f.publisher.review();
  expect(f.provider.mutate).not.toHaveBeenCalled();
  expect(review.changes).toEqual([
    { after: "Edited", before: "Original", documentId: "home", path: "title" },
  ]);
  const result = await f.publisher.publish(review.id);
  expect(result.published).toBe(true);
  expect(f.provider.mutate).toHaveBeenCalledWith(
    [
      {
        patch: {
          id: "home",
          ifRevisionID: "revision1",
          set: { title: "Edited" },
        },
      },
    ],
    expect.any(String)
  );
  expect(f.remote.documents[0].description).toBe("Keep");
  expect(f.store.status().dirtyCount).toBe(0);
  expect(f.publisher.status().pending).toBe(false);
});

test("stale local review cannot publish a newer draft", async () => {
  const f = fixture();
  f.edit();
  const { review } = await f.publisher.review();
  f.edit("Newer local text");
  await expect(f.publisher.publish(review.id)).rejects.toThrow(
    "Review these text changes again"
  );
  expect(f.provider.mutate).not.toHaveBeenCalled();
  expect(f.store.read({ documentId: "home", path: "title" }).value).toBe(
    "Newer local text"
  );
});

test("a changed online revision blocks review and publish", async () => {
  const f = fixture();
  f.edit();
  f.remote.documents[0]._rev = "revision2";
  await expect(f.publisher.review()).rejects.toThrow(
    "changed this text online"
  );
  f.remote.documents[0]._rev = "revision1";
  const { review } = await f.publisher.review();
  f.remote.documents[0]._rev = "revision2";
  await expect(f.publisher.publish(review.id)).rejects.toThrow(
    "changed this text online"
  );
  expect(f.provider.mutate).not.toHaveBeenCalled();
});

test("an existing Sanity draft blocks this publication path", async () => {
  const f = fixture();
  f.edit();
  f.remote.draftIds = ["drafts.home"];
  await expect(f.publisher.review()).rejects.toThrow("draft in Sanity");
  f.remote.draftIds = [];
  const { review } = await f.publisher.review();
  f.remote.draftIds = ["drafts.home"];
  await expect(f.publisher.publish(review.id)).rejects.toThrow(
    "draft in Sanity"
  );
  expect(f.provider.mutate).not.toHaveBeenCalled();
});

test("uncertain mutation responses keep intent and reconcile without a second write", async () => {
  const f = fixture();
  f.edit();
  const { review } = await f.publisher.review();
  const apply = f.provider.mutate.getMockImplementation();
  f.provider.mutate.mockImplementationOnce(async (mutations, id) => {
    await apply?.(mutations, id);
    throw new Error("Connection closed after send");
  });
  await expect(f.publisher.publish(review.id)).rejects.toThrow(
    "Connection closed"
  );
  expect(f.publisher.status().pending).toBe(true);
  await expect(f.publisher.publish(review.id)).rejects.toThrow("pending");
  const reopened = createContentPublisher({
    provider: f.provider,
    root,
    store: createContentStore(root),
  });
  expect((await reopened.reconcile()).published).toBe(true);
  expect(f.provider.mutate).toHaveBeenCalledTimes(1);
  expect(reopened.status().pending).toBe(false);
});

test("unconfirmed remote values retain both pending intent and the local draft", async () => {
  const f = fixture();
  f.edit();
  const { review } = await f.publisher.review();
  f.provider.mutate.mockRejectedValueOnce(new Error("Unknown network outcome"));
  await expect(f.publisher.publish(review.id)).rejects.toThrow(
    "Unknown network"
  );
  await expect(f.publisher.reconcile()).rejects.toThrow("not confirmed");
  expect(f.store.status().dirtyCount).toBe(1);
  expect(f.publisher.status().pending).toBe(true);
  expect(f.provider.mutate).toHaveBeenCalledTimes(1);
});

test("a definite provider rejection leaves edits but does not lock out retry", async () => {
  const f = fixture();
  f.edit();
  const { review } = await f.publisher.review();
  f.provider.mutate.mockRejectedValueOnce(
    Object.assign(new Error("Forbidden"), { definitelyRejected: true })
  );
  await expect(f.publisher.publish(review.id)).rejects.toThrow("Forbidden");
  expect(f.publisher.status().pending).toBe(false);
  expect(f.store.status().dirtyCount).toBe(1);
  expect((await f.publisher.publish(review.id)).published).toBe(true);
});

test("remote success cannot erase local changes made during publication", async () => {
  const f = fixture();
  f.edit();
  const { review } = await f.publisher.review();
  const apply = f.provider.mutate.getMockImplementation();
  f.provider.mutate.mockImplementationOnce(async (mutations, id) => {
    await apply?.(mutations, id);
    f.edit("Later local work");
  });
  await expect(f.publisher.publish(review.id)).rejects.toThrow(
    "local draft changed"
  );
  expect(f.store.read({ documentId: "home", path: "title" }).value).toBe(
    "Later local work"
  );
  expect(f.publisher.status().pending).toBe(true);
});

test("restore creates a new reviewable local draft without writing to Sanity", async () => {
  const f = fixture();
  f.edit();
  const { review } = await f.publisher.review();
  await f.publisher.publish(review.id);
  const result = await f.publisher.restore();
  expect(result.dirtyCount).toBe(1);
  expect(f.store.read({ documentId: "home", path: "title" }).value).toBe(
    "Original"
  );
  expect(f.remote.documents[0].title).toBe("Edited");
  expect(f.provider.mutate).toHaveBeenCalledTimes(1);
  const restoreReview = await f.publisher.review();
  await f.publisher.publish(restoreReview.review.id);
  expect(f.remote.documents[0].title).toBe("Original");
});

test("restore refuses a newer remote revision", async () => {
  const f = fixture();
  f.edit();
  const { review } = await f.publisher.review();
  await f.publisher.publish(review.id);
  f.remote.documents[0]._rev = "anotherChange";
  await expect(f.publisher.restore()).rejects.toThrow("Restore was stopped");
  expect(f.store.status().dirtyCount).toBe(0);
  expect(f.provider.mutate).toHaveBeenCalledTimes(1);
});

test("unrelated online changes before review refresh locally without being published", async () => {
  const f = fixture();
  f.edit();
  Object.assign(f.remote.documents[1], {
    _rev: "about2",
    title: "About updated online",
  });
  const { review } = await f.publisher.review();
  await f.publisher.publish(review.id);
  expect(f.store.read({ documentId: "about", path: "title" }).value).toBe(
    "About updated online"
  );
  expect(f.store.status().dirtyCount).toBe(0);
  expect(f.publisher.status().pending).toBe(false);
  expect(
    f.provider.mutate.mock.calls[0][0].map(({ patch }) => patch.id)
  ).toEqual(["home"]);
});
test("unrelated fields, added and deleted documents between mutation and finish refresh safely", async () => {
  const f = fixture();
  f.edit();
  const { review } = await f.publisher.review();
  const apply = f.provider.mutate.getMockImplementation();
  f.provider.mutate.mockImplementationOnce(async (mutations, id) => {
    await apply?.(mutations, id);
    Object.assign(f.remote.documents[0], {
      _rev: "homeLater",
      description: "Remote description",
    });
    f.remote.documents.splice(1, 1, {
      _id: "contact",
      _rev: "contact1",
      _type: "page",
      description: "New page",
      title: "Contact",
    });
  });
  await f.publisher.publish(review.id);
  expect(f.store.snapshot().manifest.documents.about).toBeUndefined();
  expect(f.store.read({ documentId: "contact", path: "title" }).value).toBe(
    "Contact"
  );
  expect(f.store.read({ documentId: "home", path: "description" }).value).toBe(
    "Remote description"
  );
  expect(f.publisher.status().pending).toBe(false);
  expect(f.provider.mutate.mock.calls[0][0]).toEqual([
    {
      patch: {
        id: "home",
        ifRevisionID: "revision1",
        set: { title: "Edited" },
      },
    },
  ]);
});
test("same-revision local snapshot changes cannot be cleared after remote publication", async () => {
  const f = fixture();
  f.edit();
  const { review } = await f.publisher.review();
  const apply = f.provider.mutate.getMockImplementation();
  f.provider.mutate.mockImplementationOnce(async (mutations, id) => {
    await apply?.(mutations, id);
    const { manifest } = f.store.snapshot();
    manifest.documents.about.fields.title = "Changed local baseline";
    fs.writeFileSync(
      path.join(root, ".weblab/content/manifest.json"),
      JSON.stringify(manifest)
    );
  });
  await expect(f.publisher.publish(review.id)).rejects.toThrow(
    "local draft changed"
  );
  expect(f.store.status().dirtyCount).toBe(1);
  expect(f.store.read({ documentId: "about", path: "title" }).value).toBe(
    "Changed local baseline"
  );
  expect(f.publisher.status().pending).toBe(true);
});
async function interruptedAcceptance() {
  const f = fixture();
  f.edit();
  const { review } = await f.publisher.review();
  const accept = f.store.acceptPublished;
  vi.spyOn(f.store, "acceptPublished").mockImplementationOnce((input) => {
    accept(input);
    throw new Error("Interrupted after accepting local snapshot");
  });
  return { f, review };
}
test("crash recovery allows unrelated remote changes after local acceptance", async () => {
  const { f, review } = await interruptedAcceptance();
  await expect(f.publisher.publish(review.id)).rejects.toThrow("Interrupted");
  expect(f.store.status().dirtyCount).toBe(0);
  expect(f.publisher.status().pending).toBe(true);
  Object.assign(f.remote.documents[1], {
    _rev: "about2",
    title: "New online About",
  });
  const reopened = createContentPublisher({
    provider: f.provider,
    root,
    store: createContentStore(root),
  });
  expect((await reopened.reconcile()).published).toBe(true);
  expect(reopened.status().pending).toBe(false);
  expect(f.provider.mutate).toHaveBeenCalledTimes(1);
});
test("crash recovery refuses changed touched documents even when edited text still matches", async () => {
  const { f, review } = await interruptedAcceptance();
  await expect(f.publisher.publish(review.id)).rejects.toThrow("Interrupted");
  expect(f.store.status().dirtyCount).toBe(0);
  expect(f.publisher.status().pending).toBe(true);
  Object.assign(f.remote.documents[0], {
    _rev: "laterHome",
    description: "Later online description",
  });
  await expect(f.publisher.reconcile()).rejects.toThrow("local draft changed");
  expect(f.publisher.status().pending).toBe(true);
  expect(f.provider.mutate).toHaveBeenCalledTimes(1);
});

for (const replace of [false, true]) {
  test(`review refuses ${replace ? "replacement" : "moved"} root after a delayed provider read`, async () => {
    const directory = root;
    const original = fs.statSync(directory, { bigint: true });
    const f = fixture(() => {
      const current = fs.statSync(directory, { bigint: true });
      if (
        current.dev !== original.dev ||
        current.ino !== original.ino ||
        current.birthtimeNs !== original.birthtimeNs
      ) {
        throw new Error("Source folder changed");
      }
    });
    f.edit();
    let release: () => void = () => undefined;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.provider.documents.mockImplementationOnce(async () => {
      await waiting;
      return structuredClone(f.remote);
    });
    const reviewing = f.publisher.review();
    const moved = `${directory}-moved`;
    fs.renameSync(directory, moved);
    movedRoots.push(moved);
    if (replace) {
      fs.cpSync(moved, directory, { recursive: true });
    }
    release();
    await expect(reviewing).rejects.toThrow();
    expect(
      fs.existsSync(path.join(moved, ".weblab/content-release.json"))
    ).toBe(false);
    if (replace) {
      expect(
        fs.existsSync(path.join(directory, ".weblab/content-release.json"))
      ).toBe(false);
    }
    expect(f.provider.mutate).not.toHaveBeenCalled();
    expect(
      createContentStore(moved).read({ documentId: "home", path: "title" })
        .value
    ).toBe("Edited");
  });
}
