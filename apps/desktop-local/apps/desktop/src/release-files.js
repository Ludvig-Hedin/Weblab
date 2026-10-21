// A deployment reads a separate source snapshot, never local credentials or drafts.
const fs = require("node:fs");
const {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} = require("node:path");
const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { tmpdir } = require("node:os");

const PRIVATE =
  /(^|\/)(?:\.env(?:\.[^/]*)?|\.envrc|\.git|\.weblab|\.airship|\.vercel|\.claude|\.codex|node_modules|\.next|\.npmrc|\.netrc|\.aws|\.ssh)(?:\/|$)|\.(?:pem|key|p12|pfx|mobileprovision)$/i;
const UNSAFE_PATH = /[\\:\0]/;
const MAX_FILE = 100 * 1024 * 1024;
const MAX_TOTAL = 1024 * 1024 * 1024;
const PRIVATE_KEYS = [
  "PRIVATE KEY",
  "RSA PRIVATE KEY",
  "EC PRIVATE KEY",
  "DSA PRIVATE KEY",
  "OPENSSH PRIVATE KEY",
  "ENCRYPTED PRIVATE KEY",
  "PGP PRIVATE KEY BLOCK",
].map((type) => Buffer.from(`-----BEGIN ${type}-----`));
const LINK_ID = /^[A-Za-z0-9_-]{1,128}$/;
const hash = (value) => createHash("sha256").update(value).digest("hex");

function rootDirectory(root) {
  const stat = fs.lstatSync(root);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("Choose a real local source folder, not a link.");
  }
  return fs.realpathSync(root);
}

function sourceStat(path) {
  try {
    return fs.lstatSync(path);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function sourcePath(base, name) {
  const parts = name.split("/");
  if (
    isAbsolute(name) ||
    UNSAFE_PATH.test(name) ||
    parts.some((part) => !part || part === ".." || part === ".")
  ) {
    throw new Error("Unsafe source path.");
  }
  const path = resolve(base, name);
  const rel = relative(base, path);
  if (!rel || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) {
    throw new Error("Source leaves the site folder.");
  }
  let current = base;
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    const stat = sourceStat(current);
    if (!stat) {
      return null; // A tracked source was deleted.
    }
    if (stat.isSymbolicLink()) {
      throw new Error(`Replace the source link before deploying: ${name}`);
    }
    if (index < parts.length - 1 && !stat.isDirectory()) {
      throw new Error(`Unsupported source folder: ${name}`);
    }
    if (index === parts.length - 1) {
      if (!stat.isFile() || stat.nlink !== 1) {
        throw new Error(`Unsupported source file: ${name}`);
      }
      return { path, stat };
    }
  }
  return null;
}

function readSource(entry, name, remaining) {
  if (entry.stat.size > MAX_FILE || entry.stat.size > remaining) {
    throw new Error("This site is too large to freeze safely.");
  }
  // biome-ignore lint/suspicious/noBitwiseOperators: Node open flags are a bit mask.
  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0);
  const fd = fs.openSync(entry.path, flags);
  try {
    const before = fs.fstatSync(fd);
    if (
      !before.isFile() ||
      before.nlink !== 1 ||
      before.ino !== entry.stat.ino ||
      before.dev !== entry.stat.dev ||
      before.size !== entry.stat.size
    ) {
      throw new Error(`Source changed while opening: ${name}`);
    }
    const bytes = Buffer.alloc(before.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = fs.readSync(fd, bytes, length, bytes.length - length, null);
      if (!count) {
        break;
      }
      length += count;
    }
    const after = fs.fstatSync(fd);
    if (
      length !== before.size ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs ||
      after.nlink !== 1
    ) {
      throw new Error(`Source changed while reading: ${name}`);
    }
    const contents = bytes.subarray(0, length);
    if (PRIVATE_KEYS.some((marker) => contents.includes(marker))) {
      throw new Error(`A private key must be removed from source: ${name}`);
    }
    return {
      bytes: contents,
      hash: hash(contents),
      // biome-ignore lint/suspicious/noBitwiseOperators: Preserve only ordinary permission bits.
      mode: before.mode & 0o777,
      name,
    };
  } finally {
    fs.closeSync(fd);
  }
}

function sourceFiles(root) {
  const base = rootDirectory(root);
  const names = execFileSync(
    "git",
    [
      "-C",
      base,
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "-z",
    ],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 30_000 }
  )
    .split("\0")
    .filter(Boolean);
  const files = [];
  let total = 0;
  for (const name of [...new Set(names)].sort()) {
    if (PRIVATE.test(name)) {
      continue;
    }
    const entry = sourcePath(base, name);
    if (!entry) {
      continue;
    }
    const file = readSource(entry, name, MAX_TOTAL - total);
    total += file.bytes.length;
    files.push(file);
  }
  if (!files.some((file) => file.name === "package.json")) {
    throw new Error("Choose a Git website with a package.json file.");
  }
  return files;
}

function fingerprint(files) {
  return hash(
    JSON.stringify(
      files.map(({ name, hash: digest, mode }) => [name, digest, mode])
    )
  );
}

function sourceHash(root) {
  return fingerprint(sourceFiles(root));
}

function releaseLink(link) {
  if (
    !link ||
    typeof link !== "object" ||
    typeof link.projectId !== "string" ||
    typeof link.orgId !== "string" ||
    !LINK_ID.test(link.projectId) ||
    !LINK_ID.test(link.orgId)
  ) {
    throw new Error("The release needs a valid project and team connection.");
  }
  // Copy only the two IDs the deploy CLI needs. Never serialize extra tokens.
  return { orgId: link.orgId, projectId: link.projectId };
}

function freezeSource(root, link) {
  const connection = releaseLink(link);
  const files = sourceFiles(root);
  const source = fingerprint(files);
  const directory = fs.mkdtempSync(join(tmpdir(), "weblab-release-"));
  const owned = fs.lstatSync(directory);
  function cleanup() {
    let current;
    try {
      current = fs.lstatSync(directory);
    } catch (error) {
      if (error.code === "ENOENT") {
        return;
      }
      throw error;
    }
    if (
      current.isSymbolicLink() ||
      !current.isDirectory() ||
      current.ino !== owned.ino ||
      current.dev !== owned.dev
    ) {
      throw new Error(
        "The release snapshot folder was replaced; cleanup refused."
      );
    }
    fs.rmSync(directory, { force: true, recursive: true });
  }
  try {
    fs.chmodSync(directory, 0o700);
    for (const file of files) {
      const destination = join(directory, file.name);
      fs.mkdirSync(dirname(destination), { mode: 0o700, recursive: true });
      fs.writeFileSync(destination, file.bytes, {
        flag: "wx",
        mode: file.mode,
      });
      // umask must not change the bytes/mode fingerprint sent for review.
      fs.chmodSync(destination, file.mode);
    }
    fs.mkdirSync(join(directory, ".vercel"), { mode: 0o700 });
    fs.writeFileSync(
      join(directory, ".vercel/project.json"),
      JSON.stringify(connection),
      { flag: "wx", mode: 0o600 }
    );
    if (sourceHash(root) !== source) {
      throw new Error(
        "The source changed while preparing the release. Try again after saving."
      );
    }
    return { cleanup, directory, sourceHash: source };
  } catch (error) {
    cleanup();
    throw error;
  }
}

module.exports = { freezeSource, sourceHash };
