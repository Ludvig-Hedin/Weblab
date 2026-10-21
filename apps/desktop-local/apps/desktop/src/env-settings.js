// Site settings: the keys a site's example env file asks for, and writing the
// user's answers into .env.local. Values are never logged.

const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const { join } = require("node:path");

const EXAMPLE_FILES = [".env.example", ".env.sample", ".env.local.example"];
const VALUE_FILES = [".env.local", ".env"];
const ASSIGNMENT = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;
const COMMENT = /^\s*#\s?(.*)$/;
const SECRET_NAME = /token|secret|key|password|private/i;
const NEEDS_QUOTES = /[\s#"'\\]/;
const BACKSLASH = /\\/g;
const DOUBLE_QUOTE = /"/g;
const NEWLINE = /\r?\n/;

function unquote(raw) {
  const value = raw.trim();
  const [quote] = value;
  if (
    (quote === '"' || quote === "'") &&
    value.endsWith(quote) &&
    value.length >= 2
  ) {
    return value.slice(1, -1);
  }
  // Unquoted values may carry a trailing comment.
  const hash = value.indexOf(" #");
  return hash === -1 ? value : value.slice(0, hash).trim();
}

function readBytes(path) {
  let fd;
  try {
    fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  try {
    if (!fs.fstatSync(fd).isFile()) throw new Error("Settings must be a regular file.");
    return fs.readFileSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function readLines(path) {
  try {
    return readBytes(path)?.toString("utf8").split(NEWLINE) ?? null;
  } catch {
    return null;
  }
}

function exampleFile(dir) {
  return EXAMPLE_FILES.find((name) => fs.existsSync(join(dir, name))) || null;
}

/** Keys from the example file, each with the comment lines right above it. */
function exampleKeys(dir) {
  const name = exampleFile(dir);
  const lines = name ? readLines(join(dir, name)) : null;
  if (!lines) {
    return [];
  }
  const keys = [];
  let comments = [];
  for (const line of lines) {
    const comment = line.match(COMMENT);
    if (comment) {
      comments.push(comment[1].trim());
      continue;
    }
    const assignment = line.match(ASSIGNMENT);
    if (assignment && !keys.some((entry) => entry.key === assignment[1])) {
      keys.push({
        example: unquote(assignment[2]),
        hint: comments.filter(Boolean).join(" "),
        key: assignment[1],
      });
    }
    comments = [];
  }
  return keys;
}

/** Current values from .env.local, then .env (the first non-empty one wins). */
function currentValues(dir) {
  const values = {};
  for (const name of VALUE_FILES) {
    for (const line of readLines(join(dir, name)) || []) {
      const assignment = line.match(ASSIGNMENT);
      if (assignment && !values[assignment[1]]) {
        const value = unquote(assignment[2]);
        if (value) {
          values[assignment[1]] = value;
        }
      }
    }
  }
  return values;
}

/** Everything the settings screen needs. Values only go to the renderer. */
function describe(dir) {
  const values = currentValues(dir);
  return exampleKeys(dir).map(({ key, hint, example }) => ({
    hint,
    key,
    missing: !values[key],
    placeholder: example,
    secret: SECRET_NAME.test(key),
    value: values[key] || "",
  }));
}

function missingKeys(dir) {
  return describe(dir)
    .filter((field) => field.missing)
    .map((field) => field.key);
}

function formatValue(value) {
  return NEEDS_QUOTES.test(value)
    ? `"${value.replace(BACKSLASH, "\\\\").replace(DOUBLE_QUOTE, '\\"')}"`
    : value;
}

/** Merges non-empty answers into .env.local, keeping every other line as is. */
function save(dir, answers) {
  const allowed = new Set(exampleKeys(dir).map((entry) => entry.key));
  const updates = new Map(
    Object.entries(answers || {}).filter(
      ([key, value]) =>
        allowed.has(key) && typeof value === "string" && value.trim()
    )
  );
  if (updates.size === 0) {
    return;
  }
  const root = fs.realpathSync(dir);
  const path = join(root, ".env.local");
  const before = readBytes(path);
  if (before && !Buffer.from(before.toString("utf8")).equals(before)) {
    throw new Error("Settings must be UTF-8 text.");
  }
  const lines = before?.toString("utf8").split(NEWLINE) || [];
  const written = new Set();
  const next = lines.map((line) => {
    const assignment = line.match(ASSIGNMENT);
    if (assignment && updates.has(assignment[1])) {
      written.add(assignment[1]);
      return `${assignment[1]}=${formatValue(updates.get(assignment[1]).trim())}`;
    }
    return line;
  });
  while (next.length > 0 && next.at(-1) === "") {
    next.pop();
  }
  for (const [key, value] of updates) {
    if (!written.has(key)) {
      next.push(`${key}=${formatValue(value.trim())}`);
    }
  }
  const temporary = join(root, `.env.local.weblab-${randomUUID()}.tmp`);
  let temporaryFd = null;
  let created = false;
  try {
    temporaryFd = fs.openSync(temporary, "wx", 0o600);
    created = true;
    fs.writeFileSync(temporaryFd, `${next.join("\n")}\n`);
    const writtenFd = temporaryFd;
    temporaryFd = null;
    fs.closeSync(writtenFd);
    const current = readBytes(path);
    if (before === null ? current !== null : current === null || !before.equals(current)) {
      throw new Error("Settings changed while saving. Try again.");
    }
    fs.renameSync(temporary, path);
  } finally {
    try {
      if (temporaryFd !== null) fs.closeSync(temporaryFd);
    } finally {
      if (created && fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
}

module.exports = { describe, missingKeys, save };
