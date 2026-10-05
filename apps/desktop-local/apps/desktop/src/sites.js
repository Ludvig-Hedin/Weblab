// The list of sites on the dashboard, and creating a new one from the template.

const { app } = require("electron");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const { basename, extname, join } = require("node:path");
const { execFileSync } = require("node:child_process");
const { templateDir, canUseGit } = require("./runtime");
const { copyLinkedFiles } = require("./import-html");

const storePath = () => join(app.getPath("userData"), "sites.json");

function readAll() {
  try {
    const data = JSON.parse(fs.readFileSync(storePath(), "utf8"));
    return Array.isArray(data.sites) ? data.sites : [];
  } catch {
    return [];
  }
}

function writeAll(sites) {
  const file = storePath();
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify({ sites }, null, 2));
  fs.renameSync(`${file}.tmp`, file);
}

function list() {
  return readAll()
    .map((site) => ({
      ...site,
      missing: !fs.existsSync(
        site.entry ? join(site.path, site.entry) : site.path
      ),
    }))
    .sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0));
}

function get(id) {
  return readAll().find((site) => site.id === id);
}

function add(path, name) {
  const sites = readAll();
  const existing = sites.find((entry) => entry.path === path && !entry.entry);
  if (existing) {
    return existing;
  }
  const site = {
    id: randomUUID(),
    lastOpened: null,
    name: name || basename(path),
    path,
  };
  sites.push(site);
  writeAll(sites);
  return site;
}

/** Import a plain HTML file and its linked assets into a separate site. */
function addHtml(file) {
  if (!looksLikeHtml(file)) {
    throw new Error("Choose an HTML file.");
  }
  const sites = readAll();
  const existing = sites.find((saved) => saved.sourceFile === file);
  if (existing && fs.existsSync(join(existing.path, existing.entry))) {
    return existing;
  }
  const { dir: path, folderName } = reserveDir(basename(file, extname(file)));
  fs.mkdirSync(path);
  let entry;
  try {
    entry = copyLinkedFiles(file, path);
    initGit(path, "Imported HTML");
  } catch (error) {
    fs.rmSync(path, { force: true, recursive: true });
    throw error;
  }
  const site = {
    entry,
    id: randomUUID(),
    lastOpened: null,
    name: folderName,
    path,
    sourceFile: file,
  };
  sites.push(site);
  writeAll(sites);
  return site;
}

function looksLikeHtml(file) {
  try {
    return (
      extname(file).toLowerCase() === ".html" && fs.statSync(file).isFile()
    );
  } catch {
    return false;
  }
}

function remove(id) {
  writeAll(readAll().filter((site) => site.id !== id));
}

function touch(id) {
  const sites = readAll();
  const site = sites.find((entry) => entry.id === id);
  if (!site) {
    return;
  }
  site.lastOpened = Date.now();
  writeAll(sites);
}

/** A folder Weblab can open: a package.json with a dev script. */
function looksLikeSite(path) {
  try {
    const pkg = JSON.parse(fs.readFileSync(join(path, "package.json"), "utf8"));
    return Boolean(pkg.scripts?.dev);
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
  const sites = readAll();
  const site = sites.find((entry) => entry.id === id);
  if (!site) {
    return;
  }
  site.skippedSettings = keys;
  writeAll(sites);
}

module.exports = {
  add,
  addHtml,
  create,
  get,
  initGit,
  list,
  looksLikeHtml,
  looksLikeSite,
  remove,
  reserveDir,
  setSkipped,
  touch,
};
