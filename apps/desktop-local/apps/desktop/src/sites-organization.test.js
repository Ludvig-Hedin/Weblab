/** biome-ignore-all lint/suspicious/noEmptyBlockStatements: The fake child processes, sockets, and process-stop adapters intentionally do no OS work. */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const directory = path.dirname(fileURLToPath(import.meta.url));
const nodeRequire = createRequire(import.meta.url);
const { createSourceLocations } = nodeRequire("./source-location.js");
let fixture;
let userData;
let root;
let sites;
let bookmark;

function load(name, overrides = {}) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(directory, name), "utf8"), {
    Buffer,
    clearInterval,
    clearTimeout,
    module,
    process,
    require: (specifier) => overrides[specifier] || nodeRequire(specifier),
    setInterval,
    setTimeout,
  });
  return module.exports;
}
function makeProject(folder) {
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(
    path.join(folder, "package.json"),
    JSON.stringify({ scripts: { dev: "vite" } })
  );
  fs.writeFileSync(path.join(folder, "page.html"), "<h1>Saved work</h1>");
}
const store = () =>
  JSON.parse(fs.readFileSync(path.join(userData, "sites.json"), "utf8"));

beforeEach(async () => {
  fixture = await fsp.realpath(
    await fsp.mkdtemp(path.join(os.tmpdir(), "weblab-organize-"))
  );
  userData = path.join(fixture, "user-data");
  root = path.join(fixture, "site");
  makeProject(root);
  fs.mkdirSync(userData);
  const documents = path.join(fixture, "documents");
  fs.mkdirSync(documents);
  bookmark = {
    create: vi.fn(async () => "Ym9va21hcms="),
    resolve: vi.fn(() => Promise.reject(new Error("No bookmark"))),
  };
  sites = load("sites.js", {
    "./import-html": {
      copyLinkedFiles: (file, target) => {
        fs.copyFileSync(file, path.join(target, "index.html"));
        return "index.html";
      },
    },
    "./runtime": { canUseGit: () => false },
    "./source-location": {
      createSourceLocations: (options) =>
        createSourceLocations({ ...options, bookmark }),
    },
    electron: {
      app: { getPath: (name) => (name === "userData" ? userData : documents) },
    },
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fsp.rm(fixture, { force: true, recursive: true });
});

test("folders only organize metadata, and site writes preserve folders and membership", async () => {
  const folder = sites.folderCreate("Client work");
  const site = await sites.add(root, "My website");
  sites.moveToFolder(site.id, folder.id);
  sites.touch(site.id);
  sites.setSkipped(site.id, ["API_KEY"]);
  expect(store().folders).toEqual([folder]);
  expect(sites.get(site.id)).toMatchObject({
    folderId: folder.id,
    name: "My website",
    path: root,
    skippedSettings: ["API_KEY"],
  });
  const renamed = sites.folderRename(folder.id, "New name");
  expect((await sites.details(site.id)).folderName).toBe("New name");
  const secondRoot = path.join(fixture, "second");
  makeProject(secondRoot);
  const second = await sites.add(secondRoot);
  sites.remove(second.id);
  expect(store().folders).toEqual([renamed]);
  sites.folderRemove(folder.id);
  expect(store().folders).toEqual([]);
  expect(sites.get(site.id)).not.toHaveProperty("folderId");
  expect(fs.readFileSync(path.join(root, "page.html"), "utf8")).toBe(
    "<h1>Saved work</h1>"
  );
  expect(fs.existsSync(root)).toBe(true);
});

test("legacy cards remain visible and require confirmation instead of path-based enrollment", async () => {
  const legacy = {
    custom: "kept",
    id: randomUUID(),
    lastOpened: 123,
    name: "Original name",
    path: root,
    skippedSettings: ["KEY"],
  };
  fs.writeFileSync(
    path.join(userData, "sites.json"),
    JSON.stringify({ folders: [], sites: [legacy] }),
    { mode: 0o600 }
  );
  expect(await sites.list()).toEqual([
    { ...legacy, missing: true, status: "needsConfirmation" },
  ]);
  await expect(sites.verified(legacy.id)).rejects.toMatchObject({
    code: "source-unavailable",
  });
  await expect(sites.add(root)).rejects.toMatchObject({
    code: "source-unavailable",
  });
  expect(bookmark.create).not.toHaveBeenCalled();
  const before = fs.readFileSync(path.join(userData, "sites.json"), "utf8");
  await sites.prepareLocation(legacy.id, root);
  expect(fs.readFileSync(path.join(userData, "sites.json"), "utf8")).toBe(
    before
  );
  const candidate = await sites.prepareLocation(legacy.id, root);
  expect(await sites.confirmLocation(legacy.id, candidate.token)).toEqual(
    legacy
  );
  expect((await sites.details(legacy.id)).status).toBe("available");
});

test("Finder reimport of a moved identity preserves UUID, name, settings, and files", async () => {
  const site = await sites.add(root, "My name");
  const folder = sites.folderCreate("Projects");
  sites.moveToFolder(site.id, folder.id);
  sites.setSkipped(site.id, ["SKIPPED"]);
  sites.touch(site.id);
  const saved = sites.get(site.id);
  const moved = path.join(fixture, "moved");
  fs.renameSync(root, moved);
  expect((await sites.list())[0]).toMatchObject({
    id: site.id,
    missing: true,
    path: root,
  });
  const reopened = await sites.add(moved, "Ignored replacement name");
  expect(reopened).toEqual({ ...saved, path: moved });
  expect(store().sites).toHaveLength(1);
  expect(fs.readFileSync(path.join(moved, "page.html"), "utf8")).toBe(
    "<h1>Saved work</h1>"
  );
});

test("same-name replacement is blocked for source actions and imports", async () => {
  const site = await sites.add(root);
  fs.renameSync(root, path.join(fixture, "actual"));
  makeProject(root);
  await expect(sites.verified(site.id)).rejects.toMatchObject({
    code: "source-unavailable",
  });
  await expect(sites.add(root)).rejects.toMatchObject({
    code: "source-unavailable",
  });
  expect((await sites.details(site.id)).status).toBe("needsConfirmation");
  expect(store().sites).toHaveLength(1);
});

test("active sites cannot reconnect through picker, details, or Finder reimport", async () => {
  const site = await sites.add(root);
  const moved = path.join(fixture, "moved");
  fs.renameSync(root, moved);
  bookmark.resolve.mockResolvedValue({ path: moved, stale: true });
  sites.setOpenChecker(() => true);
  expect((await sites.details(site.id)).status).toBe("missing");
  expect(bookmark.resolve).not.toHaveBeenCalled();
  await expect(
    sites.verified(site.id, { resolve: true })
  ).rejects.toMatchObject({ code: "source-unavailable" });
  await expect(sites.add(moved)).rejects.toThrow("Close this site");
  await expect(sites.prepareLocation(site.id, moved)).rejects.toThrow(
    "Close this site"
  );
  expect(sites.get(site.id).path).toBe(root);
  sites.setOpenChecker(() => false);
  expect((await sites.details(site.id)).path).toBe(moved);
});

test("confirmation expires after another binding update and rechecks project type", async () => {
  const site = await sites.add(root);
  const candidate = await sites.prepareLocation(site.id, root);
  const current = await sites.prepareLocation(site.id, root);
  await sites.confirmLocation(site.id, current.token);
  await expect(
    sites.confirmLocation(site.id, candidate.token)
  ).rejects.toMatchObject({ code: "source_confirmation_stale" });
  const changed = await sites.prepareLocation(site.id, root);
  fs.writeFileSync(path.join(root, "package.json"), "{}");
  await expect(sites.confirmLocation(site.id, changed.token)).rejects.toThrow();
  expect(sites.get(site.id).path).toBe(root);
});

test("HTML reimport also requires target-root and original-file identity proof", async () => {
  const file = path.join(fixture, "original.html");
  fs.writeFileSync(file, "<h1>Original HTML</h1>");
  const site = await sites.addHtml(file);
  fs.writeFileSync(path.join(site.path, site.entry), "<h1>Edited HTML</h1>");
  expect((await sites.addHtml(file)).id).toBe(site.id);
  fs.renameSync(file, path.join(fixture, "renamed.html"));
  expect((await sites.addHtml(path.join(fixture, "renamed.html"))).id).toBe(
    site.id
  );
  fs.writeFileSync(
    path.join(fixture, "renamed.html"),
    "<h1>same inode edit</h1>"
  );
  fs.renameSync(
    path.join(fixture, "renamed.html"),
    path.join(fixture, "actual-original.html")
  );
  fs.writeFileSync(path.join(fixture, "renamed.html"), "<h1>Replacement</h1>");
  await expect(
    sites.addHtml(path.join(fixture, "renamed.html"))
  ).rejects.toMatchObject({ code: "source-unavailable" });
  expect(fs.readFileSync(path.join(site.path, site.entry), "utf8")).toBe(
    "<h1>Edited HTML</h1>"
  );
});

test("malformed saved metadata is never silently reset", async () => {
  fs.writeFileSync(path.join(userData, "sites.json"), "{bad data");
  expect(() => sites.folderCreate("New")).toThrow("recovery");
  await expect(sites.add(root)).rejects.toThrow("recovery");
  expect(fs.readFileSync(path.join(userData, "sites.json"), "utf8")).toBe(
    "{bad data"
  );
});

test("captured command guards reject moved roots and reconfirmed generations after an await", async () => {
  const site = await sites.add(root);
  const checked = await sites.verified(site.id);
  await sites.withVerified(checked, async () => {
    await Promise.resolve();
    expect(() => sites.checkVerifiedPath(root)).not.toThrow();
    const candidate = await sites.prepareLocation(site.id, root);
    await sites.confirmLocation(site.id, candidate.token);
    expect(() => sites.checkVerifiedPath(root)).toThrow("Locate this site");
  });
  const newer = await sites.verified(site.id);
  await sites.withVerified(newer, async () => {
    await Promise.resolve();
    fs.renameSync(root, path.join(fixture, "actual"));
    makeProject(root);
    expect(() => sites.checkVerifiedPath(root)).toThrow("Locate this site");
  });
});

test("GitHub repo creation cannot start a new git command on a replaced folder after its network await", async () => {
  const site = await sites.add(root);
  const checked = await sites.verified(site.id);
  const commands = [];
  const upload = load("upload.js", {
    "./github": {
      account: () => null,
      createRepo: async () => {
        await Promise.resolve();
        fs.renameSync(root, path.join(fixture, "actual"));
        makeProject(root);
        return { cloneUrl: "https://github.com/test/site.git", ok: true };
      },
      readToken: () => null,
    },
    "./runtime": { canUseGit: () => true, childEnv: () => ({}) },
    "./sites": sites,
    "node:child_process": {
      execFile: (_binary, args, _options, callback) => {
        commands.push(args);
        let output = "";
        if (args.includes("--is-inside-work-tree")) {
          output = "true\n";
        } else if (args.includes("--porcelain=2")) {
          output = "# branch.head main\0";
        }
        callback(args.includes("get-url") ? { code: 1 } : null, output, "");
      },
    },
  });
  await expect(
    sites.withVerified(checked, () => upload.createRepo(root, { name: "test" }))
  ).rejects.toMatchObject({ code: "source-unavailable" });
  expect(
    commands.some((args) => args.includes("remote") && args.includes("add"))
  ).toBe(false);
});

test("deploy setup cannot launch a second command or write links into a replacement after its await", async () => {
  const site = await sites.add(root);
  const checked = await sites.verified(site.id);
  let commands = 0;
  const deploy = load("deploy.js", {
    "./runtime": { bunBinary: () => "bun", childEnv: () => ({}) },
    "./sites": sites,
    electron: { shell: {} },
    "node:child_process": {
      spawn: () => {
        commands += 1;
        const child = Object.assign(new EventEmitter(), {
          stderr: new EventEmitter(),
          stdin: Object.assign(new EventEmitter(), {
            end: () =>
              queueMicrotask(() => {
                fs.renameSync(root, path.join(fixture, "actual"));
                makeProject(root);
                child.stdout.emit(
                  "data",
                  JSON.stringify({ user: { id: "user" } })
                );
                child.emit("close", 0);
              }),
          }),
          stdout: new EventEmitter(),
        });
        return child;
      },
    },
  });
  await expect(
    sites.withVerified(checked, () => deploy.prepare(root, { name: "test" }))
  ).rejects.toMatchObject({ code: "source-unavailable" });
  expect(commands).toBe(1);
  expect(fs.existsSync(path.join(root, ".vercel"))).toBe(false);
  expect(fs.existsSync(path.join(root, ".vercelignore"))).toBe(false);
});

test("linked Git worktrees reconnect after a valid move, without repairing a broken pointer", async () => {
  const git = (cwd, ...args) =>
    execFileSync("/usr/bin/git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    });
  git(root, "init", "-q");
  git(root, "add", "package.json", "page.html");
  git(
    root,
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.invalid",
    "commit",
    "-qm",
    "Initial"
  );
  const worktree = path.join(fixture, "linked");
  git(root, "worktree", "add", "-qb", "linked", worktree);
  const site = await sites.add(worktree);
  const moved = path.join(fixture, "moved-linked");
  git(root, "worktree", "move", worktree, moved);
  const pointer = fs.readFileSync(path.join(moved, ".git"), "utf8");
  const candidate = await sites.prepareLocation(site.id, moved);
  expect((await sites.confirmLocation(site.id, candidate.token)).path).toBe(
    moved
  );
  expect(fs.readFileSync(path.join(moved, ".git"), "utf8")).toBe(pointer);
  const pending = await sites.prepareLocation(site.id, moved);
  fs.writeFileSync(
    path.join(moved, ".git"),
    "gitdir: /definitely-missing-weblab-test\n"
  );
  await expect(sites.confirmLocation(site.id, pending.token)).rejects.toThrow();
  expect(fs.readFileSync(path.join(moved, ".git"), "utf8")).toBe(
    "gitdir: /definitely-missing-weblab-test\n"
  );
});

test("runner fresh start cannot delete the cache of a replacement folder", async () => {
  const site = await sites.add(root);
  fs.renameSync(root, path.join(fixture, "actual"));
  makeProject(root);
  fs.mkdirSync(path.join(root, ".next"));
  fs.writeFileSync(path.join(root, ".next", "keep"), "replacement cache");
  const spawn = vi.fn();
  const events = [];
  const { SiteRunner } = load("runner.js", {
    "./auth": {},
    "./procs": {
      snapshotTree: () => ({ groups: [] }),
      stopGroups: () => Promise.resolve(),
      stopTree: () => Promise.resolve(),
    },
    "./runtime": {},
    "./sites": sites,
    "./static-site": {},
    "node:child_process": { spawn },
  });
  const runner = new SiteRunner((event) => events.push(event));
  await runner.open(site, { fresh: true });
  expect(events).toContainEqual(expect.objectContaining({ type: "error" }));
  expect(spawn).not.toHaveBeenCalled();
  expect(fs.readFileSync(path.join(root, ".next", "keep"), "utf8")).toBe(
    "replacement cache"
  );
});

test("active runner keeps its identity monitor after becoming ready and stops only its own child", async () => {
  const site = await sites.add(root);
  fs.mkdirSync(path.join(root, "node_modules"));
  const events = [];
  const child = Object.assign(new EventEmitter(), {
    exitCode: null,
    pid: 123,
    stderr: new EventEmitter(),
    stdout: new EventEmitter(),
  });
  const stopTree = vi.fn(() => Promise.resolve());
  const { SiteRunner } = load("runner.js", {
    "./auth": { readApiKey: () => null },
    "./procs": {
      snapshotTree: () => ({ groups: [] }),
      stopGroups: () => Promise.resolve(),
      stopTree,
    },
    "./runtime": { childEnv: () => ({}), cliEntry: () => "cli.js" },
    "./sites": sites,
    "./static-site": {},
    "node:child_process": {
      spawn: () => {
        queueMicrotask(() =>
          child.stdout.emit(
            "data",
            JSON.stringify({ url: "http://localhost:4101" })
          )
        );
        return child;
      },
    },
    "node:net": {
      createServer: () => ({
        close(done) {
          done();
        },
        listen(_options, done) {
          done();
        },
        once() {},
      }),
    },
  });
  const runner = new SiteRunner((event) => events.push(event));
  try {
    await runner.open(site);
    expect(events).toContainEqual(expect.objectContaining({ type: "ready" }));
    fs.renameSync(root, path.join(fixture, "actual"));
    makeProject(root);
    await new Promise((resolve) => setTimeout(resolve, 650));
    expect(events).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining("folder moved or changed"),
        type: "error",
      })
    );
    expect(stopTree).toHaveBeenCalledWith(child, 6000);
    expect(runner.locationWatch).toBeNull();
    expect(runner.running).toBe(false);
  } finally {
    await runner.stop();
  }
});
