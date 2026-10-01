const FOUNDATION_IMPORT = /ObjC\.import\(["']Foundation["']\)/;

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  bookmarkHelperPath,
  createSourceLocations,
  nativeBookmark,
} from "./source-location.js";

let directory;
let base;
let source;
let siteId;
let registry;
let bookmark;
beforeEach(async () => {
  directory = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "weblab-source-location-"))
  );
  base = path.join(directory, "private");
  source = path.join(directory, "original");
  siteId = randomUUID();
  await fs.mkdir(source);
  bookmark = {
    create: vi.fn(async () => "Ym9va21hcms="),
    resolve: vi.fn(async () => ({ path: source, stale: false })),
  };
  registry = createSourceLocations({ base, bookmark });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(directory, { force: true, recursive: true });
});

test("capture saves a private independent record and never overwrites an existing original", async () => {
  const initial = await registry.capture(siteId, source);
  expect(initial).toMatchObject({
    generation: 1,
    sourcePath: source,
    status: "available",
  });
  expect(typeof initial.identity.dev).toBe("string");
  const target = path.join(base, "source-locations.json");
  // biome-ignore lint/suspicious/noBitwiseOperators: Verify the exact POSIX mode on the private registry.
  expect((await fs.stat(target)).mode & 0o777).toBe(0o600);
  await expect(registry.capture(siteId, source)).rejects.toMatchObject({
    code: "source_location_exists",
  });
  expect(await fs.readdir(source)).toEqual([]);
  await expect(
    registry.assertCurrent(siteId, 1, source, initial.identity)
  ).resolves.toMatchObject({ status: "available" });
});

test("quiet inspection does not resolve bookmarks; rename resolution preserves identity and increments generation", async () => {
  const initial = await registry.capture(siteId, source);
  const moved = path.join(directory, "renamed");
  await fs.rename(source, moved);
  bookmark.resolve.mockResolvedValue({ path: moved, stale: true });
  expect(await registry.inspect(siteId, source)).toMatchObject({
    sourcePath: source,
    status: "missing",
  });
  expect(bookmark.resolve).not.toHaveBeenCalled();
  expect(await registry.findByPath(moved)).toMatchObject({
    identity: initial.identity,
    siteId,
  });
  const recovered = await registry.inspect(siteId, source, { resolve: true });
  expect(recovered).toEqual({ ...initial, generation: 2, sourcePath: moved });
  expect(bookmark.create).toHaveBeenLastCalledWith(moved);
  await expect(
    registry.assertCurrent(siteId, 1, source, initial.identity)
  ).rejects.toMatchObject({ code: "source_location_stale" });
  expect((await registry.inspect(siteId, source)).sourcePath).toBe(moved);
});

test("a replacement at the old path is never accepted, even if the bookmark resolves there", async () => {
  const initial = await registry.capture(siteId, source);
  await fs.rename(source, path.join(directory, "actual-original"));
  await fs.mkdir(source);
  const inspected = await registry.inspect(siteId, source, { resolve: true });
  expect(inspected).toEqual({ ...initial, status: "needsConfirmation" });
  expect(await registry.findByPath(source)).toBeNull();
  await expect(
    registry.assertCurrent(siteId, 1, source, initial.identity)
  ).rejects.toMatchObject({ code: "source_location_stale" });
});

test("legacy existing paths require confirmation without silent capture or bookmark lookup", async () => {
  expect(await registry.inspect(siteId, source, { resolve: true })).toEqual({
    generation: 0,
    identity: null,
    sourcePath: source,
    status: "needsConfirmation",
  });
  expect(bookmark.create).not.toHaveBeenCalled();
  expect(bookmark.resolve).not.toHaveBeenCalled();
  await expect(
    fs.stat(path.join(base, "source-locations.json"))
  ).rejects.toMatchObject({ code: "ENOENT" });
  const prepared = await registry.prepare(siteId, source);
  const confirmed = await registry.confirm(siteId, prepared.token);
  expect(confirmed).toMatchObject({
    generation: 1,
    sourcePath: source,
    status: "available",
  });
});

test("a copied directory requires manual confirmation; confirmation preserves original path and bytes", async () => {
  await fs.writeFile(path.join(source, "file.txt"), "original content");
  await registry.capture(siteId, source);
  const copied = path.join(directory, "copied");
  await fs.cp(source, copied, { recursive: true });
  await fs.rename(source, path.join(directory, "original-offline"));
  bookmark.resolve.mockResolvedValue({ path: copied, stale: true });
  expect(
    await registry.inspect(siteId, source, { resolve: true })
  ).toMatchObject({ generation: 1, status: "missing" });
  const pending = await registry.prepare(siteId, copied);
  expect(pending.previousPath).toBe(source);
  expect(await registry.confirm(siteId, pending.token)).toMatchObject({
    generation: 2,
    sourcePath: copied,
    status: "available",
  });
  const state = JSON.parse(
    await fs.readFile(path.join(base, "source-locations.json"), "utf8")
  );
  expect(state.locations[siteId].originalSourcePath).toBe(source);
  expect(
    await fs.readFile(path.join(directory, "original-offline/file.txt"), "utf8")
  ).toBe("original content");
});

test("canceling preparation writes no record and creates no bookmark", async () => {
  await registry.capture(siteId, source);
  bookmark.create.mockClear();
  const target = path.join(base, "source-locations.json");
  const before = await fs.readFile(target, "utf8");
  const candidate = path.join(directory, "candidate");
  await fs.mkdir(candidate);
  await registry.prepare(siteId, candidate);
  expect(await fs.readFile(target, "utf8")).toBe(before);
  expect(bookmark.create).not.toHaveBeenCalled();
});

test("confirmation rejects candidate replacement and single-use tokens", async () => {
  await registry.capture(siteId, source);
  const prepared = await registry.prepare(siteId, source);
  await fs.rename(source, path.join(directory, "moved"));
  await fs.mkdir(source);
  await expect(registry.confirm(siteId, prepared.token)).rejects.toMatchObject({
    code: "source_changed",
  });
  await expect(registry.confirm(siteId, prepared.token)).rejects.toMatchObject({
    code: "source_confirmation_expired",
  });
  expect((await registry.inspect(siteId, source)).generation).toBe(1);
});

test("a separate registry update makes a prepared token stale", async () => {
  await registry.capture(siteId, source);
  const stale = await registry.prepare(siteId, source);
  const other = createSourceLocations({ base, bookmark });
  const current = await other.prepare(siteId, source);
  await other.confirm(siteId, current.token);
  await expect(registry.confirm(siteId, stale.token)).rejects.toMatchObject({
    code: "source_confirmation_stale",
  });
});

test("confirmation runs caller validation before persisting and leaves the prior binding intact on failure", async () => {
  await registry.capture(siteId, source);
  const prepared = await registry.prepare(siteId, source);
  const validateCandidate = vi.fn(() => {
    throw Object.assign(new Error("private git path"), {
      code: "unsafe_git_layout",
    });
  });
  await expect(
    registry.confirm(siteId, prepared.token, { validateCandidate })
  ).rejects.toMatchObject({ code: "unsafe_git_layout" });
  expect(validateCandidate).toHaveBeenCalledWith(source);
  expect(await registry.inspect(siteId, source)).toMatchObject({
    generation: 1,
    sourcePath: source,
  });
});

test("active IDs filter retired duplicates without guessing between active duplicates", async () => {
  await registry.capture(siteId, source);
  const retired = randomUUID();
  await registry.capture(retired, source);
  expect(await registry.findByPath(source)).toBeNull();
  expect(await registry.findByPath(source, [siteId])).toMatchObject({ siteId });
  expect(await registry.findByPath(source, [])).toBeNull();
});

test("explicit resolution refreshes a stale bookmark at the same path without invalidating plans", async () => {
  const initial = await registry.capture(siteId, source);
  bookmark.create.mockClear();
  bookmark.resolve.mockResolvedValue({ path: source, stale: true });
  expect(await registry.inspect(siteId, source, { resolve: true })).toEqual(
    initial
  );
  expect(bookmark.create).toHaveBeenCalledWith(source);
});

test("a prepared token expires after five minutes", async () => {
  const prepared = await registry.prepare(siteId, source);
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 6 * 60 * 1000);
  await expect(registry.confirm(siteId, prepared.token)).rejects.toMatchObject({
    code: "source_confirmation_expired",
  });
});

test("permission failure is distinct from a missing folder and has no path-bearing error", async () => {
  await registry.capture(siteId, source);
  const lstat = fs.lstat.bind(fs);
  vi.spyOn(fs, "lstat").mockImplementation((candidate, ...options) => {
    if (candidate === source) {
      return Promise.reject(
        Object.assign(new Error("private path"), { code: "EACCES" })
      );
    }
    return lstat(candidate, ...options);
  });
  expect(await registry.inspect(siteId, source)).toMatchObject({
    status: "permissionDenied",
  });
});

test("corrupt records are never reset or overwritten", async () => {
  await registry.capture(siteId, source);
  const target = path.join(base, "source-locations.json");
  await fs.writeFile(target, "{corrupted");
  await expect(registry.inspect(siteId, source)).rejects.toMatchObject({
    code: "invalid_source_locations",
  });
  await expect(registry.prepare(siteId, source)).rejects.toMatchObject({
    code: "invalid_source_locations",
  });
  await expect(registry.capture(randomUUID(), source)).rejects.toMatchObject({
    code: "invalid_source_locations",
  });
  expect(await fs.readFile(target, "utf8")).toBe("{corrupted");
});

test("symlink roots and storage files are rejected without replacing their targets", async () => {
  const symlink = path.join(directory, "link");
  await fs.symlink(source, symlink);
  await expect(registry.capture(siteId, symlink)).rejects.toMatchObject({
    code: "unsafe_directory",
  });
  const victim = path.join(directory, "victim.json");
  await fs.writeFile(victim, "do not change", { mode: 0o600 });
  await fs.symlink(victim, path.join(base, "source-locations.json"));
  await expect(registry.capture(siteId, source)).rejects.toMatchObject({
    code: "unsafe_source_locations",
  });
  expect(await fs.readFile(victim, "utf8")).toBe("do not change");
});

test("live owners keep their locks and are never stolen", async () => {
  await fs.mkdir(base);
  const lock = path.join(base, "source-locations.lock");
  await fs.writeFile(
    lock,
    JSON.stringify({ nonce: randomUUID(), pid: process.pid }),
    { mode: 0o600 }
  );
  await expect(registry.capture(siteId, source)).rejects.toMatchObject({
    code: "source_locations_locked",
  });
  expect(await fs.stat(lock)).toBeDefined();
});

test("positively verified dead-owner locks recover without losing saved bindings", async () => {
  await registry.capture(siteId, source);
  const lock = path.join(base, "source-locations.lock");
  await fs.writeFile(
    lock,
    JSON.stringify({ nonce: randomUUID(), pid: 99_999_999 }),
    { mode: 0o600 }
  );
  const kill = vi.spyOn(process, "kill").mockImplementation(() => {
    throw Object.assign(new Error("dead"), { code: "ESRCH" });
  });
  expect(await registry.inspect(siteId, source)).toMatchObject({
    generation: 1,
    status: "available",
  });
  expect(kill).toHaveBeenCalledWith(99_999_999, 0);
  await expect(fs.stat(lock)).rejects.toMatchObject({ code: "ENOENT" });
});

test("uncertain owner state does not permit recovery", async () => {
  await fs.mkdir(base);
  const lock = path.join(base, "source-locations.lock");
  const content = JSON.stringify({ nonce: randomUUID(), pid: 99_999_999 });
  await fs.writeFile(lock, content, { mode: 0o600 });
  vi.spyOn(process, "kill").mockImplementation(() => {
    throw Object.assign(new Error("not permitted"), { code: "EPERM" });
  });
  await expect(registry.inspect(siteId, source)).rejects.toMatchObject({
    code: "source_locations_locked",
  });
  expect(await fs.readFile(lock, "utf8")).toBe(content);
});

test("a replaced lock survives a dead-owner recovery attempt", async () => {
  await fs.mkdir(base);
  const lock = path.join(base, "source-locations.lock");
  await fs.writeFile(
    lock,
    JSON.stringify({ nonce: randomUUID(), pid: 99_999_999 }),
    { mode: 0o600 }
  );
  vi.spyOn(process, "kill").mockImplementation(() => {
    throw Object.assign(new Error("dead"), { code: "ESRCH" });
  });
  const replacement = JSON.stringify({ nonce: randomUUID(), pid: process.pid });
  const lstat = fs.lstat.bind(fs);
  let reads = 0;
  vi.spyOn(fs, "lstat").mockImplementation(async (candidate, ...options) => {
    if (candidate === lock) {
      reads += 1;
    }
    if (candidate === lock && reads === 2) {
      await fs.rename(lock, path.join(base, "old-lock"));
      await fs.writeFile(lock, replacement, { mode: 0o600 });
    }
    return lstat(candidate, ...options);
  });
  await expect(registry.inspect(siteId, source)).rejects.toMatchObject({
    code: "source_location_lock_changed",
  });
  expect(await fs.readFile(lock, "utf8")).toBe(replacement);
});

test("corrupt, oversized, and symlink locks remain untouched for manual recovery", async () => {
  await fs.mkdir(base);
  const lock = path.join(base, "source-locations.lock");
  for (const content of ["not json", "x".repeat(513)]) {
    // biome-ignore lint/performance/noAwaitInLoops: Reuse the exact same lock sequentially to test each malformed owner record.
    await fs.writeFile(lock, content, { mode: 0o600 });
    await expect(registry.inspect(siteId, source)).rejects.toMatchObject({
      code: "source_location_lock_needs_recovery",
    });
    expect(await fs.readFile(lock, "utf8")).toBe(content);
  }
  await fs.unlink(lock);
  const owner = path.join(base, "owner");
  await fs.writeFile(
    owner,
    JSON.stringify({ nonce: randomUUID(), pid: process.pid }),
    { mode: 0o600 }
  );
  await fs.symlink(owner, lock);
  await expect(registry.inspect(siteId, source)).rejects.toMatchObject({
    code: "source_location_lock_needs_recovery",
  });
  expect((await fs.lstat(lock)).isSymbolicLink()).toBe(true);
});

test("packaged bookmarks use the real extra resource while development uses the asset", async () => {
  const moduleDirectory = path.join(directory, "Resources", "app.asar");
  const resources = path.join(directory, "Resources");
  expect(bookmarkHelperPath(moduleDirectory, resources)).toBe(
    path.join(resources, "source-bookmark.jxa.js")
  );
  expect(
    bookmarkHelperPath(path.join(moduleDirectory, "apps", "desktop"), resources)
  ).toBe(path.join(resources, "source-bookmark.jxa.js"));
  const desktop = fileURLToPath(new URL(".", import.meta.url));
  expect(bookmarkHelperPath(desktop, resources)).toBe(
    path.join(desktop, "../assets/source-bookmark.jxa.js")
  );
  expect(await fs.readFile(bookmarkHelperPath(desktop), "utf8")).toMatch(
    FOUNDATION_IMPORT
  );
  const configuration = JSON.parse(
    await fs.readFile(path.join(desktop, "../package.json"), "utf8")
  );
  expect(configuration.build.extraResources).toContainEqual({
    from: "assets/source-bookmark.jxa.js",
    to: "source-bookmark.jxa.js",
  });
});

test.runIf(process.platform === "darwin")(
  "real Foundation bookmark follows a renamed disposable folder",
  async () => {
    const native = nativeBookmark();
    const data = await native.create(source);
    // biome-ignore lint/suspicious/noMisplacedAssertion: This assertion is inside the platform-conditional Vitest test.runIf callback.
    expect(typeof data).toBe("string");
    const renamed = path.join(directory, "renamed-native");
    await fs.rename(source, renamed);
    // biome-ignore lint/suspicious/noMisplacedAssertion: This assertion is inside the platform-conditional Vitest test.runIf callback.
    expect((await native.resolve(data)).path).toBe(renamed);
  },
  15_000
);
