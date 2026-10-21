// Provider-independent review gate. The native window owns every invocation.
const fs = require("node:fs");
const { join } = require("node:path");
const { randomUUID } = require("node:crypto");
const { sourceHash, freezeSource } = require("./release-files");

function createReleaseFlow({ root, link, provider }) {
  const file = join(root, ".vercel/weblab-release.json");
  function state() {
    for (const path of [root, join(root, ".vercel"), file]) {
      if (fs.existsSync(path) && fs.lstatSync(path).isSymbolicLink()) {
        throw new Error("Release state must not be a link.");
      }
    }
    if (!fs.existsSync(file)) {
      return {
        candidate: null,
        live: null,
        pending: null,
        preview: null,
        projectId: link.projectId,
        version: 1,
      };
    }
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 1024 * 1024) {
      throw new Error("Invalid release state file.");
    }
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (data.version !== 1 || data.projectId !== link.projectId) {
      throw new Error("The release connection changed.");
    }
    return data;
  }
  function save(value) {
    const temp = `${file}.${randomUUID()}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(value), { flag: "wx", mode: 0o600 });
    fs.renameSync(temp, file);
  }
  function idle(value) {
    if (value.pending) {
      throw new Error(
        "A release was not confirmed. Check its status before another publish."
      );
    }
  }
  async function build(production) {
    const record = state();
    idle(record);
    const snapshot = freezeSource(root, link);
    try {
      if (
        production &&
        (!record.preview?.reviewed ||
          record.preview.sourceHash !== snapshot.sourceHash)
      ) {
        throw new Error(
          "Make and review a test link for these exact changes first."
        );
      }
      const project = await provider.project();
      const previousId = project.targets?.production?.id ?? null;
      record.pending = {
        id: randomUUID(),
        kind: "build",
        previousId,
        production,
        sourceHash: snapshot.sourceHash,
      };
      save(record);
      try {
        const result = await provider.build(
          snapshot,
          production,
          record.pending.id
        );
        const deployment = await provider.deployment(result.id);
        if (
          deployment.readyState !== "READY" ||
          deployment.projectId !== link.projectId ||
          (production
            ? deployment.target !== "production"
            : deployment.target === "production")
        ) {
          throw new Error(
            "Vercel has not confirmed the expected ready version."
          );
        }
        const entry = {
          at: Date.now(),
          id: deployment.id,
          previousId,
          reviewed: false,
          sourceHash: snapshot.sourceHash,
          url: `https://${deployment.url}`,
        };
        record[production ? "candidate" : "preview"] = entry;
        record.pending = null;
        save(record);
        return { ok: true, production, requiresReview: true, url: entry.url };
      } catch (error) {
        // Retain the intent: a timeout or failed response is not proof that no build exists.
        throw new Error(
          `${error.message} Check the pending release before retrying.`,
          { cause: error }
        );
      }
    } finally {
      snapshot.cleanup();
    }
  }
  async function review(id) {
    const record = state();
    idle(record);
    const entry = [record.candidate, record.preview].find(
      (value) => value?.id === id
    );
    if (!entry || entry.sourceHash !== sourceHash(root)) {
      throw new Error("The site changed. Make a new test link.");
    }
    const remote = await provider.deployment(entry.id);
    if (remote.readyState !== "READY" || remote.projectId !== link.projectId) {
      throw new Error("This version is no longer ready.");
    }
    entry.reviewed = true;
    save(record);
    return { ok: true };
  }
  async function publish() {
    const record = state();
    idle(record);
    const { candidate } = record;
    if (!candidate?.reviewed || candidate.sourceHash !== sourceHash(root)) {
      throw new Error("Review the current live version before publishing it.");
    }
    const project = await provider.project();
    if ((project.targets?.production?.id ?? null) !== candidate.previousId) {
      throw new Error("Someone else published. Make a new reviewed version.");
    }
    record.pending = {
      deploymentId: candidate.id,
      id: randomUUID(),
      kind: "promote",
    };
    save(record);
    await provider.promote(candidate.id);
    if ((await provider.project()).targets?.production?.id !== candidate.id) {
      throw new Error(
        "The live switch is not confirmed. Check release status."
      );
    }
    record.live = candidate;
    record.candidate = null;
    record.pending = null;
    save(record);
    return { ok: true, published: true, url: candidate.url };
  }
  async function rollback() {
    const record = state();
    idle(record);
    if (!record.live?.previousId) {
      throw new Error("There is no previous live version to restore.");
    }
    if ((await provider.project()).targets?.production?.id !== record.live.id) {
      throw new Error("Someone else published. Refresh before restoring.");
    }
    const previous = await provider.deployment(record.live.previousId);
    if (
      previous.projectId !== link.projectId ||
      previous.readyState !== "READY" ||
      previous.target !== "production"
    ) {
      throw new Error("The previous version is not available.");
    }
    record.pending = {
      deploymentId: previous.id,
      id: randomUUID(),
      kind: "rollback",
    };
    save(record);
    await provider.rollback(previous.id);
    if ((await provider.project()).targets?.production?.id !== previous.id) {
      throw new Error("The restore is not confirmed. Check release status.");
    }
    record.live = {
      at: Date.now(),
      id: previous.id,
      previousId: record.live.id,
      url: `https://${previous.url}`,
    };
    record.pending = null;
    save(record);
    return { ok: true, url: record.live.url };
  }
  async function reconcileBuild(record, intent) {
    const matches = await provider.findBuild(intent.id);
    if (matches.length !== 1) {
      throw new Error(
        "The build is not yet confirmed. Check again later; do not start another build."
      );
    }
    const remote = await provider.deployment(matches[0].uid || matches[0].id);
    if (remote.projectId !== link.projectId) {
      throw new Error("The build belongs to another site.");
    }
    if (["ERROR", "CANCELED"].includes(remote.readyState)) {
      record.pending = null;
    } else if (
      remote.readyState === "READY" &&
      (remote.target === "production") === intent.production
    ) {
      record[intent.production ? "candidate" : "preview"] = {
        at: Date.now(),
        id: remote.id,
        previousId: intent.previousId,
        reviewed: false,
        sourceHash: intent.sourceHash,
        url: `https://${remote.url}`,
      };
      record.pending = null;
    } else {
      throw new Error(
        "Vercel is still building this version. Check again later."
      );
    }
  }
  async function reconcile() {
    const record = state();
    const intent = record.pending;
    if (!intent) {
      return { ok: true, release: record };
    }
    if (intent.kind === "build") {
      await reconcileBuild(record, intent);
    } else {
      const project = await provider.project();
      if (project.targets?.production?.id !== intent.deploymentId) {
        throw new Error(
          "The live switch is not confirmed. Check Vercel before making another release."
        );
      }
      if (intent.kind === "promote") {
        record.live = record.candidate;
        record.candidate = null;
      } else {
        const remote = await provider.deployment(intent.deploymentId);
        record.live = {
          at: Date.now(),
          id: remote.id,
          previousId: record.live.id,
          url: `https://${remote.url}`,
        };
      }
      record.pending = null;
    }
    save(record);
    return { ok: true, release: record };
  }
  async function abandonBuild(intentId) {
    const record = state();
    const intent = record.pending;
    if (intent?.kind !== "build" || intent.id !== intentId) {
      throw new Error("Only this unconfirmed build attempt can be discarded.");
    }
    // A successful, empty provider read is required. Never discard a known
    // running build or a live switch. A late build has no domain promotion.
    const matches = await provider.findBuild(intent.id);
    if (!Array.isArray(matches) || matches.length) {
      throw new Error("Vercel has this build. Check its status instead.");
    }
    const project = await provider.project();
    if ((project.targets?.production?.id ?? null) !== intent.previousId) {
      throw new Error("The live site changed. Check Vercel before retrying.");
    }
    record.abandonedBuild = { ...intent, at: Date.now() };
    record.pending = null;
    save(record);
    return { ok: true, release: record };
  }
  return { abandonBuild, build, publish, reconcile, review, rollback, state };
}

module.exports = { createReleaseFlow };
