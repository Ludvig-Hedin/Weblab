/** biome-ignore-all lint/suspicious/noBitwiseOperators: Registry bitwise expressions only inspect POSIX modes or combine Node open flags. */
/**
 * Source-location registry. No method grants filesystem access or edits
 * a site folder. Call capture only for a newly imported or created site.
 *
 * createSourceLocations({base, bookmark?}) exposes:
 * capture(siteId, sourcePath): enroll a new original, never overwrite a record.
 * inspect(siteId, fallbackPath, {resolve=false}): available/missing/
 * permissionDenied/needsConfirmation, sourcePath, generation, identity.
 * prepare(siteId, candidatePath): opaque expiring token, previousPath and the
 * checked candidate. The caller must validate Git compatibility beforehand.
 * confirm(siteId, token, {validateCandidate?}): rechecks identity and generation,
 * awaits the caller's Git-layout validation under the lock, persists the choice.
 * assertCurrent(siteId, generation, sourcePath, identity): reject stale plans.
 * findByPath(candidatePath, activeSiteIds?): unique saved binding by checked directory identity,
 * or null. Does not resolve bookmarks or enroll unknown originals.
 *
 * bookmark adapters provide async create(path)->base64 and
 * resolve(base64)->{path, stale}. Native adapter is quiet and macOS-only.
 * Storage/invalid/stale failures reject with a sanitized Error.code. Bookmark
 * failures only disable automatic recovery. Legacy records need confirmation.
 */
const fs = require("node:fs/promises");
const { constants } = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { execFile } = require("node:child_process");

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_BOOKMARK = 65_536;
const queues = new Map();
const DIGITS = /^\d+$/;
const BIRTHTIME = /^\d{1,32}$/;
const ASAR_PATH = /(^|[/\\])[^/\\]+\.asar([/\\]|$)/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const validPath = (value) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 4096 &&
  !value.includes("\0") &&
  path.isAbsolute(value) &&
  path.resolve(value) === value;
const validIdentity = (value) =>
  value &&
  typeof value === "object" &&
  DIGITS.test(value.dev) &&
  DIGITS.test(value.ino) &&
  typeof value.dev === "string" &&
  typeof value.ino === "string" &&
  value.dev.length < 32 &&
  value.ino.length < 32 &&
  (value.birthtimeNs === undefined ||
    (typeof value.birthtimeNs === "string" &&
      BIRTHTIME.test(value.birthtimeNs)));
const equalIdentity = (a, b) =>
  validIdentity(a) &&
  validIdentity(b) &&
  a.dev === b.dev &&
  a.ino === b.ino &&
  (!(a.birthtimeNs && b.birthtimeNs) || a.birthtimeNs === b.birthtimeNs);
function failure(code) {
  return Object.assign(new Error(code), { code });
}
function requireId(id) {
  if (typeof id !== "string" || !ID.test(id)) {
    throw failure("invalid_site_id");
  }
}

async function safeDirectory(root, create = false) {
  if (!validPath(root)) {
    throw failure("invalid_source_path");
  }
  // Check ancestors before mkdir/chmod; a symlink must never redirect storage.
  const segments = root.split(path.sep).filter(Boolean);
  let current = path.parse(root).root;
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      // biome-ignore lint/performance/noAwaitInLoops: Check each ancestor before touching its child.
      const st = await fs.lstat(current);
      if (st.isSymbolicLink() || !st.isDirectory()) {
        throw failure("unsafe_directory");
      }
    } catch (err) {
      if (err.code !== "ENOENT" || !create) {
        throw err;
      }
      // Create only the ancestor just verified as missing.
      await fs.mkdir(current, { mode: 0o700 });
    }
  }
  if ((await fs.realpath(root)) !== root) {
    throw failure("unsafe_directory");
  }
  const st = await fs.lstat(root, { bigint: true });
  if (st.isSymbolicLink() || !st.isDirectory()) {
    throw failure("unsafe_directory");
  }
  return {
    birthtimeNs: String(st.birthtimeNs),
    dev: String(st.dev),
    ino: String(st.ino),
  };
}

function bookmarkHelperPath(
  // biome-ignore lint/correctness/noGlobalDirnameFilename: Electron loads this module as CommonJS, where import.meta is unavailable.
  moduleDirectory = __dirname,
  resourcesDirectory = process.resourcesPath
) {
  if (ASAR_PATH.test(moduleDirectory)) {
    if (
      typeof resourcesDirectory !== "string" ||
      !path.isAbsolute(resourcesDirectory)
    ) {
      throw failure("bookmark_unavailable");
    }
    return path.join(resourcesDirectory, "source-bookmark.jxa.js");
  }
  return path.join(moduleDirectory, "../assets/source-bookmark.jxa.js");
}

function nativeBookmark() {
  function request(payload) {
    if (process.platform !== "darwin") {
      return Promise.reject(failure("bookmark_unavailable"));
    }
    const input = JSON.stringify(payload);
    if (input.length > 70_000) {
      return Promise.reject(failure("bookmark_unavailable"));
    }
    return new Promise((resolve, reject) => {
      execFile(
        "/usr/bin/osascript",
        ["-l", "JavaScript", bookmarkHelperPath(), input],
        { maxBuffer: 100_000, timeout: 5000, windowsHide: true },
        (error, stdout) => {
          if (error) {
            return reject(failure("bookmark_unavailable"));
          }
          try {
            const result = JSON.parse(stdout.trim());
            if (result.error) {
              throw failure("bookmark_unavailable");
            }
            resolve(result);
          } catch {
            reject(failure("bookmark_unavailable"));
          }
        }
      );
    });
  }
  return {
    create: async (sourcePath) =>
      (await request({ operation: "create", path: sourcePath })).bookmark,
    resolve: (bookmark) => request({ bookmark, operation: "resolve" }),
  };
}

function createSourceLocations({ base, bookmark = nativeBookmark() }) {
  if (!validPath(base)) {
    throw failure("invalid_storage_path");
  }
  const target = path.join(base, "source-locations.json");
  const lockPath = path.join(base, "source-locations.lock");
  const tokens = new Map();
  let storageIdentity;

  async function readBoundedJson(handle) {
    const bytes = Buffer.alloc(MAX_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      // biome-ignore lint/performance/noAwaitInLoops: Each bounded read continues at the prior byte offset.
      const chunk = await handle.read(
        bytes,
        length,
        bytes.length - length,
        length
      );
      if (!chunk.bytesRead) {
        break;
      }
      length += chunk.bytesRead;
    }
    if (length > MAX_BYTES) {
      throw failure("unsafe_source_locations");
    }
    return JSON.parse(bytes.subarray(0, length).toString("utf8"));
  }
  function validRecord(id, record) {
    return (
      ID.test(id) &&
      record &&
      validPath(record.sourcePath) &&
      validPath(record.originalSourcePath) &&
      validIdentity(record.identity) &&
      Number.isSafeInteger(record.generation) &&
      record.generation >= 1 &&
      (record.bookmark === null || validBookmark(record.bookmark))
    );
  }
  function validateState(state) {
    if (
      state?.version !== 1 ||
      !state.locations ||
      typeof state.locations !== "object" ||
      Array.isArray(state.locations) ||
      Object.keys(state.locations).length > 1000
    ) {
      throw failure("invalid_source_locations");
    }
    for (const [id, record] of Object.entries(state.locations)) {
      if (!validRecord(id, record)) {
        throw failure("invalid_source_locations");
      }
    }
    return state;
  }
  async function read() {
    let handle;
    try {
      const before = await fs.lstat(target);
      if (
        !before.isFile() ||
        before.isSymbolicLink() ||
        before.mode & 0o077 ||
        before.size > MAX_BYTES
      ) {
        throw failure("unsafe_source_locations");
      }
      handle = await fs.open(
        target,
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)
      );
      const st = await handle.stat();
      if (
        !st.isFile() ||
        st.mode & 0o077 ||
        st.size > MAX_BYTES ||
        st.dev !== before.dev ||
        st.ino !== before.ino
      ) {
        throw failure("unsafe_source_locations");
      }
      return validateState(await readBoundedJson(handle));
    } catch (err) {
      if (err.code === "ENOENT") {
        return { locations: {}, version: 1 };
      }
      if (err instanceof SyntaxError) {
        // JSON parsing failures can contain private bookmark data; expose only a stable code.
        throw failure("invalid_source_locations");
      }
      throw err;
    } finally {
      await handle?.close();
    }
  }
  async function write(state) {
    if (!equalIdentity(storageIdentity, await safeDirectory(base))) {
      throw failure("source_storage_changed");
    }
    try {
      const current = await fs.lstat(target);
      if (
        !current.isFile() ||
        current.isSymbolicLink() ||
        current.mode & 0o077
      ) {
        throw failure("unsafe_source_locations");
      }
    } catch (err) {
      if (err.code !== "ENOENT") {
        throw err;
      }
    }
    const content = JSON.stringify(state);
    if (
      Buffer.byteLength(content) > MAX_BYTES ||
      Object.keys(state.locations).length > 1000
    ) {
      throw failure("source_locations_full");
    }
    const temporary = path.join(base, `${randomUUID()}.source-locations.tmp`);
    try {
      const handle = await fs.open(temporary, "wx", 0o600);
      try {
        await handle.writeFile(content);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fs.rename(temporary, target);
      const directory = await fs.open(base, constants.O_RDONLY);
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }
  async function readLock() {
    const before = await fs.lstat(lockPath, { bigint: true });
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.mode & 0o077n ||
      before.size > 512n
    ) {
      throw failure("source_location_lock_needs_recovery");
    }
    const handle = await fs.open(
      lockPath,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)
    );
    try {
      const stat = await handle.stat({ bigint: true });
      if (
        !stat.isFile() ||
        stat.dev !== before.dev ||
        stat.ino !== before.ino ||
        stat.mode & 0o077n ||
        stat.size > 512n
      ) {
        throw failure("source_location_lock_needs_recovery");
      }
      const bytes = Buffer.alloc(513);
      const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
      if (bytesRead > 512) {
        throw failure("source_location_lock_needs_recovery");
      }
      let owner;
      try {
        owner = JSON.parse(bytes.subarray(0, bytesRead).toString("utf8"));
      } catch {
        // biome-ignore lint/style/useErrorCause: Corrupt owner metadata is redacted to a stable manual-recovery code.
        throw failure("source_location_lock_needs_recovery");
      }
      if (
        !(owner && Number.isSafeInteger(owner.pid)) ||
        owner.pid <= 0 ||
        typeof owner.nonce !== "string" ||
        !ID.test(owner.nonce)
      ) {
        throw failure("source_location_lock_needs_recovery");
      }
      return { owner, stat };
    } finally {
      await handle.close();
    }
  }
  async function removeDeadLock() {
    const { stat, owner } = await readLock();
    try {
      process.kill(owner.pid, 0);
      throw failure("source_locations_locked");
    } catch (err) {
      // Only ESRCH proves that the owner is dead. EPERM and every unknown
      // outcome preserve the lock, including PID reuse by a live process.
      if (err.code !== "ESRCH") {
        throw failure("source_locations_locked");
      }
    }
    const latest = await fs.lstat(lockPath, { bigint: true });
    if (
      !latest.isFile() ||
      latest.isSymbolicLink() ||
      latest.dev !== stat.dev ||
      latest.ino !== stat.ino ||
      latest.size !== stat.size ||
      latest.mtimeNs !== stat.mtimeNs ||
      latest.ctimeNs !== stat.ctimeNs
    ) {
      throw failure("source_location_lock_changed");
    }
    await fs.unlink(lockPath);
  }
  async function acquireLock() {
    const nonce = randomUUID();
    const temporary = path.join(base, `${nonce}.source-lock.tmp`);
    const handle = await fs.open(temporary, "wx", 0o600);
    let published = false;
    try {
      // Publish only complete, synced owner metadata. A crash before the
      // link leaves an inert temporary, never an ownerless active lock.
      await handle.writeFile(JSON.stringify({ nonce, pid: process.pid }));
      await handle.sync();
      const stat = await handle.stat({ bigint: true });
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          // biome-ignore lint/performance/noAwaitInLoops: Exclusive acquisition and dead-owner recovery must run in order.
          await fs.link(temporary, lockPath);
          published = true;
          return { handle, nonce, stat };
        } catch (err) {
          if (err.code !== "EEXIST") {
            throw err;
          }
          if (attempt) {
            throw failure("source_locations_locked");
          }
          // Recheck the old owner before retrying exclusive acquisition.
          await removeDeadLock();
        }
      }
      throw failure("source_locations_locked");
    } finally {
      if (!published) {
        await handle.close();
      }
      await fs.rm(temporary, { force: true }).catch(() => undefined);
    }
  }
  async function releaseLock(handle, owner, nonce) {
    await handle.close();
    const latest = await readLock();
    if (
      latest.stat.dev !== owner.dev ||
      latest.stat.ino !== owner.ino ||
      latest.owner.pid !== process.pid ||
      latest.owner.nonce !== nonce
    ) {
      throw failure("source_location_lock_changed");
    }
    await fs.unlink(lockPath);
  }
  async function locked(operation) {
    const previous = queues.get(base) ?? Promise.resolve();
    const pending = previous
      .catch(() => undefined)
      .then(async () => {
        storageIdentity = await safeDirectory(base, true);
        await fs.chmod(base, 0o700);
        const { handle, stat: owner, nonce } = await acquireLock();
        let value;
        let operationError;
        let failed = false;
        try {
          value = await operation(await read());
        } catch (error) {
          operationError = error;
          failed = true;
        }
        try {
          await releaseLock(handle, owner, nonce);
        } catch (error) {
          if (!failed) {
            operationError = error;
            failed = true;
          }
        }
        if (failed) {
          throw operationError;
        }
        return value;
      });
    queues.set(base, pending);
    try {
      return await pending;
    } catch (err) {
      // Registry failures intentionally expose only safe codes, never path-bearing causes.
      throw failure(
        typeof err?.code === "string" ? err.code : "source_location_unavailable"
      );
    } finally {
      if (queues.get(base) === pending) {
        queues.delete(base);
      }
    }
  }
  function validBookmark(value) {
    return (
      typeof value === "string" &&
      value.length > 0 &&
      value.length <= MAX_BOOKMARK &&
      BASE64.test(value)
    );
  }
  async function makeBookmark(sourcePath) {
    try {
      const result = await bookmark.create(sourcePath);
      return validBookmark(result) ? result : null;
    } catch {
      return null;
    }
  }
  function locationResult(record, status = "available") {
    return {
      generation: record.generation,
      identity: { ...record.identity },
      sourcePath: record.sourcePath,
      status,
    };
  }
  async function probe(sourcePath) {
    try {
      return { identity: await safeDirectory(sourcePath) };
    } catch (err) {
      if (["EACCES", "EPERM"].includes(err.code)) {
        return { status: "permissionDenied" };
      }
      if (["ENOENT", "ENOTDIR"].includes(err.code)) {
        return { status: "missing" };
      }
      return { status: "needsConfirmation" };
    }
  }
  async function validateMovedCandidate(
    moved,
    validateCandidate,
    candidatePath
  ) {
    if (moved && validateCandidate) {
      await validateCandidate(candidatePath);
    }
  }
  async function recoverBookmark(state, record, validateCandidate) {
    let recovered;
    try {
      recovered = await bookmark.resolve(record.bookmark);
    } catch {
      return null;
    }
    if (!validPath(recovered?.path)) {
      return null;
    }
    const candidate = await probe(recovered.path);
    if (!equalIdentity(record.identity, candidate.identity)) {
      return null;
    }
    const moved = recovered.path !== record.sourcePath;
    const refreshed =
      moved || recovered.stale ? await makeBookmark(recovered.path) : null;
    await validateMovedCandidate(moved, validateCandidate, recovered.path);
    if (
      !equalIdentity(record.identity, (await probe(recovered.path)).identity)
    ) {
      return null;
    }
    if (moved || refreshed) {
      record.sourcePath = recovered.path;
      if (moved) {
        record.generation = nextGeneration(record);
      }
      record.bookmark = refreshed ?? record.bookmark;
      await write(state);
    }
    return locationResult(record);
  }
  function nextGeneration(record) {
    const generation = (record?.generation ?? 0) + 1;
    if (!Number.isSafeInteger(generation)) {
      throw failure("source_generation_exhausted");
    }
    return generation;
  }
  function pruneTokens() {
    for (const [token, entry] of tokens) {
      if (entry.expires < Date.now()) {
        tokens.delete(token);
      }
    }
    while (tokens.size >= 128) {
      tokens.delete(tokens.keys().next().value);
    }
  }
  return {
    async assertCurrent(siteId, generation, sourcePath, identity) {
      requireId(siteId);
      return await locked(async (state) => {
        const record = state.locations[siteId];
        if (
          !record ||
          record.generation !== generation ||
          record.sourcePath !== sourcePath ||
          !equalIdentity(record.identity, identity) ||
          !equalIdentity(record.identity, (await probe(sourcePath)).identity)
        ) {
          throw failure("source_location_stale");
        }
        return locationResult(record);
      });
    },
    async capture(siteId, sourcePath) {
      requireId(siteId);
      return await locked(async (state) => {
        if (state.locations[siteId]) {
          throw failure("source_location_exists");
        }
        const identity = await safeDirectory(sourcePath);
        const savedBookmark = await makeBookmark(sourcePath);
        if (!equalIdentity(identity, await safeDirectory(sourcePath))) {
          throw failure("source_changed");
        }
        const record = {
          bookmark: savedBookmark,
          generation: 1,
          identity,
          originalSourcePath: sourcePath,
          sourcePath,
        };
        state.locations[siteId] = record;
        await write(state);
        return locationResult(record);
      });
    },
    async confirm(siteId, token, { validateCandidate } = {}) {
      requireId(siteId);
      if (
        validateCandidate !== undefined &&
        typeof validateCandidate !== "function"
      ) {
        throw failure("invalid_candidate_validator");
      }
      const pending = tokens.get(token);
      tokens.delete(token);
      if (
        !pending ||
        pending.siteId !== siteId ||
        pending.expires < Date.now()
      ) {
        throw failure("source_confirmation_expired");
      }
      return await locked(async (state) => {
        const record = state.locations[siteId];
        if ((record?.generation ?? 0) !== pending.generation) {
          throw failure("source_confirmation_stale");
        }
        if (
          !equalIdentity(
            pending.identity,
            await safeDirectory(pending.sourcePath)
          )
        ) {
          throw failure("source_changed");
        }
        const savedBookmark = await makeBookmark(pending.sourcePath);
        if (validateCandidate) {
          await validateCandidate(pending.sourcePath);
        }
        if (
          !equalIdentity(
            pending.identity,
            await safeDirectory(pending.sourcePath)
          )
        ) {
          throw failure("source_changed");
        }
        const confirmed = {
          bookmark: savedBookmark,
          generation: nextGeneration(record),
          identity: pending.identity,
          originalSourcePath: record?.originalSourcePath ?? pending.sourcePath,
          sourcePath: pending.sourcePath,
        };
        state.locations[siteId] = confirmed;
        await write(state);
        return locationResult(confirmed);
      });
    },
    async findByPath(candidatePath, activeSiteIds) {
      if (
        activeSiteIds !== undefined &&
        (!Array.isArray(activeSiteIds) ||
          activeSiteIds.length > 1000 ||
          activeSiteIds.some((id) => typeof id !== "string" || !ID.test(id)))
      ) {
        throw failure("invalid_site_ids");
      }
      return await locked(async (state) => {
        const identity = await safeDirectory(candidatePath);
        const active =
          activeSiteIds === undefined ? null : new Set(activeSiteIds);
        const matches = Object.entries(state.locations).filter(
          ([id, savedRecord]) =>
            (!active || active.has(id)) &&
            equalIdentity(savedRecord.identity, identity)
        );
        if (matches.length !== 1) {
          return null;
        }
        const [siteId, record] = matches[0];
        return { siteId, ...locationResult(record) };
      });
    },
    async inspect(
      siteId,
      fallbackPath,
      { resolve = false, validateCandidate } = {}
    ) {
      requireId(siteId);
      if (!validPath(fallbackPath)) {
        throw failure("invalid_source_path");
      }
      return await locked(async (state) => {
        const record = state.locations[siteId];
        if (!record) {
          return {
            generation: 0,
            identity: null,
            sourcePath: fallbackPath,
            status: "needsConfirmation",
          };
        }
        const current = await probe(record.sourcePath);
        if (resolve && record.bookmark) {
          const recovered = await recoverBookmark(
            state,
            record,
            validateCandidate
          );
          if (recovered) {
            return recovered;
          }
        }
        const latest = resolve ? await probe(record.sourcePath) : current;
        if (equalIdentity(record.identity, latest.identity)) {
          return locationResult(record);
        }
        return locationResult(
          record,
          latest.identity ? "needsConfirmation" : latest.status
        );
      });
    },
    async prepare(siteId, candidatePath) {
      requireId(siteId);
      return await locked(async (state) => {
        const identity = await safeDirectory(candidatePath);
        const record = state.locations[siteId];
        pruneTokens();
        const token = randomUUID();
        tokens.set(token, {
          expires: Date.now() + 5 * 60 * 1000,
          generation: record?.generation ?? 0,
          identity,
          siteId,
          sourcePath: candidatePath,
        });
        return {
          generation: record?.generation ?? 0,
          identity: { ...identity },
          previousPath: record?.sourcePath ?? null,
          sourcePath: candidatePath,
          token,
        };
      });
    },
    async rebindKnownPath(siteId, candidatePath, { validateCandidate } = {}) {
      requireId(siteId);
      return await locked(async (state) => {
        const record = state.locations[siteId];
        const candidate = await safeDirectory(candidatePath);
        if (!(record && equalIdentity(record.identity, candidate))) {
          throw failure("source_location_stale");
        }
        if (record.sourcePath !== candidatePath) {
          const refreshed = await makeBookmark(candidatePath);
          if (validateCandidate) {
            await validateCandidate(candidatePath);
          }
          if (
            !equalIdentity(record.identity, await safeDirectory(candidatePath))
          ) {
            throw failure("source_changed");
          }
          record.sourcePath = candidatePath;
          record.generation = nextGeneration(record);
          record.bookmark = refreshed ?? record.bookmark;
          await write(state);
        }
        return locationResult(record);
      });
    },
  };
}

module.exports = { bookmarkHelperPath, createSourceLocations, nativeBookmark };
