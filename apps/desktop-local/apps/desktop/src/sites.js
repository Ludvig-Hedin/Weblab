/** biome-ignore-all lint/suspicious/noBitwiseOperators: Metadata checks only inspect POSIX modes or combine Node open flags. */
// The list of sites on the dashboard, and creating a new one from the template.

const { app } = require("electron");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const { basename, extname, join } = require("node:path");
const { execFileSync } = require("node:child_process");
const { templateDir, canUseGit } = require("./runtime");
const { copyLinkedFiles } = require("./import-html");

const { createSourceLocations } = require("./source-location");
const { AsyncLocalStorage } = require("node:async_hooks");
const sourceContext = new AsyncLocalStorage();
const { constants } = fs;
const { isAbsolute, resolve } = require("node:path");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENTRY_SEPARATOR = /[/\\]/;
const GIT_POINTER = /^gitdir: (.+)\r?\n?$/;
const STORE_LIMIT = 2 * 1024 * 1024;
const storePath = () => join(app.getPath("userData"), "sites.json");
let locations;
let addQueue = Promise.resolve();
let isSiteOpen = () => false;

function locationStore() {
  locations ||= createSourceLocations({
    base: join(app.getPath("userData"), "source-tracking"),
  });
  return locations;
}

function readStore() {
  const file = storePath();
  let descriptor;
  try {
    const before = fs.lstatSync(file);
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.size > STORE_LIMIT
    ) {
      throw new Error("The saved site list needs recovery.");
    }
    descriptor = fs.openSync(
      file,
      constants.O_RDONLY | (constants.O_NOFOLLOW || 0)
    );
    const stat = fs.fstatSync(descriptor);
    if (
      !stat.isFile() ||
      stat.dev !== before.dev ||
      stat.ino !== before.ino ||
      stat.size > STORE_LIMIT
    ) {
      throw new Error("The saved site list needs recovery.");
    }
    const bytes = Buffer.alloc(STORE_LIMIT + 1);
    const length = fs.readSync(descriptor, bytes, 0, bytes.length, 0);
    if (length > STORE_LIMIT) {
      throw new Error("The saved site list needs recovery.");
    }
    const data = JSON.parse(bytes.subarray(0, length).toString("utf8"));
    if (
      !(data && Array.isArray(data.sites)) ||
      data.sites.length > 1000 ||
      (data.folders !== undefined &&
        (!Array.isArray(data.folders) || data.folders.length > 200)) ||
      data.sites.some(
        (site) =>
          !(site && UUID.test(site.id)) ||
          typeof site.path !== "string" ||
          !isAbsolute(site.path)
      ) ||
      (data.folders || []).some(
        (folder) =>
          !(folder && UUID.test(folder.id)) || typeof folder.name !== "string"
      )
    ) {
      throw new Error("The saved site list needs recovery.");
    }
    return { ...data, folders: data.folders || [] };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { folders: [], sites: [] };
    }
    // biome-ignore lint/style/useErrorCause: Store parse errors can contain private paths; expose a safe recovery message.
    throw new Error(
      "The saved site list needs recovery. Your site folders have not changed."
    );
  } finally {
    if (descriptor !== undefined) {
      fs.closeSync(descriptor);
    }
  }
}

function writeStore(data) {
  const file = storePath();
  const root = app.getPath("userData");
  fs.mkdirSync(root, { mode: 0o700, recursive: true });
  if (fs.lstatSync(root).isSymbolicLink() || fs.realpathSync(root) !== root) {
    throw new Error("The saved site list needs recovery.");
  }
  if (
    fs.existsSync(file) &&
    (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink())
  ) {
    throw new Error("The saved site list needs recovery.");
  }
  const bytes = JSON.stringify(data, null, 2);
  if (
    Buffer.byteLength(bytes) > STORE_LIMIT ||
    data.sites.length > 1000 ||
    data.folders.length > 200
  ) {
    throw new Error("The saved site list is full.");
  }
  const temporary = `${file}.${randomUUID()}.tmp`;
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, file);
  } finally {
    if (descriptor !== undefined) {
      fs.closeSync(descriptor);
    }
    fs.rmSync(temporary, { force: true });
  }
}

function updateSite(id, change) {
  const data = readStore();
  const site = data.sites.find((entry) => entry.id === id);
  if (!site) {
    throw new Error("This site is no longer in your list.");
  }
  Object.assign(site, change);
  writeStore(data);
  return site;
}

function get(id) {
  return readStore().sites.find((site) => site.id === id);
}

function folderList() {
  return readStore().folders;
}
function folderCreate(rawName) {
  const name = cleanName(rawName);
  const data = readStore();
  if (!name) {
    throw new Error("Give your folder a name.");
  }
  if (
    data.folders.some(
      (savedFolder) => savedFolder.name.toLowerCase() === name.toLowerCase()
    )
  ) {
    throw new Error("A folder with this name already exists.");
  }
  const folder = { id: randomUUID(), name };
  data.folders.push(folder);
  writeStore(data);
  return folder;
}
function folderRename(id, rawName) {
  const name = cleanName(rawName);
  const data = readStore();
  const folder = data.folders.find((entry) => entry.id === id);
  if (!(folder && name)) {
    throw new Error("Give your folder a name.");
  }
  if (
    data.folders.some(
      (entry) =>
        entry.id !== id && entry.name.toLowerCase() === name.toLowerCase()
    )
  ) {
    throw new Error("A folder with this name already exists.");
  }
  folder.name = name;
  writeStore(data);
  return folder;
}
function folderRemove(id) {
  const data = readStore();
  data.folders = data.folders.filter((folder) => folder.id !== id);
  for (const site of data.sites) {
    if (site.folderId === id) {
      site.folderId = undefined;
    }
  }
  writeStore(data);
}
function moveToFolder(id, folderId) {
  const data = readStore();
  const site = data.sites.find((entry) => entry.id === id);
  if (
    !site ||
    (folderId !== null &&
      !data.folders.some((folder) => folder.id === folderId))
  ) {
    throw new Error("This folder is no longer in your list.");
  }
  if (folderId === null) {
    site.folderId = undefined;
  } else {
    site.folderId = folderId;
  }
  writeStore(data);
  return site;
}

function rememberLocation(site, location) {
  const current = get(site.id);
  if (!current) {
    throw new Error("This site is no longer in your list.");
  }
  const updated =
    current.path === location.sourcePath
      ? current
      : updateSite(site.id, { path: location.sourcePath });
  Object.defineProperty(updated, "_location", { value: location });
  return updated;
}

function unavailable() {
  return Object.assign(
    new Error(
      "Locate this site’s folder in Show details before opening or changing it."
    ),
    { code: "source-unavailable" }
  );
}
function validateRecovery(site, candidate) {
  if (isSiteOpen(site.id) && get(site.id)?.path !== candidate) {
    throw new Error(
      "Close this site in every window before reconnecting its folder."
    );
  }
  validateSitePath(site, candidate);
}
function rootIdentity(root) {
  const stat = fs.lstatSync(root, { bigint: true });
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    fs.realpathSync(root) !== root
  ) {
    throw unavailable();
  }
  return {
    birthtimeNs: String(stat.birthtimeNs),
    dev: String(stat.dev),
    ino: String(stat.ino),
  };
}
function sameIdentity(left, right) {
  return (
    left &&
    right &&
    left.dev === right.dev &&
    left.ino === right.ino &&
    (!(left.birthtimeNs && right.birthtimeNs) ||
      left.birthtimeNs === right.birthtimeNs)
  );
}
function currentRootMatches(site) {
  try {
    return sameIdentity(site._location?.identity, rootIdentity(site.path));
  } catch {
    return false;
  }
}

/** Immediate command/write guard. Keeps the captured path across every await. */
function checkVerifiedSite(site) {
  if (
    !(site?._location && currentRootMatches(site)) ||
    get(site.id)?.path !== site.path
  ) {
    throw unavailable();
  }
  let descriptor;
  try {
    const file = join(
      app.getPath("userData"),
      "source-tracking",
      "source-locations.json"
    );
    if (fs.realpathSync(file) !== file) {
      throw unavailable();
    }
    descriptor = fs.openSync(
      file,
      constants.O_RDONLY | (constants.O_NOFOLLOW || 0)
    );
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.mode & 0o077 || stat.size > STORE_LIMIT) {
      throw unavailable();
    }
    const bytes = Buffer.alloc(STORE_LIMIT + 1);
    const length = fs.readSync(descriptor, bytes, 0, bytes.length, 0);
    if (length > STORE_LIMIT) {
      throw unavailable();
    }
    const stored = JSON.parse(bytes.subarray(0, length).toString("utf8"))
      .locations?.[site.id];
    if (
      !stored ||
      stored.sourcePath !== site.path ||
      stored.generation !== site._location.generation ||
      !sameIdentity(stored.identity, site._location.identity)
    ) {
      throw unavailable();
    }
    validateSitePath(site, site.path);
    return site;
  } catch {
    // biome-ignore lint/style/useErrorCause: Source errors are redacted before IPC; causes may contain private paths.
    throw unavailable();
  } finally {
    if (descriptor !== undefined) {
      fs.closeSync(descriptor);
    }
  }
}
function withVerified(site, operation) {
  const captured = { entry: site.entry, id: site.id, path: site.path };
  Object.defineProperty(captured, "_location", {
    value: Object.freeze({
      ...site._location,
      identity: Object.freeze({ ...site._location.identity }),
    }),
  });
  return sourceContext.run(Object.freeze(captured), operation);
}
function checkVerifiedPath(root) {
  const captured = sourceContext.getStore();
  if (!captured || captured.path !== root) {
    throw unavailable();
  }
  return checkVerifiedSite(captured);
}

/** Validates the existing layout without repairing Git pointers or changing files. */
function validateSitePath(site, root) {
  rootIdentity(root);
  const file = site.entry ? join(root, site.entry) : join(root, "package.json");
  if (
    site.entry &&
    (isAbsolute(site.entry) ||
      site.entry
        .split(ENTRY_SEPARATOR)
        .some((part) => !part || part === ".." || part === "."))
  ) {
    throw unavailable();
  }
  const stat = fs.lstatSync(file);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    fs.realpathSync(file) !== file
  ) {
    throw unavailable();
  }
  if (!(site.entry || looksLikeSite(root))) {
    throw new Error("Choose a website folder with a dev script.");
  }
  validateGitLayout(root);
}

function validateGitLayout(root) {
  const gitPath = join(root, ".git");
  if (!fs.existsSync(gitPath)) {
    // A dangling symlink must not masquerade as a site without Git.
    try {
      fs.lstatSync(gitPath);
      throw unavailable();
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
    return;
  }
  const gitStat = fs.lstatSync(gitPath);
  if (
    gitStat.isSymbolicLink() ||
    !(gitStat.isFile() || gitStat.isDirectory())
  ) {
    throw unavailable();
  }
  let gitDirectory = gitPath;
  if (gitStat.isFile()) {
    if (gitStat.size > 4096) {
      throw unavailable();
    }
    const pointer = GIT_POINTER.exec(fs.readFileSync(gitPath, "utf8"));
    if (!pointer) {
      throw unavailable();
    }
    gitDirectory = resolve(root, pointer[1]);
  }
  rootIdentity(gitDirectory);
  const common = join(gitDirectory, "commondir");
  if (fs.existsSync(common)) {
    const commonStat = fs.lstatSync(common);
    if (
      !commonStat.isFile() ||
      commonStat.isSymbolicLink() ||
      commonStat.size > 4096
    ) {
      throw unavailable();
    }
    rootIdentity(resolve(gitDirectory, fs.readFileSync(common, "utf8").trim()));
  }
  const top = execFileSync(
    "/usr/bin/git",
    [
      "--no-optional-locks",
      "-c",
      "core.fsmonitor=false",
      "rev-parse",
      "--show-toplevel",
    ],
    {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000,
    }
  ).trim();
  if (fs.realpathSync(top) !== root) {
    throw unavailable();
  }
}

async function verified(id, { resolve: shouldResolve = false } = {}) {
  const site = get(id);
  if (!site) {
    throw unavailable();
  }
  try {
    const location = await locationStore().inspect(id, site.path, {
      resolve: shouldResolve && !isSiteOpen(id),
      validateCandidate: (candidate) => validateRecovery(site, candidate),
    });
    if (location.status !== "available") {
      throw unavailable();
    }
    validateSitePath(site, location.sourcePath);
    await locationStore().assertCurrent(
      id,
      location.generation,
      location.sourcePath,
      location.identity
    );
    return rememberLocation(site, location);
  } catch {
    // biome-ignore lint/style/useErrorCause: Source errors are redacted before IPC; causes may contain private paths.
    throw unavailable();
  }
}
async function assertVerified(site) {
  if (!site?._location) {
    throw unavailable();
  }
  try {
    const { generation, identity } = site._location;
    await locationStore().assertCurrent(
      site.id,
      generation,
      site.path,
      identity
    );
    validateSitePath(site, site.path);
    return site;
  } catch {
    // biome-ignore lint/style/useErrorCause: Source errors are redacted before IPC; causes may contain private paths.
    throw unavailable();
  }
}

async function list() {
  const rows = [];
  for (const site of readStore().sites) {
    let status = "needsConfirmation";
    let saved = site;
    try {
      // biome-ignore lint/performance/noAwaitInLoops: Registry writes are serialized; inspect cards in order without spawning bookmark scans.
      const location = await locationStore().inspect(site.id, site.path);
      ({ status } = location);
      if (status === "available") {
        saved = rememberLocation(site, location);
      }
    } catch {
      /* Keep unresolved cards so the user can recover them. */
    }
    rows.push({ ...saved, missing: status !== "available", status });
  }
  return rows.sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0));
}
async function details(id) {
  let site = get(id);
  if (!site) {
    throw unavailable();
  }
  let status = "needsConfirmation";
  try {
    const location = await locationStore().inspect(id, site.path, {
      resolve: !isSiteOpen(id),
      validateCandidate: (candidate) => validateRecovery(site, candidate),
    });
    ({ status } = location);
    if (status === "available") {
      site = await verified(id);
    }
  } catch {
    status = "needsConfirmation";
  }
  return {
    folderName:
      folderList().find((folder) => folder.id === site.folderId)?.name || null,
    kind: site.entry ? "html" : "project",
    lastOpened: site.lastOpened || null,
    path: site.path,
    site,
    status,
  };
}
async function prepareLocation(id, candidatePath) {
  if (isSiteOpen(id)) {
    throw new Error(
      "Close this site in every window before choosing a folder."
    );
  }
  const site = get(id);
  if (!site) {
    throw unavailable();
  }
  const candidate = resolve(candidatePath);
  validateSitePath(site, candidate);
  const prepared = await locationStore().prepare(id, candidate);
  if (isSiteOpen(id)) {
    throw new Error(
      "Close this site in every window before choosing a folder."
    );
  }
  return {
    path: prepared.sourcePath,
    previousPath: prepared.previousPath || site.path,
    token: prepared.token,
  };
}
async function confirmLocation(id, token) {
  if (isSiteOpen(id)) {
    throw new Error(
      "Close this site in every window before changing its folder."
    );
  }
  const site = get(id);
  if (!site) {
    throw unavailable();
  }
  const location = await locationStore().confirm(id, token, {
    validateCandidate: (candidate) => {
      if (isSiteOpen(id) || !get(id)) {
        throw new Error(
          "Close this site in every window before changing its folder."
        );
      }
      validateSitePath(site, candidate);
    },
  });
  return rememberLocation(site, location);
}
function setOpenChecker(check) {
  isSiteOpen = check;
}

function serialAdd(operation) {
  const next = addQueue.catch(() => undefined).then(operation);
  addQueue = next;
  return next;
}
async function addRoot(candidateRoot, name) {
  const root = resolve(candidateRoot);
  rootIdentity(root);
  const data = readStore();
  const known = await locationStore().findByPath(
    root,
    data.sites.map((site) => site.id)
  );
  if (known) {
    const site = get(known.siteId);
    validateSitePath(site, root);
    if (isSiteOpen(site.id) && site.path !== root) {
      throw new Error(
        "Close this site in every window before reconnecting its folder."
      );
    }
    return rememberLocation(
      site,
      await locationStore().rebindKnownPath(site.id, root, {
        validateCandidate: () => {
          if (isSiteOpen(site.id) && get(site.id)?.path !== root) {
            throw new Error(
              "Close this site in every window before reconnecting its folder."
            );
          }
          validateSitePath(site, root);
        },
      })
    );
  }
  if (data.sites.some((site) => site.path === root)) {
    throw unavailable();
  }
  validateSitePath({}, root);
  const newSite = {
    id: randomUUID(),
    lastOpened: null,
    name: name || basename(root),
    path: root,
  };
  const location = await locationStore().capture(newSite.id, root);
  const current = readStore();
  current.sites.push(newSite);
  writeStore(current);
  return rememberLocation(newSite, location);
}
function add(root, name) {
  return serialAdd(() => addRoot(root, name));
}

function fileIdentity(file) {
  const stat = fs.lstatSync(file, { bigint: true });
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    fs.realpathSync(file) !== file
  ) {
    throw new Error("Choose an HTML file.");
  }
  return {
    birthtimeNs: String(stat.birthtimeNs),
    dev: String(stat.dev),
    ino: String(stat.ino),
  };
}
/** Imports HTML into its own editable folder. Original-file reuse also requires proof. */
function addHtml(selectedFile) {
  return serialAdd(async () => {
    const file = resolve(selectedFile);
    if (!looksLikeHtml(file)) {
      throw new Error("Choose an HTML file.");
    }
    const identity = fileIdentity(file);
    const saved = readStore().sites;
    const sameFile = saved.find(
      (site) =>
        site.sourceFileIdentity &&
        sameIdentity(site.sourceFileIdentity, identity)
    );
    const oldPath = saved.find((site) => site.sourceFile === file);
    if (sameFile) {
      const site = await verified(sameFile.id, { resolve: true });
      if (site.sourceFile !== file) {
        return updateSite(site.id, { sourceFile: file });
      }
      return site;
    }
    if (oldPath) {
      throw unavailable();
    }
    const { dir: root, folderName } = reserveDir(basename(file, extname(file)));
    fs.mkdirSync(root);
    let entry;
    try {
      entry = copyLinkedFiles(file, root);
      initGit(root, "Imported HTML");
      if (!sameIdentity(identity, fileIdentity(file))) {
        throw new Error("The HTML file changed. Choose it again.");
      }
      const site = {
        entry,
        id: randomUUID(),
        lastOpened: null,
        name: folderName,
        path: root,
        sourceFile: file,
        sourceFileIdentity: identity,
      };
      validateSitePath(site, root);
      await locationStore().capture(site.id, root);
      const data = readStore();
      data.sites.push(site);
      writeStore(data);
      return site;
    } catch (error) {
      fs.rmSync(root, { force: true, recursive: true });
      throw error;
    }
  });
}
function looksLikeHtml(file) {
  try {
    return (
      extname(file).toLowerCase() === ".html" &&
      fs.lstatSync(file).isFile() &&
      !fs.lstatSync(file).isSymbolicLink()
    );
  } catch {
    return false;
  }
}
function remove(id) {
  if (isSiteOpen(id)) {
    throw new Error("Close this site before removing it from the list.");
  }
  const data = readStore();
  data.sites = data.sites.filter((site) => site.id !== id);
  writeStore(data);
}
function touch(id) {
  if (get(id)) {
    updateSite(id, { lastOpened: Date.now() });
  }
}

/** A folder Weblab can open: a package.json with a dev script. */
function looksLikeSite(path) {
  try {
    const pkg = JSON.parse(fs.readFileSync(join(path, "package.json"), "utf8"));
    return (
      typeof pkg.scripts?.dev === "string" && pkg.scripts.dev.trim().length > 0
    );
  } catch {
    return false;
  }
}

// Characters Finder or the shell cannot take in a folder name, plus control
// characters (built from char codes so none sits in a regex literal).
const UNSAFE_NAME_CHARS = new RegExp(
  `[/\\\\:*?"<>|${String.fromCharCode(0)}-${String.fromCharCode(31)}]`,
  "g"
);
const LEADING_DOTS = /^\.+/;
const WHITESPACE_RUN = /\s+/g;

function cleanName(raw) {
  return String(raw || "")
    .replace(UNSAFE_NAME_CHARS, " ")
    .replace(LEADING_DOTS, "")
    .replace(WHITESPACE_RUN, " ")
    .trim()
    .slice(0, 80);
}

function slug(name) {
  return (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "website"
  );
}

function initGit(dir, message) {
  if (!canUseGit()) {
    return;
  }
  const git = (args) =>
    execFileSync("/usr/bin/git", args, {
      cwd: dir,
      stdio: "ignore",
      timeout: 20_000,
    });
  try {
    let identity = [];
    try {
      execFileSync("/usr/bin/git", ["config", "user.email"], {
        cwd: dir,
        stdio: "ignore",
        timeout: 5000,
      });
    } catch {
      identity = [
        "-c",
        "user.name=Weblab",
        "-c",
        "user.email=weblab@localhost",
      ];
    }
    git(["init", "-q", "-b", "main"]);
    git(["add", "-A"]);
    git([...identity, "commit", "-q", "-m", message]);
  } catch {
    // Version history is a bonus. The site works without it.
  }
}

/** A free folder under ~/Documents/Weblab for `rawName`, adding " 2", " 3"… if taken. */
function reserveDir(rawName) {
  const name = cleanName(rawName);
  if (!name) {
    throw new Error("Give your website a name.");
  }
  const root = join(app.getPath("documents"), "Weblab");
  fs.mkdirSync(root, { recursive: true });
  let folderName = name;
  for (let n = 2; fs.existsSync(join(root, folderName)); n += 1) {
    folderName = `${name} ${n}`;
  }
  return { dir: join(root, folderName), folderName };
}

function create(rawName) {
  const { dir, folderName } = reserveDir(rawName);
  fs.cpSync(templateDir(), dir, { recursive: true });
  fs.renameSync(join(dir, "gitignore"), join(dir, ".gitignore"));
  const pkgPath = join(dir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  pkg.name = slug(folderName);
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  initGit(dir, "New website");
  return add(dir, folderName);
}

/** Remembers which settings the user chose to skip, so we ask only about new ones. */
function setSkipped(id, keys) {
  if (get(id)) {
    updateSite(id, { skippedSettings: keys });
  }
}

module.exports = {
  add,
  addHtml,
  assertVerified,
  checkVerifiedPath,
  checkVerifiedSite,
  confirmLocation,
  create,
  currentRootMatches,
  details,
  folderCreate,
  folderList,
  folderRemove,
  folderRename,
  get,
  initGit,
  list,
  looksLikeHtml,
  looksLikeSite,
  moveToFolder,
  prepareLocation,
  remove,
  reserveDir,
  setOpenChecker,
  setSkipped,
  touch,
  validateSitePath,
  verified,
  withVerified,
};
