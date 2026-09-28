/**
 * The editor's image library: list the images in the project's static folder
 * and add new ones to it.
 *
 * These are the only HTTP endpoints that write to the user's disk, so they are
 * gated harder than anything else the proxy serves. The Host allowlist runs in
 * `handleHttp` before any `/__airship/` route; on top of it a write needs an
 * `Origin` equal to the proxy's own (a browser always sends one on a
 * cross-origin POST, so an absent one is refused here, unlike the WebSocket
 * gate), an image content type, a name whose extension matches the bytes, and
 * a target folder that is a real directory inside the project — never a
 * symlink out of it.
 */
import {
  type Dirent,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import type http from "node:http";
import { join, relative, sep } from "node:path";
import { isPathInside } from "@airship/core";
import { originMatchesHost } from "./access";

export const ASSETS_API_PATH = "/__airship/api/assets";

/** Mirrors `AssetImage` in `@airship/protocol`. */
export interface AssetImage {
  bytes: number;
  modified: number;
  name: string;
  /** Project-relative, forward slashes: `public/images/a.png`. */
  path: string;
  /** Where the dev server serves it: `/images/a.png`, segments encoded. */
  url: string;
}

export interface AssetList {
  images: AssetImage[];
  /** The static folder, project-relative: `public` or `static`. */
  root: string;
}

export interface AssetsOptions {
  maxBytes?: number;
  projectRoot: string;
}

const STATIC_DIRS = ["public", "static"] as const;
const UPLOAD_DIR = "images";
const MAX_LIST = 1000;
const MAX_NAME = 80;
const MAX_DEDUPE = 1000;
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MB = 1024 * 1024;
/** How much of an SVG to read before deciding it is not one. */
const SVG_SNIFF_BYTES = 4096;

type ImageKind = "avif" | "gif" | "ico" | "jpeg" | "png" | "svg" | "webp";

const EXT_KIND: Readonly<Record<string, ImageKind>> = {
  avif: "avif",
  gif: "gif",
  ico: "ico",
  jpeg: "jpeg",
  jpg: "jpeg",
  png: "png",
  svg: "svg",
  webp: "webp",
};

const DIACRITICS = /[̀-ͯ]/g;
const PATH_SEPARATORS = /[\\/]/;
const DISALLOWED = /[^a-z0-9._-]+/g;
const DASH_RUNS = /-{2,}/g;
const EDGE_PUNCT = /^[-._]+|[-._]+$/g;
const XML_DECL = /^<\?xml[\s\S]*?\?>/;
const XML_COMMENT = /^<!--[\s\S]*?-->/;
const DOCTYPE = /^<!doctype[^>]*>/i;
const SVG_OPEN = /^<svg[\s>]/;
/**
 * Anything in an SVG that can run code or pull in another document.
 *
 * The file is served from the user's own origin, and an SVG opened directly
 * is a document, so a script in it runs with that origin's cookies. Checked
 * over the whole file, case-insensitively — not just the sniffed prefix.
 */
const SVG_ACTIVE =
  /<script|<foreignobject|<iframe|<embed|<object|javascript:|[\s/"']on[a-z]+\s*=/i;

const ERR = {
  empty: "The file is empty.",
  failed: "Something went wrong saving the image. Please try again.",
  foreign: "This request came from another site, so it was blocked.",
  method: "This action is not supported.",
  name: "The file needs a name ending in .png, .jpg, .gif, .webp, .avif, .svg or .ico.",
  notImage: "Only image files can be added.",
  svgScript: "This SVG contains scripts, so it can't be added.",
  symlink:
    "The images folder points outside your project, so Weblab will not use it.",
} as const;

class AssetError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function isAssetsRequest(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  const q = url.indexOf("?");
  return (q === -1 ? url : url.slice(0, q)) === ASSETS_API_PATH;
}

/** Route entry. Never throws and never lets a request reach the dev server. */
export async function handleAssetsRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  options: AssetsOptions
): Promise<void> {
  try {
    if (req.method === "GET" || req.method === "HEAD") {
      checkOrigin(req, false);
      sendJson(res, 200, listAssets(options.projectRoot));
      return;
    }
    if (req.method === "POST") {
      checkOrigin(req, true);
      const image = await uploadAsset(req, options);
      sendJson(res, 201, image);
      return;
    }
    res.setHeader("allow", "GET, HEAD, POST");
    throw new AssetError(405, ERR.method);
  } catch (err) {
    const status = err instanceof AssetError ? err.status : 500;
    const message = err instanceof AssetError ? err.message : ERR.failed;
    if (!res.headersSent) {
      sendJson(res, status, { error: message });
    }
    // The body may still be arriving (413, 415 before reading); stop taking it.
    if (!req.complete) {
      req.resume();
    }
  }
}

function checkOrigin(req: http.IncomingMessage, required: boolean): void {
  const { origin } = req.headers;
  if (origin === undefined && !required) {
    return;
  }
  if (origin === undefined || !originMatchesHost(origin, req.headers.host)) {
    throw new AssetError(403, ERR.foreign);
  }
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "cache-control": "no-store",
    "content-length": String(Buffer.byteLength(json)),
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    ...(status === 413 ? { connection: "close" } : {}),
  });
  res.end(json);
}

// ---------------------------------------------------------------------------
// Folders

interface StaticDir {
  abs: string;
  /** Project-relative name: `public` or `static`. */
  name: string;
}

/**
 * The first real static folder under the project, or null. A symlinked one is
 * refused rather than skipped: silently falling through to `static/` would
 * list and write somewhere the user did not expect.
 */
function findStaticDir(rootReal: string): StaticDir | null {
  for (const name of STATIC_DIRS) {
    const abs = join(rootReal, name);
    const kind = entryKind(abs);
    if (kind === "dir") {
      assertReal(rootReal, abs);
      return { abs, name };
    }
    if (kind === "link") {
      throw new AssetError(403, ERR.symlink);
    }
  }
  return null;
}

function entryKind(abs: string): "dir" | "link" | "missing" | "other" {
  try {
    const st = lstatSync(abs);
    if (st.isSymbolicLink()) {
      return "link";
    }
    return st.isDirectory() ? "dir" : "other";
  } catch {
    return "missing";
  }
}

/**
 * The directory's canonical path must be exactly its lexical path under the
 * canonical root: equal means no component on the way was a symlink, and
 * isPathInside is the belt to that brace.
 */
function assertReal(rootReal: string, abs: string): void {
  const real = realpathSync(abs);
  if (real !== abs || !isPathInside(rootReal, real)) {
    throw new AssetError(403, ERR.symlink);
  }
}

/** `<static>/images`, created if missing (and `public/` with it if needed). */
function ensureUploadDir(rootReal: string): { abs: string; rel: string } {
  const found = findStaticDir(rootReal);
  const staticName = found?.name ?? STATIC_DIRS[0];
  const staticAbs = found?.abs ?? join(rootReal, staticName);
  if (!found) {
    makeDir(staticAbs);
    assertReal(rootReal, staticAbs);
  }
  const abs = join(staticAbs, UPLOAD_DIR);
  const kind = entryKind(abs);
  if (kind === "link") {
    throw new AssetError(403, ERR.symlink);
  }
  if (kind === "other") {
    throw new AssetError(500, ERR.failed);
  }
  if (kind === "missing") {
    makeDir(abs);
  }
  assertReal(rootReal, abs);
  return { abs, rel: `${staticName}/${UPLOAD_DIR}` };
}

function makeDir(abs: string): void {
  try {
    // Not recursive: the parent is known to exist, and a non-recursive mkdir
    // cannot quietly create a chain somewhere unexpected.
    mkdirSync(abs);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Listing

export function listAssets(projectRoot: string): AssetList {
  const rootReal = realpathSync(projectRoot);
  const found = findStaticDir(rootReal);
  if (!found) {
    return { images: [], root: STATIC_DIRS[0] };
  }
  const images: AssetImage[] = [];
  walkImages(found.abs, found, images);
  images.sort((a, b) => b.modified - a.modified);
  return { images, root: found.name };
}

function walkImages(dir: string, base: StaticDir, acc: AssetImage[]): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (acc.length >= MAX_LIST) {
      return;
    }
    if (entry.name.startsWith(".") || entry.name === "node_modules") {
      continue;
    }
    const full = join(dir, entry.name);
    // Dirent types come from lstat, so symlinks are neither and are skipped.
    if (entry.isDirectory()) {
      walkImages(full, base, acc);
    } else if (entry.isFile() && extKind(entry.name)) {
      const image = describe(full, base);
      if (image) {
        acc.push(image);
      }
    }
  }
}

function describe(abs: string, base: StaticDir): AssetImage | null {
  try {
    const st = statSync(abs);
    const segments = relative(base.abs, abs).split(sep);
    return {
      bytes: st.size,
      modified: st.mtimeMs,
      name: segments.at(-1) ?? "",
      path: [base.name, ...segments].join("/"),
      url: `/${segments.map(encodeURIComponent).join("/")}`,
    };
  } catch {
    return null;
  }
}

function extKind(name: string): ImageKind | undefined {
  const dot = name.lastIndexOf(".");
  if (dot === -1) {
    return;
  }
  return EXT_KIND[name.slice(dot + 1).toLowerCase()];
}

// ---------------------------------------------------------------------------
// Upload

export interface CleanName {
  ext: string;
  kind: ImageKind;
  stem: string;
}

/**
 * A safe file name from whatever the browser reported, or null when there is
 * no allowed extension. Only the last path segment survives, so `../../x.png`
 * is just `x.png`.
 */
export function sanitizeImageName(raw: string): CleanName | null {
  const base =
    raw
      .normalize("NFKD")
      .replace(DIACRITICS, "")
      .toLowerCase()
      .split(PATH_SEPARATORS)
      .at(-1) ?? "";
  const dot = base.lastIndexOf(".");
  if (dot === -1) {
    return null;
  }
  const ext = base.slice(dot + 1);
  const kind = EXT_KIND[ext];
  if (!kind) {
    return null;
  }
  const clean = (s: string) =>
    s.replace(DISALLOWED, "-").replace(DASH_RUNS, "-").replace(EDGE_PUNCT, "");
  const stem =
    clean(clean(base.slice(0, dot)).slice(0, MAX_NAME - ext.length - 1)) ||
    "image";
  return { ext, kind, stem };
}

/** What the bytes actually are, from their signature. */
export function sniffImage(buf: Buffer): ImageKind | null {
  const ascii = (start: number, end: number) =>
    buf.subarray(start, end).toString("latin1");
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
  ) {
    return "png";
  }
  if (
    buf.length >= 3 &&
    buf[0] === 0xff &&
    buf[1] === 0xd8 &&
    buf[2] === 0xff
  ) {
    return "jpeg";
  }
  if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") {
    return "gif";
  }
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    return "webp";
  }
  if (isAvif(buf)) {
    return "avif";
  }
  if (
    buf.length >= 6 &&
    buf[0] === 0 &&
    buf[1] === 0 &&
    buf[2] === 1 &&
    buf[3] === 0
  ) {
    return "ico";
  }
  return isSvg(buf) ? "svg" : null;
}

/** An ISO-BMFF `ftyp` box naming `avif`/`avis` as major or compatible brand. */
function isAvif(buf: Buffer): boolean {
  if (buf.length < 16 || buf.subarray(4, 8).toString("latin1") !== "ftyp") {
    return false;
  }
  const end = Math.min(buf.readUInt32BE(0), buf.length);
  for (let i = 8; i + 4 <= end; i += 4) {
    // Offset 12 is the minor version, not a brand.
    if (i === 12) {
      continue;
    }
    const brand = buf.subarray(i, i + 4).toString("latin1");
    if (brand === "avif" || brand === "avis") {
      return true;
    }
  }
  return false;
}

/**
 * Text whose first element is `<svg`, after an optional BOM, XML declaration,
 * doctype, comments and whitespace. Stricter than "starts with `<?xml`": any
 * XML would pass that.
 */
function isSvg(buf: Buffer): boolean {
  let text = buf.subarray(0, SVG_SNIFF_BYTES).toString("utf8");
  if (text.charCodeAt(0) === 0xfe_ff) {
    text = text.slice(1);
  }
  for (;;) {
    text = text.trimStart();
    const prelude =
      XML_DECL.exec(text) ?? XML_COMMENT.exec(text) ?? DOCTYPE.exec(text);
    if (!prelude) {
      return SVG_OPEN.test(text);
    }
    text = text.slice(prelude[0].length);
  }
}

async function uploadAsset(
  req: http.IncomingMessage,
  options: AssetsOptions
): Promise<AssetImage> {
  const maxBytes = options.maxBytes ?? MAX_UPLOAD_BYTES;
  const contentType = String(req.headers["content-type"] ?? "").toLowerCase();
  if (
    !(
      contentType.startsWith("image/") ||
      contentType.startsWith("application/octet-stream")
    )
  ) {
    throw new AssetError(415, ERR.notImage);
  }
  const rawName = new URL(req.url ?? "", "http://x").searchParams.get("name");
  const name = sanitizeImageName(rawName ?? "");
  if (!name) {
    throw new AssetError(400, ERR.name);
  }
  const body = await readBody(req, maxBytes);
  if (body.length === 0) {
    throw new AssetError(400, ERR.empty);
  }
  if (sniffImage(body) !== name.kind) {
    throw new AssetError(
      415,
      `This file is not really a .${name.ext} image. Try exporting it again.`
    );
  }
  if (name.kind === "svg" && SVG_ACTIVE.test(body.toString("utf8"))) {
    throw new AssetError(415, ERR.svgScript);
  }
  const rootReal = realpathSync(options.projectRoot);
  const dir = ensureUploadDir(rootReal);
  const file = writeUnique(dir.abs, name, body);
  const st = statSync(join(dir.abs, file));
  return {
    bytes: st.size,
    modified: st.mtimeMs,
    name: file,
    path: `${dir.rel}/${file}`,
    url: `/${UPLOAD_DIR}/${encodeURIComponent(file)}`,
  };
}

function tooLarge(maxBytes: number): AssetError {
  return new AssetError(
    413,
    `This image is larger than ${Math.round(maxBytes / MB) || 1} MB.`
  );
}

/** The whole body, refusing as soon as it (or its declared length) is too big. */
function readBody(
  req: http.IncomingMessage,
  maxBytes: number
): Promise<Buffer> {
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > maxBytes) {
    return Promise.reject(tooLarge(maxBytes));
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const onData = (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.off("data", onData);
        reject(tooLarge(maxBytes));
        return;
      }
      chunks.push(chunk);
    };
    req.on("data", onData);
    req.once("end", () => resolve(Buffer.concat(chunks)));
    req.once("error", reject);
  });
}

/**
 * Write with `wx`, so an existing file is never touched: on a clash try
 * `name-2`, `name-3`, … A write that fails after creating the file removes it.
 */
function writeUnique(dir: string, name: CleanName, body: Buffer): string {
  for (let n = 1; n <= MAX_DEDUPE; n += 1) {
    const file =
      n === 1 ? `${name.stem}.${name.ext}` : `${name.stem}-${n}.${name.ext}`;
    const abs = join(dir, file);
    try {
      writeFileSync(abs, body, { flag: "wx" });
      return file;
    } catch (err) {
      const { code } = err as NodeJS.ErrnoException;
      if (code === "EEXIST") {
        continue;
      }
      removeQuietly(abs);
      throw err;
    }
  }
  throw new AssetError(500, ERR.failed);
}

function removeQuietly(abs: string): void {
  try {
    unlinkSync(abs);
  } catch {
    // Never created, or already gone.
  }
}
