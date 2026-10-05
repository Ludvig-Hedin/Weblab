// Copy an exported page and the local files it names into an isolated site.
const fs = require("node:fs");
const {
  basename,
  dirname,
  extname,
  join,
  relative,
  resolve,
  sep,
} = require("node:path");

const ATTR = /\b(?:src|href|poster|data)\s*=\s*["']([^"']+)["']/gi;
const SRCSET = /\bsrcset\s*=\s*["']([^"']+)["']/gi;
const CSS_URL = /url\(\s*["']?([^'")]+)["']?\s*\)/gi;
const CSS_IMPORT = /@import\s+["']([^"']+)["']/gi;
const JS_IMPORT = /\b(?:from|import)\s*["']([^"']+)["']/gi;
const JS_FETCH = /\bfetch\(\s*["']([^"']+)["']/gi;
const WHITESPACE = /\s+/;
const EXTERNAL_REFERENCE = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i;
const QUERY_OR_HASH = /[?#]/;
const SCANNED = new Set([".html", ".css", ".js", ".mjs"]);
const ASSETS = new Set([
  ".avif",
  ".css",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".js",
  ".mjs",
  ".mp3",
  ".mp4",
  ".ogg",
  ".otf",
  ".png",
  ".svg",
  ".ttf",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
]);

function inside(root, file) {
  const path = relative(root, file);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`));
}

function patternsFor(ext) {
  if (ext === ".html") {
    return [ATTR, SRCSET, CSS_URL];
  }
  if (ext === ".css") {
    return [CSS_URL, CSS_IMPORT];
  }
  return [JS_IMPORT, JS_FETCH];
}

function references(file, contents) {
  const refs = [];
  const ext = extname(file).toLowerCase();
  for (const pattern of patternsFor(ext)) {
    for (const match of contents.matchAll(pattern)) {
      if (pattern === SRCSET) {
        refs.push(
          ...match[1].split(",").map((part) => part.trim().split(WHITESPACE)[0])
        );
      } else {
        refs.push(match[1].trim());
      }
    }
  }
  return refs;
}

function localFile(root, from, reference) {
  if (!reference || EXTERNAL_REFERENCE.test(reference)) {
    return null;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(reference.split(QUERY_OR_HASH, 1)[0]);
  } catch {
    return null;
  }
  const file = pathname.startsWith("/")
    ? resolve(root, `.${pathname}`)
    : resolve(dirname(from), pathname);
  if (
    !(inside(root, file) && ASSETS.has(extname(file).toLowerCase())) ||
    relative(root, file)
      .split(sep)
      .some((part) => part.startsWith("."))
  ) {
    return null;
  }
  try {
    return fs.lstatSync(file).isFile() ? file : null;
  } catch {
    return null;
  }
}

function copyLinkedFiles(source, destination) {
  const root = dirname(source);
  const queued = [source];
  const copied = new Set();
  while (queued.length) {
    const file = queued.shift();
    if (copied.has(file)) {
      continue;
    }
    copied.add(file);
    const target = join(destination, relative(root, file));
    fs.mkdirSync(dirname(target), { recursive: true });
    fs.copyFileSync(file, target);
    if (!SCANNED.has(extname(file).toLowerCase())) {
      continue;
    }
    const content = fs.readFileSync(file, "utf8");
    for (const ref of references(file, content)) {
      const linked = localFile(root, file, ref);
      if (linked && !copied.has(linked)) {
        queued.push(linked);
      }
    }
  }
  return basename(source);
}

module.exports = { copyLinkedFiles };
