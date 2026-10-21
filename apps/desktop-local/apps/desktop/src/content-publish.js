// Revision-checked plain-text publication. Credentials belong to the provider.
const fs = require("node:fs");
const { join } = require("node:path");
const { randomUUID, createHash } = require("node:crypto");
const { buildManifest } = require("./content");

// After a crash, only the documents this publication touched must still match
// the accepted local snapshot. Comparing the entire dataset blocks unrelated work.
function sameDocument(accepted, remote) {
  return Boolean(
    accepted &&
      remote &&
      accepted._rev === remote._rev &&
      accepted._type === remote._type &&
      Object.keys(accepted.fields).length ===
        Object.keys(remote.fields).length &&
      Object.entries(accepted.fields).every(
        ([path, value]) => remote.fields[path] === value
      )
  );
}

function createContentPublisher({ root, store, provider }) {
  const file = join(root, ".weblab/content-release.json");
  function read() {
    for (const path of [join(root, ".weblab"), file]) {
      if (
        fs.existsSync(path) &&
        (fs.lstatSync(path).isSymbolicLink() ||
          (fs.lstatSync(path).nlink > 1 && fs.lstatSync(path).isFile()))
      ) {
        throw new Error("Content release state must be a private local file.");
      }
    }
    if (!fs.existsSync(file)) {
      return {};
    }
    if (fs.statSync(file).size > 8 * 1024 * 1024) {
      throw new Error("Content release state is too large.");
    }
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }
  function write(value) {
    read();
    const temp = `${file}.${randomUUID()}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(value), { flag: "wx", mode: 0o600 });
    fs.renameSync(temp, file);
  }
  function plan(snapshot) {
    const { manifest, draft } = snapshot;
    const changes = Object.entries(draft.values).flatMap(
      ([documentId, fields]) =>
        Object.entries(fields).map(([path, after]) => ({
          after,
          before: manifest.documents[documentId].fields[path],
          documentId,
          path,
        }))
    );
    return {
      changes,
      dataset: manifest.dataset,
      hash: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"),
      projectId: manifest.projectId,
      revision: draft.revision,
    };
  }
  async function check(snapshot) {
    const remote = await provider.documents();
    const manifest = buildManifest(remote);
    if (
      manifest.projectId !== snapshot.manifest.projectId ||
      manifest.dataset !== snapshot.manifest.dataset
    ) {
      throw new Error("The content connection changed.");
    }
    for (const id of Object.keys(snapshot.draft.values)) {
      if (
        manifest.documents[id]?._rev !== snapshot.manifest.documents[id]?._rev
      ) {
        throw new Error(
          "Someone changed this text online. Refresh the local copy before publishing."
        );
      }
      if (remote.draftIds?.includes(`drafts.${id}`)) {
        throw new Error(
          "This page has a draft in Sanity. Finish that draft before publishing here."
        );
      }
    }
    return remote;
  }
  async function review() {
    if (read().pending) {
      throw new Error("Check the pending text publish first.");
    }
    const snapshot = store.snapshot();
    const result = plan(snapshot);
    if (!result.changes.length) {
      throw new Error("There are no text changes to publish.");
    }
    await check(snapshot);
    const reviewed = { ...result, id: randomUUID() };
    write({ ...read(), review: reviewed });
    return { ok: true, review: reviewed };
  }
  async function finish(record) {
    const source = await provider.documents();
    const remote = buildManifest(source);
    const current = store.snapshot();
    const { pending } = record;
    if (
      remote.projectId !== pending.projectId ||
      remote.dataset !== pending.dataset
    ) {
      throw new Error("The content connection changed.");
    }
    for (const change of pending.changes) {
      if (
        remote.documents[change.documentId]?.fields[change.path] !==
        change.after
      ) {
        throw new Error(
          "Text publication is not confirmed. Check status before trying again."
        );
      }
    }
    // Only the exact reviewed local snapshot may be cleared. Remote fields
    // outside this publication can change independently and refresh locally.
    if (
      current.draft.revision === pending.revision &&
      plan(current).hash === pending.hash
    ) {
      store.acceptPublished({
        documents: source.documents,
        revision: pending.revision,
      });
    } else if (
      current.draft.revision !== pending.revision + 1 ||
      Object.keys(current.draft.values).length ||
      current.manifest.projectId !== pending.projectId ||
      current.manifest.dataset !== pending.dataset ||
      !pending.changes.every(({ documentId }) =>
        sameDocument(
          current.manifest.documents[documentId],
          remote.documents[documentId]
        )
      )
    ) {
      throw new Error(
        "The local draft changed while publication was pending. Keep this draft and check the online text."
      );
    }
    record.last = {
      ...pending,
      revisions: Object.fromEntries(
        Object.entries(remote.documents).map(([id, doc]) => [id, doc._rev])
      ),
    };
    record.pending = null;
    record.review = null;
    write(record);
    return { ok: true, published: true, ...store.status() };
  }
  async function publish(reviewId) {
    const record = read();
    if (record.pending) {
      throw new Error("Check the pending text publish first.");
    }
    const snapshot = store.snapshot();
    const proposed = plan(snapshot);
    if (
      !record.review ||
      record.review.id !== reviewId ||
      record.review.hash !== proposed.hash
    ) {
      throw new Error("The draft changed. Review these text changes again.");
    }
    await check(snapshot);
    const mutations = Object.entries(snapshot.draft.values).map(
      ([id, fields]) => ({
        patch: {
          id,
          ifRevisionID: snapshot.manifest.documents[id]._rev,
          set: fields,
        },
      })
    );
    record.pending = { ...proposed, transactionId: randomUUID() };
    write(record);
    try {
      await provider.mutate(mutations, record.pending.transactionId);
    } catch (error) {
      if (error.definitelyRejected) {
        record.pending = null;
        write(record);
      }
      throw error;
    }
    return finish(record);
  }
  function reconcile() {
    const record = read();
    if (!record.pending) {
      return { ok: true, ...store.status() };
    }
    return finish(record);
  }
  function status() {
    const record = read();
    return {
      canRestore: Boolean(record.last),
      pending: Boolean(record.pending),
      review: record.review || null,
    };
  }
  async function restore() {
    const record = read();
    if (record.pending || !record.last || store.status().dirtyCount) {
      throw new Error(
        "Finish the current text draft before restoring published text."
      );
    }
    const source = await provider.documents();
    const manifest = buildManifest(source);
    for (const change of record.last.changes) {
      if (
        manifest.projectId !== record.last.projectId ||
        manifest.dataset !== record.last.dataset ||
        manifest.documents[change.documentId]?._rev !==
          record.last.revisions[change.documentId]
      ) {
        throw new Error(
          "Someone changed this text online. Restore was stopped."
        );
      }
    }
    // Restore becomes a local draft and must pass the same review/publish flow.
    for (const change of record.last.changes) {
      store.save({
        documentId: change.documentId,
        path: change.path,
        revision: store.status().revision,
        value: change.before,
      });
    }
    return { ok: true, ...store.status() };
  }
  return { publish, reconcile, restore, review, status };
}
module.exports = { createContentPublisher };
