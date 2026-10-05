/**
 * @airship/source/components — which React components on the page are
 * shared, and what props an instance takes, answered from the project's own
 * source rather than from the running app.
 *
 * The browser only knows a component's display name and a few stack frames
 * pointing at where it was rendered. Everything else is recovered here:
 *
 * 1. Frames become a call site. Dev servers report frames in a zoo of URL
 *    shapes (`turbopack:///[project]/…`, `webpack-internal:///…`, `file://…`,
 *    `.next` chunks), and a Next.js server component's frame points into a
 *    compiled chunk that only its source map can translate.
 * 2. A regex-level project index (imports, re-exports, `<Tag` usages) answers
 *    "where is this defined", "how many times is it used" and "which routes
 *    render it" without a type checker, fast enough for a page of 100 refs.
 * 3. Only the detail call loads TypeScript, and only the *project's own*
 *    TypeScript, to read declared props — a heavier question asked about one
 *    component at a time.
 *
 * Every exported function swallows its own failures: this feeds a hover UI,
 * and a thrown error there is worse than a component shown as unshared.
 */
import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ComponentDetail,
  ComponentFrameRef,
  ComponentInfo,
  PropControl,
  PropOrigin,
  PropSpec,
  SourceLocation,
} from "@airship/protocol";
import {
  AnyMap,
  GREATEST_LOWER_BOUND,
  LEAST_UPPER_BOUND,
  originalPositionFor,
  type TraceMap,
} from "@jridgewell/trace-mapping";
import type * as TS from "typescript";
import { isMinified, readCapped, toPosix, walkFiles } from "./walk";

// ---------------------------------------------------------------------------
// Frames → files

/** Turbopack appends a module id (`chunk.js?11`); it is not part of the path. */
const QUERY_SUFFIX = /\?.*$/;
/** React's server-component frames wrap the real URL in this pseudo-scheme. */
const ABOUT_REACT_SERVER = /^about:\/\/React\/Server\//i;
const TURBOPACK_PROJECT = /^turbopack:\/\/\/?\[project\]\//;
const PROJECT_TOKEN = /^\[project\]\//;
/** `webpack-internal:///(app-pages-browser)/./src/x.tsx` — layer is optional. */
const WEBPACK_INTERNAL = /^webpack-internal:\/\/\/(?:\([^)]*\)\/)?/;
/** `webpack://_N_E/./src/x.tsx` — the namespace segment is the app name. */
const WEBPACK_NAMESPACE = /^webpack:\/\/[^/]*\//;
const DOT_SLASHES = /^(?:\.\/)+/;
const HTTP_ORIGIN = /^https?:\/\/[^/]+/i;
/** Next serves `.next/static/…` as `/_next/static/…`. */
const NEXT_STATIC_URL = /^\/_next\//;
const LEADING_SLASHES = /^\/+/;
const VITE_FS_PREFIX = /^\/@fs\/(.*)$/;
const WIN32_DRIVE = /^[a-zA-Z]:/;
const WIN32 = process.platform === "win32";
const JS_OUTPUT = /\.[cm]?js$/;
const SOURCE_FILE = /\.(?:tsx|ts|jsx|js|mjs|cjs|mts|cts|mdx)$/;
const SOURCE_MAPPING_URL = /\/\/[#@]\s*sourceMappingURL=([^\s'"]+)\s*$/;
const DATA_URL_BASE64 = /^data:application\/json[^,]*;base64,(.*)$/;
/** How much of a chunk's tail to read looking for its `sourceMappingURL`. */
const MAP_COMMENT_TAIL_BYTES = 4096;
const MAX_CACHED_MAPS = 48;

/**
 * An absolute path for a frame's file, as it exists on disk, or null.
 *
 * Not a general URL parser: each branch is a shape a real dev server has been
 * seen to report. Anything unrecognised falls through to the same
 * project-relative/absolute lookup the source resolver uses.
 */
function frameToAbsolute(cwd: string, raw: string): string | null {
  let file = raw
    .trim()
    .replace(QUERY_SUFFIX, "")
    .replace(ABOUT_REACT_SERVER, "");
  if (file.startsWith("file://")) {
    try {
      return existing(fileURLToPath(file));
    } catch {
      return existing(file.slice("file://".length));
    }
  }
  try {
    file = decodeURIComponent(file);
  } catch {
    // A stray `%` — keep the raw text rather than lose the frame.
  }
  if (TURBOPACK_PROJECT.test(file)) {
    return existing(join(cwd, file.replace(TURBOPACK_PROJECT, "")));
  }
  if (PROJECT_TOKEN.test(file)) {
    return existing(join(cwd, file.replace(PROJECT_TOKEN, "")));
  }
  if (WEBPACK_INTERNAL.test(file)) {
    const rest = file.replace(WEBPACK_INTERNAL, "").replace(DOT_SLASHES, "");
    return existing(resolve(cwd, rest));
  }
  if (WEBPACK_NAMESPACE.test(file)) {
    const rest = file.replace(WEBPACK_NAMESPACE, "").replace(DOT_SLASHES, "");
    return existing(resolve(cwd, rest));
  }
  if (HTTP_ORIGIN.test(file)) {
    const path = file.replace(HTTP_ORIGIN, "");
    if (NEXT_STATIC_URL.test(path)) {
      return existing(join(cwd, ".next", path.replace(NEXT_STATIC_URL, "")));
    }
    return existingSource(cwd, path);
  }
  return existingSource(cwd, file);
}

function existing(abs: string): string | null {
  return existsSync(abs) ? abs : null;
}

/**
 * Mirrors `resolveExistingSource` in `./server`: a leading slash is a
 * dev-server URL path first and an absolute path second, and on Windows only
 * the former. Replicated rather than imported because `./server` imports this
 * module.
 */
function existingSource(cwd: string, file: string): string | null {
  const vite = file.match(VITE_FS_PREFIX);
  if (vite?.[1]) {
    return existing(WIN32_DRIVE.test(vite[1]) ? vite[1] : `/${vite[1]}`);
  }
  if (file.startsWith("/")) {
    const stripped = resolve(cwd, file.replace(LEADING_SLASHES, ""));
    if (existsSync(stripped)) {
      return stripped;
    }
    if (WIN32) {
      return null;
    }
  }
  return existing(resolve(cwd, file));
}

/**
 * A compiled chunk rather than a source file. Anything under `.next` is output
 * even without a sibling map (then it simply cannot be mapped); elsewhere a
 * `.js` counts only when it ships a `.map` next to it.
 */
function isBuildArtefact(abs: string): boolean {
  const posix = toPosix(abs);
  if (posix.includes("/.next/")) {
    return true;
  }
  return JS_OUTPUT.test(posix) && existsSync(`${abs}.map`);
}

interface CachedMap {
  map: TraceMap | null;
  mtimeMs: number;
}

const MAP_CACHE = new Map<string, CachedMap>();

/**
 * The parsed source map for a chunk, cached by the chunk's mtime.
 *
 * Turbopack's server chunks carry *sectioned* index maps, which a plain
 * `TraceMap` rejects; `AnyMap` flattens them. Parsing one can take tens of
 * milliseconds and a page repeats the same chunk for every component on it,
 * hence the cache.
 */
function loadMap(abs: string): TraceMap | null {
  let mtimeMs: number;
  try {
    ({ mtimeMs } = statSync(abs));
  } catch {
    return null;
  }
  const cached = MAP_CACHE.get(abs);
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.map;
  }
  const map = parseMapFor(abs);
  if (MAP_CACHE.size >= MAX_CACHED_MAPS) {
    const oldest = MAP_CACHE.keys().next().value;
    if (oldest !== undefined) {
      MAP_CACHE.delete(oldest);
    }
  }
  MAP_CACHE.set(abs, { map, mtimeMs });
  return map;
}

function parseMapFor(abs: string): TraceMap | null {
  const sibling = `${abs}.map`;
  if (existsSync(sibling)) {
    return parseMapJson(readCapped(sibling, Number.POSITIVE_INFINITY), sibling);
  }
  const url = readMapComment(abs);
  if (!url) {
    return null;
  }
  const inline = url.match(DATA_URL_BASE64);
  if (inline?.[1]) {
    return parseMapJson(Buffer.from(inline[1], "base64").toString("utf8"), abs);
  }
  let target = url;
  try {
    target = decodeURIComponent(url.replace(QUERY_SUFFIX, ""));
  } catch {
    // Keep the raw reference.
  }
  const mapPath = resolve(dirname(abs), target);
  return parseMapJson(readCapped(mapPath, Number.POSITIVE_INFINITY), mapPath);
}

function parseMapJson(json: string | null, mapPath: string): TraceMap | null {
  if (json === null) {
    return null;
  }
  try {
    return new AnyMap(JSON.parse(json), mapPath);
  } catch {
    return null;
  }
}

/** The `sourceMappingURL` comment at the end of a chunk, if any. */
function readMapComment(abs: string): string | null {
  let fd: number | null = null;
  try {
    fd = openSync(abs, "r");
    const { size } = statSync(abs);
    const length = Math.min(size, MAP_COMMENT_TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    readSync(fd, buffer, 0, length, size - length);
    return (
      buffer.toString("utf8").trimEnd().match(SOURCE_MAPPING_URL)?.[1] ?? null
    );
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      closeSync(fd);
    }
  }
}

interface MappedPosition {
  column: number;
  line: number;
  source: string;
}

/** Frame columns are 1-based; source-map columns are 0-based. */
function mapThrough(
  abs: string,
  line: number,
  column: number | undefined
): MappedPosition | null {
  const map = loadMap(abs);
  if (!map) {
    return null;
  }
  const needle = { column: Math.max(0, (column ?? 1) - 1), line };
  for (const bias of [GREATEST_LOWER_BOUND, LEAST_UPPER_BOUND] as const) {
    const hit = originalPositionFor(map, { ...needle, bias });
    if (hit.source !== null) {
      return { column: hit.column + 1, line: hit.line, source: hit.source };
    }
  }
  return null;
}

function isInside(cwd: string, abs: string): boolean {
  const rel = relative(cwd, abs);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

function projectPath(cwd: string, abs: string): string {
  return isInside(cwd, abs) ? toPosix(relative(cwd, abs)) : toPosix(abs);
}

function located(
  cwd: string,
  abs: string,
  line: number | undefined,
  column: number | undefined
): SourceLocation {
  const out: SourceLocation = { file: projectPath(cwd, abs) };
  if (typeof line === "number") {
    out.line = line;
  }
  if (typeof column === "number") {
    out.column = column;
  }
  return out;
}

/**
 * A frame, rewritten to the source file it came from.
 *
 * Plain source frames are only normalised; a build artefact is translated
 * through its source map. The result's `file` is project-relative with forward
 * slashes when it is inside the project, absolute otherwise. Null when the
 * file does not exist or a chunk cannot be mapped.
 */
export function mapBuildFrame(
  cwd: string,
  loc: SourceLocation
): SourceLocation | null {
  try {
    const abs = frameToAbsolute(cwd, loc.file);
    if (!abs) {
      return null;
    }
    if (!isBuildArtefact(abs)) {
      return located(cwd, abs, loc.line, loc.column);
    }
    if (typeof loc.line !== "number") {
      return null;
    }
    const mapped = mapThrough(abs, loc.line, loc.column);
    if (!mapped) {
      return null;
    }
    const source = frameToAbsolute(cwd, mapped.source);
    if (!source || isBuildArtefact(source)) {
      return null;
    }
    return located(cwd, source, mapped.line, mapped.column);
  } catch {
    return null;
  }
}

/** The first frame that lands in a project source file outside node_modules. */
function pickCallSite(
  cwd: string,
  frames: readonly SourceLocation[]
): SourceLocation | null {
  for (const frame of frames) {
    const loc = mapBuildFrame(cwd, frame);
    if (
      loc &&
      typeof loc.line === "number" &&
      !isAbsolute(loc.file) &&
      !loc.file.includes("node_modules/") &&
      SOURCE_FILE.test(loc.file)
    ) {
      return loc;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Project index — one regex pass per file, reparsed only when its mtime moves

const INDEX_EXTENSIONS: ReadonlySet<string> = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
]);
const RESOLVE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".mts"];
const JS_SPECIFIER_EXT = /\.(?:js|jsx|mjs)$/;
const DTS_FILE = /\.d\.[cm]?ts$/;
const JSX_CAPABLE = /\.(?:tsx|jsx|js|mjs|cjs)$/;
/** Barrels can chain; five hops covers every real layout seen. */
const MAX_EXPORT_HOPS = 5;
/** Tags this far from a reported line still count as that call site. */
const CALL_SITE_SLACK = 2;

const IMPORT_FROM =
  /\bimport\s+(type\s+)?([\w$*{}\s,]+?)\s*from\s*["']([^"'\n]+)["']/g;
const IMPORT_BARE = /\bimport\s*["']([^"'\n]+)["']/g;
const IMPORT_DYNAMIC = /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g;
/** `const Hero = dynamic(() => import("./hero"))` binds Hero to the default. */
const LAZY_BINDING =
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:[\w$.]+\s*\(\s*)?(?:(?:async\s*)?\(\s*\)\s*=>\s*)?import\s*\(\s*["']([^"'\n]+)["']/g;
const EXPORT_FROM =
  /\bexport\s+(type\s+)?\{([^}]*)\}\s*from\s*["']([^"'\n]+)["']/g;
const EXPORT_STAR =
  /\bexport\s+\*\s*(?:as\s+([A-Za-z_$][\w$]*)\s*)?from\s*["']([^"'\n]+)["']/g;
const EXPORT_LIST = /\bexport\s+(type\s+)?\{([^}]*)\}(?!\s*from)/g;
const EXPORT_DECL =
  /\bexport\s+(?:declare\s+)?(?:async\s+)?(?:function\s*\*?|const|let|var|class|enum)\s+([A-Za-z_$][\w$]*)/g;
const EXPORT_DEFAULT_DECL =
  /\bexport\s+default\s+(?:async\s+)?(?:function\s*\*?|class)\s*([A-Za-z_$][\w$]*)?/g;
/** `export default Hero` and `export default memo(Hero)`. */
const EXPORT_DEFAULT_EXPR =
  /\bexport\s+default\s+(?:[\w$.]+\s*\(\s*)*([A-Za-z_$][\w$]*)/g;
/** `export default memo(function Hero() {…})`. */
const EXPORT_DEFAULT_WRAPPED_FN =
  /\bexport\s+default\s+[\w$.]+\s*\(\s*(?:async\s+)?function\s*([A-Za-z_$][\w$]*)/g;
const TOP_DECL =
  /^(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:function\s*\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm;
/**
 * A capitalised JSX tag. The lookbehind rejects type arguments
 * (`useState<User>`), which always follow an identifier or bracket directly.
 */
const JSX_TAG =
  /(?<![\w$.)\]])<([A-Z][\w$]*(?:\.[A-Za-z_$][\w$]*)*)(?=[\s/>])/g;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const NAMESPACE_CLAUSE = /^\*\s*as\s+([A-Za-z_$][\w$]*)$/;
const BRACE_GROUP = /\{([^}]*)\}/;
const AS_SPLIT = /\s+as\s+/;
const TYPE_PREFIX = /^type\s+/;
const DECLARATION_KEYWORDS = new Set(["function", "class", "async", "new"]);
const QUOTES: ReadonlySet<string> = new Set(['"', "'", "`"]);
const NON_NEWLINE = /[^\n]/g;

interface ImportBinding {
  /** `default`, `*` for a namespace, or the named export. */
  imported: string;
  local: string;
  specifier: string;
}

interface ReExport {
  exported: string;
  /** `*` for `export * as ns from`. */
  imported: string;
  specifier: string;
}

interface JsxTag {
  line: number;
  name: string;
}

interface FileRecord {
  bindings: ImportBinding[];
  declared: Set<string>;
  exportAll: string[];
  /** Exported name → local name, for everything this file itself exports. */
  localExports: Map<string, string>;
  mtimeMs: number;
  reExports: ReExport[];
  /** Specifiers imported for effect only, or dynamically. */
  sideEffects: string[];
  size: number;
  tags: JsxTag[];
}

interface PathAlias {
  prefix: string;
  suffix: string;
  targets: string[];
  wildcard: boolean;
}

interface PathConfig {
  aliases: PathAlias[];
  /** Only set when the config declares one; bare specifiers then resolve. */
  baseUrl: string | null;
  /** The config's `path@mtime`, so an edit invalidates resolution. */
  stamp: string;
}

type Resolution =
  | { file: string; kind: "file" }
  | { kind: "external" }
  | { kind: "unresolved" };

interface Target {
  /** The name the defining file exports it under. */
  exportName: string;
  file: string;
  /** Its declared name in that file — the key two import paths agree on. */
  local: string;
}

interface Resolved {
  external: boolean;
  target: Target | null;
}

interface RouteEntry {
  /** Project-relative directory the file sits in, route groups included. */
  dir: string;
  kind: "layout" | "page";
  route: string | null;
  router: "app" | "pages";
}

interface Derived {
  followCache: Map<string, Target | null>;
  /** Def key → files importing that binding (any use, not just JSX). */
  importers: Map<string, Set<string>> | null;
  pageRoutes: { dir: string; route: string; router: "app" | "pages" }[] | null;
  reachCache: Map<string, string[]>;
  resolveCache: Map<string, Resolution>;
  reverse: Map<string, Set<string>> | null;
  /** Def key → JSX usage count across the project. */
  usage: Map<string, number> | null;
}

interface ProjectIndex {
  config: PathConfig;
  cwd: string;
  derived: Derived;
  files: Map<string, FileRecord>;
}

const INDEXES = new Map<string, ProjectIndex>();

function freshDerived(): Derived {
  return {
    followCache: new Map(),
    importers: null,
    pageRoutes: null,
    reachCache: new Map(),
    resolveCache: new Map(),
    reverse: null,
    usage: null,
  };
}

/**
 * The index for `cwd`, brought up to date: one walk, a stat per file, and a
 * reparse only for files whose mtime or size moved. Any change drops every
 * derived table, which are cheap to rebuild from the per-file records.
 */
function refreshIndex(cwd: string): ProjectIndex {
  const config = readPathConfig(cwd);
  const prior = INDEXES.get(cwd);
  const files = new Map<string, FileRecord>();
  let changed = !prior || prior.config.stamp !== config.stamp;
  const paths = walkFiles(cwd, {
    extensions: INDEX_EXTENSIONS,
    reject: (name) => isMinified(name) || DTS_FILE.test(name),
  });
  for (const file of paths) {
    const record = currentRecord(file, prior?.files.get(file));
    if (!record) {
      continue;
    }
    if (record !== prior?.files.get(file)) {
      changed = true;
    }
    files.set(file, record);
  }
  if (prior && !changed && prior.files.size === files.size) {
    return prior;
  }
  const index: ProjectIndex = { config, cwd, derived: freshDerived(), files };
  INDEXES.set(cwd, index);
  return index;
}

function currentRecord(
  file: string,
  prior: FileRecord | undefined
): FileRecord | null {
  let mtimeMs: number;
  let size: number;
  try {
    ({ mtimeMs, size } = statSync(file));
  } catch {
    return null;
  }
  if (prior && prior.mtimeMs === mtimeMs && prior.size === size) {
    return prior;
  }
  const text = readCapped(file);
  if (text === null) {
    return null;
  }
  return parseFile(file, text, mtimeMs, size);
}

/**
 * Blank out comments, keeping every newline and every string, so regexes over
 * the result see no commented-out imports or `<Tag`s and report true lines.
 *
 * Quotes end at a newline: an apostrophe in JSX text (`Don't`) would otherwise
 * swallow the rest of the file as a string.
 */
function stripComments(text: string): string {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i] ?? "";
    const next = text[i + 1] ?? "";
    if (ch === "/" && next === "/") {
      const end = text.indexOf("\n", i);
      i = end === -1 ? text.length : end;
    } else if (ch === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end === -1 ? text.length : end + 2;
      out.push(text.slice(i, stop).replace(NON_NEWLINE, " "));
      i = stop;
    } else if (QUOTES.has(ch)) {
      const stop = stringEnd(text, i, ch);
      out.push(text.slice(i, stop));
      i = stop;
    } else {
      out.push(ch);
      i += 1;
    }
  }
  return out.join("");
}

/** Index just past the string opened at `start`; see `stripComments`. */
function stringEnd(text: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") {
      i += 2;
    } else if (ch === quote || (ch === "\n" && quote !== "`")) {
      return i + 1;
    } else {
      i += 1;
    }
  }
  return text.length;
}

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) {
      starts.push(i + 1);
    }
  }
  return starts;
}

function lineAt(starts: readonly number[], offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if ((starts[mid] ?? 0) <= offset) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo + 1;
}

function parseFile(
  file: string,
  raw: string,
  mtimeMs: number,
  size: number
): FileRecord {
  const text = stripComments(raw);
  const record: FileRecord = {
    bindings: [],
    declared: new Set(),
    exportAll: [],
    localExports: new Map(),
    mtimeMs,
    reExports: [],
    sideEffects: [],
    size,
    tags: [],
  };
  parseImports(text, record);
  parseExports(text, record);
  for (const match of text.matchAll(TOP_DECL)) {
    if (match[1]) {
      record.declared.add(match[1]);
    }
  }
  if (JSX_CAPABLE.test(file)) {
    const starts = lineStarts(text);
    for (const match of text.matchAll(JSX_TAG)) {
      if (match[1]) {
        record.tags.push({ line: lineAt(starts, match.index), name: match[1] });
      }
    }
  }
  return record;
}

function parseImports(text: string, record: FileRecord): void {
  for (const match of text.matchAll(IMPORT_FROM)) {
    const [, typeOnly, clause, specifier] = match;
    if (!(typeOnly || clause === undefined || specifier === undefined)) {
      parseImportClause(clause, specifier, record.bindings);
    }
  }
  for (const match of text.matchAll(IMPORT_BARE)) {
    if (match[1]) {
      record.sideEffects.push(match[1]);
    }
  }
  for (const match of text.matchAll(IMPORT_DYNAMIC)) {
    if (match[1]) {
      record.sideEffects.push(match[1]);
    }
  }
  for (const match of text.matchAll(LAZY_BINDING)) {
    if (match[1] && match[2]) {
      record.bindings.push({
        imported: "default",
        local: match[1],
        specifier: match[2],
      });
    }
  }
}

function parseImportClause(
  clause: string,
  specifier: string,
  out: ImportBinding[]
): void {
  let rest = clause;
  const brace = clause.match(BRACE_GROUP);
  if (brace) {
    for (const [imported, local] of splitNamedList(brace[1] ?? "")) {
      out.push({ imported, local, specifier });
    }
    rest = clause.replace(brace[0], "");
  }
  for (const piece of rest.split(",")) {
    const part = piece.trim();
    const namespace = part.match(NAMESPACE_CLAUSE);
    if (namespace?.[1]) {
      out.push({ imported: "*", local: namespace[1], specifier });
    } else if (IDENTIFIER.test(part) && part !== "type") {
      out.push({ imported: "default", local: part, specifier });
    }
  }
}

/** `a, b as c, type d` → [[a, a], [b, c]]: pairs of (source name, alias). */
function splitNamedList(list: string): [string, string][] {
  const out: [string, string][] = [];
  for (const piece of list.split(",")) {
    const part = piece.trim();
    if (!part || TYPE_PREFIX.test(part)) {
      continue;
    }
    const [from, to] = part.split(AS_SPLIT).map((s) => s.trim());
    if (from && IDENTIFIER.test(from)) {
      const alias = to ?? from;
      if (IDENTIFIER.test(alias)) {
        out.push([from, alias]);
      }
    }
  }
  return out;
}

function parseExports(text: string, record: FileRecord): void {
  parseReExports(text, record);
  parseLocalExports(text, record);
  parseDefaultExport(text, record);
}

function parseReExports(text: string, record: FileRecord): void {
  for (const match of text.matchAll(EXPORT_FROM)) {
    const [, typeOnly, list, specifier] = match;
    if (typeOnly || list === undefined || specifier === undefined) {
      continue;
    }
    for (const [imported, exported] of splitNamedList(list)) {
      record.reExports.push({ exported, imported, specifier });
    }
  }
  for (const match of text.matchAll(EXPORT_STAR)) {
    const [, alias, specifier] = match;
    if (!specifier) {
      continue;
    }
    if (alias) {
      record.reExports.push({ exported: alias, imported: "*", specifier });
    } else {
      record.exportAll.push(specifier);
    }
  }
}

function parseLocalExports(text: string, record: FileRecord): void {
  for (const match of text.matchAll(EXPORT_LIST)) {
    if (match[1] || match[2] === undefined) {
      continue;
    }
    for (const [local, exported] of splitNamedList(match[2])) {
      record.localExports.set(exported, local);
    }
  }
  for (const match of text.matchAll(EXPORT_DECL)) {
    if (match[1]) {
      record.localExports.set(match[1], match[1]);
    }
  }
}

function parseDefaultExport(text: string, record: FileRecord): void {
  for (const match of text.matchAll(EXPORT_DEFAULT_DECL)) {
    record.localExports.set("default", match[1] ?? "default");
    if (!match[1]) {
      record.declared.add("default");
    }
    return;
  }
  for (const match of text.matchAll(EXPORT_DEFAULT_WRAPPED_FN)) {
    if (match[1]) {
      record.localExports.set("default", match[1]);
      record.declared.add(match[1]);
      return;
    }
  }
  for (const match of text.matchAll(EXPORT_DEFAULT_EXPR)) {
    if (match[1] && !DECLARATION_KEYWORDS.has(match[1])) {
      record.localExports.set("default", match[1]);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// tsconfig paths

const TRAILING_COMMA = /,(\s*[}\]])/g;
const CONFIG_NAMES = ["tsconfig.json", "jsconfig.json"] as const;

interface RawCompilerOptions {
  baseUrl?: unknown;
  paths?: unknown;
}

interface RawConfig {
  compilerOptions?: RawCompilerOptions;
  extends?: unknown;
}

function readJsonc(path: string): RawConfig | null {
  const text = readCapped(path);
  if (text === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(
      stripComments(text).replace(TRAILING_COMMA, "$1")
    );
    return parsed && typeof parsed === "object" ? (parsed as RawConfig) : null;
  } catch {
    return null;
  }
}

/**
 * `compilerOptions.paths`/`baseUrl` from the project's tsconfig (or
 * jsconfig), following one relative `extends`. Paths resolve against
 * `baseUrl` when set and the declaring config's directory otherwise, which is
 * what TypeScript itself has done since 4.1.
 */
function readPathConfig(cwd: string): PathConfig {
  for (const name of CONFIG_NAMES) {
    const path = join(cwd, name);
    let stamp: string;
    try {
      stamp = `${path}@${statSync(path).mtimeMs}`;
    } catch {
      continue;
    }
    const config = readJsonc(path);
    if (!config) {
      return { aliases: [], baseUrl: null, stamp };
    }
    const { options, optionsDir } = withParentOptions(cwd, config);
    const baseUrl =
      typeof options.baseUrl === "string"
        ? resolve(optionsDir, options.baseUrl)
        : null;
    return {
      aliases: parseAliases(options.paths, baseUrl ?? optionsDir),
      baseUrl,
      stamp,
    };
  }
  return { aliases: [], baseUrl: null, stamp: "none" };
}

/** Compiler options merged over one relative `extends`, and where they live. */
function withParentOptions(
  cwd: string,
  config: RawConfig
): { options: RawCompilerOptions; optionsDir: string } {
  const own = { ...config.compilerOptions };
  if (!(typeof config.extends === "string" && config.extends.startsWith("."))) {
    return { options: own, optionsDir: cwd };
  }
  const parentPath = resolve(cwd, config.extends);
  const parent = readJsonc(
    parentPath.endsWith(".json") ? parentPath : `${parentPath}.json`
  );
  if (!parent?.compilerOptions) {
    return { options: own, optionsDir: cwd };
  }
  // Paths declared only in the parent resolve against the parent's folder.
  const inherited = !(own.paths || own.baseUrl);
  return {
    options: { ...parent.compilerOptions, ...own },
    optionsDir: inherited ? dirname(parentPath) : cwd,
  };
}

function parseAliases(paths: unknown, base: string): PathAlias[] {
  if (!paths || typeof paths !== "object") {
    return [];
  }
  const out: PathAlias[] = [];
  for (const [pattern, targets] of Object.entries(paths)) {
    if (!Array.isArray(targets)) {
      continue;
    }
    const star = pattern.indexOf("*");
    out.push({
      prefix: star === -1 ? pattern : pattern.slice(0, star),
      suffix: star === -1 ? "" : pattern.slice(star + 1),
      targets: targets
        .filter((t): t is string => typeof t === "string")
        .map((t) => resolve(base, t)),
      wildcard: star !== -1,
    });
  }
  // Longest prefix first, as TypeScript matches.
  return out.sort((a, b) => b.prefix.length - a.prefix.length);
}

// ---------------------------------------------------------------------------
// Module resolution — against the index's file set, never the disk

function resolveSpecifier(
  index: ProjectIndex,
  fromFile: string,
  specifier: string
): Resolution {
  const key = `${dirname(fromFile)}\0${specifier}`;
  const cached = index.derived.resolveCache.get(key);
  if (cached) {
    return cached;
  }
  const result = computeResolution(index, fromFile, specifier);
  index.derived.resolveCache.set(key, result);
  return result;
}

function computeResolution(
  index: ProjectIndex,
  fromFile: string,
  specifier: string
): Resolution {
  if (specifier.startsWith(".")) {
    return fileOr(index, resolve(dirname(fromFile), specifier), "unresolved");
  }
  for (const alias of index.config.aliases) {
    const matches = alias.wildcard
      ? specifier.startsWith(alias.prefix) &&
        specifier.endsWith(alias.suffix) &&
        specifier.length >= alias.prefix.length + alias.suffix.length
      : specifier === alias.prefix;
    if (!matches) {
      continue;
    }
    const middle = alias.wildcard
      ? specifier.slice(
          alias.prefix.length,
          specifier.length - alias.suffix.length
        )
      : "";
    for (const target of alias.targets) {
      const found = tryFile(index, target.replace("*", middle));
      if (found) {
        return { file: found, kind: "file" };
      }
    }
    return { kind: "unresolved" };
  }
  if (index.config.baseUrl) {
    const found = tryFile(index, join(index.config.baseUrl, specifier));
    if (found) {
      return { file: found, kind: "file" };
    }
  }
  return { kind: "external" };
}

function fileOr(
  index: ProjectIndex,
  base: string,
  fallback: "external" | "unresolved"
): Resolution {
  const found = tryFile(index, base);
  return found ? { file: found, kind: "file" } : { kind: fallback };
}

function tryFile(index: ProjectIndex, base: string): string | null {
  if (index.files.has(base)) {
    return base;
  }
  const stems = [base];
  if (JS_SPECIFIER_EXT.test(base)) {
    // TS ESM style: `import "./x.js"` names the file `x.ts`.
    stems.push(base.replace(JS_SPECIFIER_EXT, ""));
  }
  for (const stem of stems) {
    for (const ext of RESOLVE_EXTENSIONS) {
      if (index.files.has(stem + ext)) {
        return stem + ext;
      }
    }
  }
  for (const ext of RESOLVE_EXTENSIONS) {
    const candidate = join(base, `index${ext}`);
    if (index.files.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Following exports through barrels

/**
 * Where `name`, as exported by `file`, is actually declared. Follows
 * `export { X } from`, `export *`, and re-exported imports. Null when the file
 * provably does not export it (so an `export *` search can move on).
 */
function followExport(
  index: ProjectIndex,
  file: string,
  name: string,
  depth = 0
): Target | null {
  const key = `${file}\0${name}`;
  const cache = index.derived.followCache;
  if (cache.has(key)) {
    return cache.get(key) ?? null;
  }
  // Seed before recursing, so an import cycle ends instead of spinning.
  cache.set(key, null);
  const result =
    depth > MAX_EXPORT_HOPS ? null : computeExport(index, file, name, depth);
  cache.set(key, result);
  return result;
}

function computeExport(
  index: ProjectIndex,
  file: string,
  name: string,
  depth: number
): Target | null {
  const record = index.files.get(file);
  if (!record) {
    return null;
  }
  const local = record.localExports.get(name);
  if (local !== undefined) {
    // `import { X } from "./x"; export { X }` is a re-export in disguise.
    const binding = record.bindings.find((b) => b.local === local);
    if (binding && binding.imported !== "*") {
      const followed = followHop(
        index,
        file,
        binding.specifier,
        binding.imported,
        depth
      );
      if (followed) {
        return followed;
      }
    }
    return { exportName: name, file, local };
  }
  const re = record.reExports.find((r) => r.exported === name);
  if (re) {
    return (
      followHop(index, file, re.specifier, re.imported, depth) ?? {
        exportName: name,
        file,
        local: name,
      }
    );
  }
  return name === "default"
    ? null
    : fromExportAll(index, file, record, name, depth);
}

/**
 * `imported` as exported by the module `specifier` names, followed to its
 * declaration; the module itself when it cannot be followed further. Null
 * only when the specifier is not a project file.
 */
function followHop(
  index: ProjectIndex,
  file: string,
  specifier: string,
  imported: string,
  depth: number
): Target | null {
  const next = resolveSpecifier(index, file, specifier);
  if (next.kind !== "file") {
    return null;
  }
  if (imported === "*") {
    return { exportName: "*", file: next.file, local: "*" };
  }
  return (
    followExport(index, next.file, imported, depth + 1) ?? {
      exportName: imported,
      file: next.file,
      local: imported,
    }
  );
}

function fromExportAll(
  index: ProjectIndex,
  file: string,
  record: FileRecord,
  name: string,
  depth: number
): Target | null {
  for (const specifier of record.exportAll) {
    const next = resolveSpecifier(index, file, specifier);
    if (next.kind === "file") {
      const found = followExport(index, next.file, name, depth + 1);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function withMembers(target: Target, members: readonly string[]): Target {
  if (members.length === 0) {
    return target;
  }
  const suffix = `.${members.join(".")}`;
  return {
    exportName: target.exportName + suffix,
    file: target.file,
    local: target.local + suffix,
  };
}

function exportNameOf(record: FileRecord, local: string): string {
  for (const [exported, name] of record.localExports) {
    if (name === local) {
      return exported;
    }
  }
  return local;
}

/**
 * What a name used in `file` refers to: an import (followed to its
 * declaration), a declaration in the same file, or null for a global or
 * something the index cannot see. `Foo.Bar` resolves `Foo` and keeps `.Bar`.
 */
function resolveLocal(
  index: ProjectIndex,
  file: string,
  name: string
): Resolved | null {
  const [first = "", ...rest] = name.split(".");
  const record = index.files.get(file);
  if (!record) {
    return null;
  }
  const binding = record.bindings.find((b) => b.local === first);
  if (binding) {
    const hop = resolveSpecifier(index, file, binding.specifier);
    if (hop.kind === "external") {
      return { external: true, target: null };
    }
    if (hop.kind !== "file") {
      return { external: false, target: null };
    }
    let { imported } = binding;
    const members = [...rest];
    if (imported === "*") {
      const member = members.shift();
      if (member === undefined) {
        return {
          external: false,
          target: { exportName: "*", file: hop.file, local: "*" },
        };
      }
      imported = member;
    }
    const target = followExport(index, hop.file, imported) ?? {
      exportName: imported,
      file: hop.file,
      local: imported,
    };
    return { external: false, target: withMembers(target, members) };
  }
  if (record.declared.has(first)) {
    const target = {
      exportName: exportNameOf(record, first),
      file,
      local: first,
    };
    return { external: false, target: withMembers(target, rest) };
  }
  return null;
}

const defKey = (target: Target): string => `${target.file}#${target.local}`;

/**
 * JSX usage counts and importer sets for every definition, in one pass over
 * the whole index. Resolutions are memoised per (file, name), so a file that
 * renders `<Card>` twenty times resolves it once.
 */
function ensureUsage(index: ProjectIndex): {
  importers: Map<string, Set<string>>;
  usage: Map<string, number>;
} {
  const { derived } = index;
  if (derived.usage && derived.importers) {
    return { importers: derived.importers, usage: derived.usage };
  }
  const usage = new Map<string, number>();
  const importers = new Map<string, Set<string>>();
  for (const [file, record] of index.files) {
    const seen = new Map<string, Resolved | null>();
    const lookup = (name: string): Resolved | null => {
      if (!seen.has(name)) {
        seen.set(name, resolveLocal(index, file, name));
      }
      return seen.get(name) ?? null;
    };
    for (const tag of record.tags) {
      const target = lookup(tag.name)?.target;
      if (target) {
        const key = defKey(target);
        usage.set(key, (usage.get(key) ?? 0) + 1);
      }
    }
    for (const binding of record.bindings) {
      const target = lookup(binding.local)?.target;
      if (target) {
        const key = defKey(target);
        const set = importers.get(key) ?? new Set<string>();
        set.add(file);
        importers.set(key, set);
      }
    }
  }
  derived.usage = usage;
  derived.importers = importers;
  return { importers, usage };
}

// ---------------------------------------------------------------------------
// Routes

const APP_ROUTE_FILE =
  /^(?:src\/)?app\/(?:(.*)\/)?(page|layout|template|default|not-found|error|loading|global-error)\.(?:tsx|ts|jsx|js|mdx)$/;
const PAGES_ROUTE_FILE = /^(?:src\/)?pages\/(.+)\.(?:tsx|ts|jsx|js|mdx)$/;
const PAGES_API = /^api(?:\/|$)/;
const ROUTE_GROUP = /^\(.*\)$/;
const PARALLEL_SLOT = /^@/;
const INDEX_SUFFIX = /(?:^|\/)index$/;
const ROUTE_COMPONENT_NAME = /(?:Page|Layout)$/;

function classifyRoute(rel: string): RouteEntry | null {
  const app = rel.match(APP_ROUTE_FILE);
  if (app) {
    const dir = app[1] ?? "";
    if (app[2] === "page") {
      return { dir, kind: "page", route: appRoute(dir), router: "app" };
    }
    return { dir, kind: "layout", route: null, router: "app" };
  }
  const pages = rel.match(PAGES_ROUTE_FILE);
  if (!pages?.[1] || PAGES_API.test(pages[1]) || pages[1] === "_document") {
    return null;
  }
  if (pages[1] === "_app") {
    return { dir: "", kind: "layout", route: null, router: "pages" };
  }
  const route = `/${pages[1].replace(INDEX_SUFFIX, "")}`;
  return { dir: pages[1], kind: "page", route, router: "pages" };
}

/** `(marketing)/about` → `/about`; groups and parallel slots are not URLs. */
function appRoute(dir: string): string {
  const segments = dir
    .split("/")
    .filter((s) => s && !ROUTE_GROUP.test(s) && !PARALLEL_SLOT.test(s));
  return `/${segments.join("/")}`;
}

function isRouteFile(rel: string): boolean {
  return classifyRoute(rel) !== null;
}

function ensurePageRoutes(
  index: ProjectIndex
): { dir: string; route: string; router: "app" | "pages" }[] {
  if (index.derived.pageRoutes) {
    return index.derived.pageRoutes;
  }
  const out: { dir: string; route: string; router: "app" | "pages" }[] = [];
  for (const file of index.files.keys()) {
    const entry = classifyRoute(projectPath(index.cwd, file));
    if (entry?.kind === "page" && entry.route) {
      out.push({ dir: entry.dir, route: entry.route, router: entry.router });
    }
  }
  index.derived.pageRoutes = out;
  return out;
}

function ensureReverse(index: ProjectIndex): Map<string, Set<string>> {
  if (index.derived.reverse) {
    return index.derived.reverse;
  }
  const reverse = new Map<string, Set<string>>();
  const link = (from: string, to: string): void => {
    if (to !== from) {
      const set = reverse.get(to) ?? new Set<string>();
      set.add(from);
      reverse.set(to, set);
    }
  };
  for (const [file, record] of index.files) {
    // A named import from a barrel links straight to the declaring file.
    // Linking to the barrel instead would make every page that imports one
    // section from `sections/index.ts` appear to render all of them.
    for (const binding of record.bindings) {
      const hop = resolveSpecifier(index, file, binding.specifier);
      if (hop.kind !== "file") {
        continue;
      }
      const target =
        binding.imported === "*"
          ? null
          : followExport(index, hop.file, binding.imported);
      link(file, target?.file ?? hop.file);
    }
    const specifiers = [
      ...record.reExports.map((r) => r.specifier),
      ...record.exportAll,
      ...record.sideEffects,
    ];
    for (const specifier of specifiers) {
      const hop = resolveSpecifier(index, file, specifier);
      if (hop.kind === "file") {
        link(file, hop.file);
      }
    }
  }
  index.derived.reverse = reverse;
  return reverse;
}

/**
 * Routes whose module graph reaches `file`. A layout that reaches it renders
 * it on every page beneath the layout's directory, so it contributes all of
 * those.
 */
function pagesFor(index: ProjectIndex, file: string): string[] {
  const cached = index.derived.reachCache.get(file);
  if (cached) {
    return cached;
  }
  const reverse = ensureReverse(index);
  const pages = ensurePageRoutes(index);
  const routes = new Set<string>();
  const seen = new Set<string>([file]);
  const queue = [file];
  while (queue.length > 0) {
    const current = queue.pop() as string;
    addRoutesOf(projectPath(index.cwd, current), pages, routes);
    for (const importer of reverse.get(current) ?? []) {
      if (!seen.has(importer)) {
        seen.add(importer);
        queue.push(importer);
      }
    }
  }
  const out = [...routes].sort();
  index.derived.reachCache.set(file, out);
  return out;
}

function addRoutesOf(
  rel: string,
  pages: readonly { dir: string; route: string; router: "app" | "pages" }[],
  routes: Set<string>
): void {
  const entry = classifyRoute(rel);
  if (!entry) {
    return;
  }
  if (entry.kind === "page" && entry.route) {
    routes.add(entry.route);
    return;
  }
  for (const page of pages) {
    if (page.router !== entry.router) {
      continue;
    }
    if (
      entry.dir === "" ||
      page.dir === entry.dir ||
      page.dir.startsWith(`${entry.dir}/`)
    ) {
      routes.add(page.route);
    }
  }
}

// ---------------------------------------------------------------------------
// Refs → component info

interface RefContext {
  callSiteAbs: string | null;
  info: ComponentInfo;
  /** The tag as written at the call site; differs from `name` when aliased. */
  localName: string | null;
  target: Target | null;
}

/**
 * The name the call site writes the component as. Usually the display name
 * itself; when the file has no such binding (a default import renamed on the
 * way in), the capitalised tag nearest the reported line.
 */
function localNameAt(
  record: FileRecord,
  name: string,
  line: number
): string | null {
  const first = name.split(".")[0] ?? name;
  if (
    record.declared.has(first) ||
    record.bindings.some((b) => b.local === first)
  ) {
    return name;
  }
  let best: JsxTag | null = null;
  for (const tag of record.tags) {
    const distance = Math.abs(tag.line - line);
    if (distance > CALL_SITE_SLACK) {
      continue;
    }
    if (!best || distance < Math.abs(best.line - line)) {
      best = tag;
    }
  }
  return best?.name ?? null;
}

function emptyInfo(ref: ComponentFrameRef): ComponentInfo {
  return {
    callSite: null,
    definition: null,
    external: false,
    instances: 0,
    isRoute: ROUTE_COMPONENT_NAME.test(ref.name),
    key: ref.key,
    name: ref.name,
    pages: [],
    shared: false,
  };
}

interface CallSiteBinding {
  callSite: SourceLocation | null;
  callSiteAbs: string | null;
  external: boolean;
  localName: string | null;
  target: Target | null;
}

/** The ref's call site, the name written there, and what that name is. */
function bindCallSite(
  index: ProjectIndex,
  ref: ComponentFrameRef
): CallSiteBinding {
  const callSite = pickCallSite(index.cwd, ref.frames);
  const none = {
    callSite,
    callSiteAbs: null,
    external: false,
    localName: null,
    target: null,
  };
  if (!callSite) {
    return none;
  }
  const callSiteAbs = resolve(index.cwd, callSite.file);
  const record = index.files.get(callSiteAbs);
  const localName = record
    ? localNameAt(record, ref.name, callSite.line ?? 0)
    : null;
  if (!localName) {
    return { ...none, callSiteAbs };
  }
  const resolved = resolveLocal(index, callSiteAbs, localName);
  const target = resolved?.target;
  return {
    callSite,
    callSiteAbs,
    external: resolved?.external ?? false,
    localName,
    // A bare namespace (`<UI>`) is not a component.
    target: target && target.local !== "*" ? target : null,
  };
}

function refContext(index: ProjectIndex, ref: ComponentFrameRef): RefContext {
  const { callSite, callSiteAbs, external, localName, target } = bindCallSite(
    index,
    ref
  );
  const definitionFile = target ? projectPath(index.cwd, target.file) : null;
  const isRoute =
    (definitionFile !== null && isRouteFile(definitionFile)) ||
    (callSite === null && ROUTE_COMPONENT_NAME.test(ref.name));
  const instances = target
    ? (ensureUsage(index).usage.get(defKey(target)) ?? 0)
    : 0;
  const pages = target && !external ? pagesFor(index, target.file) : [];
  const definition =
    target && definitionFile
      ? { exportName: target.exportName, file: definitionFile }
      : null;
  const info: ComponentInfo = {
    callSite,
    definition,
    external,
    instances,
    isRoute,
    key: ref.key,
    name: ref.name,
    pages,
    shared: !(external || isRoute) && (instances >= 2 || pages.length >= 2),
  };
  return { callSiteAbs, info, localName, target };
}

/**
 * One `ComponentInfo` per ref, in order. Never throws: a ref that cannot be
 * resolved comes back unshared with no call site.
 */
export function resolveComponents(
  cwd: string,
  refs: ComponentFrameRef[]
): ComponentInfo[] {
  let index: ProjectIndex;
  try {
    index = refreshIndex(cwd);
  } catch {
    return refs.map(emptyInfo);
  }
  return refs.map((ref) => {
    try {
      return refContext(index, ref).info;
    } catch {
      return emptyInfo(ref);
    }
  });
}

// ---------------------------------------------------------------------------
// Detail: declared props (TypeScript) and per-prop origins (call-site JSX)

type TypeScript = typeof TS;

const CMS_SPECIFIER =
  /sanity|groq|contentful|prismic|storyblok|datocms|payload/i;
const WRAPPER_CALLEE = /(?:^|\.)(?:memo|forwardRef)$/;
const NODE_TYPE = /\b(?:ReactNode|ReactElement|ReactChild|JSX\.Element)\b/;
const SKIPPED_PROPS = new Set(["key", "ref", "className", "style"]);
const COLOR_NAME = /colou?r$|^bg$/i;
const IMAGE_NAME =
  /(^|[a-z])(src|image|img|poster|logo|avatar|photo|thumbnail|background)/i;
const LINK_NAME = /(href|url|link)$/i;
/** `imageAlt` names an image but holds its description, which is text. */
const ALT_NAME = /alt(?:text)?$/i;
const MAX_TYPE_TEXT = 80;
const WHITESPACE_RUN = /\s+/g;
const MAX_UNWRAP_DEPTH = 4;
const NODE_MODULES_SEGMENT = "/node_modules/";

interface TsService {
  /** Files asked about so far; the program pulls in their imports. */
  roots: Set<string>;
  service: TS.LanguageService;
  ts: TypeScript;
}

const TS_SERVICES = new Map<string, TsService | null>();

/**
 * The project's own TypeScript first: its version is the one its types were
 * written for. This package's resolution is the fallback; without either,
 * props are simply not offered.
 */
function loadTypeScript(cwd: string): TypeScript | null {
  for (const from of [join(cwd, "package.json"), import.meta.url]) {
    try {
      const mod = createRequire(from)("typescript") as TypeScript;
      if (typeof mod?.createLanguageService === "function") {
        return mod;
      }
    } catch {
      // Try the next resolution root.
    }
  }
  return null;
}

function compilerOptionsFor(ts: TypeScript, cwd: string): TS.CompilerOptions {
  const fallback: TS.CompilerOptions = {
    allowJs: true,
    esModuleInterop: true,
    jsx: ts.JsxEmit.Preserve,
    module: ts.ModuleKind.ESNext,
    moduleResolution:
      ts.ModuleResolutionKind.Bundler ?? ts.ModuleResolutionKind.Node10,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ESNext,
  };
  for (const name of CONFIG_NAMES) {
    const path = join(cwd, name);
    if (!existsSync(path)) {
      continue;
    }
    const parsed = ts.getParsedCommandLineOfConfigFile(
      path,
      {},
      { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined }
    );
    if (parsed) {
      return {
        ...parsed.options,
        allowJs: true,
        noEmit: true,
        skipLibCheck: true,
      };
    }
  }
  return { ...fallback, noEmit: true };
}

/**
 * A long-lived language service per project, so a second detail request only
 * re-checks what changed. Roots grow as components are asked about; library
 * files are versioned as immutable so they are never re-statted.
 */
function tsServiceFor(cwd: string): TsService | null {
  if (TS_SERVICES.has(cwd)) {
    return TS_SERVICES.get(cwd) ?? null;
  }
  const ts = loadTypeScript(cwd);
  if (!ts) {
    TS_SERVICES.set(cwd, null);
    return null;
  }
  const roots = new Set<string>();
  const options = compilerOptionsFor(ts, cwd);
  const host: TS.LanguageServiceHost = {
    directoryExists: ts.sys.directoryExists,
    fileExists: ts.sys.fileExists,
    getCompilationSettings: () => options,
    getCurrentDirectory: () => cwd,
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    getDirectories: ts.sys.getDirectories,
    getScriptFileNames: () => [...roots],
    getScriptSnapshot: (file) => {
      const text = ts.sys.readFile(file);
      return text === undefined
        ? undefined
        : ts.ScriptSnapshot.fromString(text);
    },
    getScriptVersion: (file) => {
      if (toPosix(file).includes(NODE_MODULES_SEGMENT)) {
        return "1";
      }
      try {
        return String(statSync(file).mtimeMs);
      } catch {
        return "0";
      }
    },
    readDirectory: ts.sys.readDirectory,
    readFile: ts.sys.readFile,
  };
  const entry: TsService = {
    roots,
    service: ts.createLanguageService(host, ts.createDocumentRegistry()),
    ts,
  };
  TS_SERVICES.set(cwd, entry);
  return entry;
}

function programWith(
  cwd: string,
  file: string
): { program: TS.Program; ts: TypeScript } | null {
  const entry = tsServiceFor(cwd);
  if (!entry) {
    return null;
  }
  entry.roots.add(file);
  const program = entry.service.getProgram();
  return program ? { program, ts: entry.ts } : null;
}

type FunctionLike =
  | TS.ArrowFunction
  | TS.FunctionDeclaration
  | TS.FunctionExpression;

function hasDefaultModifier(ts: TypeScript, node: TS.Node): boolean {
  const modifiers = ts.canHaveModifiers(node)
    ? ts.getModifiers(node)
    : undefined;
  return (
    modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) ?? false
  );
}

/** The component function a declaration or expression ultimately is. */
function unwrapComponent(
  ts: TypeScript,
  sf: TS.SourceFile,
  expr: TS.Expression,
  depth: number
): FunctionLike | null {
  if (depth > MAX_UNWRAP_DEPTH) {
    return null;
  }
  if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
    return expr;
  }
  if (
    ts.isParenthesizedExpression(expr) ||
    ts.isAsExpression(expr) ||
    ts.isSatisfiesExpression(expr)
  ) {
    return unwrapComponent(ts, sf, expr.expression, depth + 1);
  }
  if (
    ts.isCallExpression(expr) &&
    WRAPPER_CALLEE.test(expr.expression.getText(sf))
  ) {
    const [inner] = expr.arguments;
    return inner ? unwrapComponent(ts, sf, inner, depth + 1) : null;
  }
  if (ts.isIdentifier(expr)) {
    return findDeclared(ts, sf, expr.text, depth + 1);
  }
  return null;
}

function findDeclared(
  ts: TypeScript,
  sf: TS.SourceFile,
  name: string,
  depth: number
): FunctionLike | null {
  for (const statement of sf.statements) {
    const found = declaredIn(ts, sf, statement, name, depth);
    if (found !== undefined) {
      return found;
    }
  }
  return null;
}

/** The component `statement` declares as `name`; undefined when it doesn't. */
function declaredIn(
  ts: TypeScript,
  sf: TS.SourceFile,
  statement: TS.Statement,
  name: string,
  depth: number
): FunctionLike | null | undefined {
  if (ts.isFunctionDeclaration(statement)) {
    const anonymousDefault =
      name === "default" &&
      !statement.name &&
      hasDefaultModifier(ts, statement);
    return statement.name?.text === name || anonymousDefault
      ? statement
      : undefined;
  }
  if (ts.isVariableStatement(statement)) {
    const decl = statement.declarationList.declarations.find(
      (d) => ts.isIdentifier(d.name) && d.name.text === name
    );
    return decl?.initializer
      ? unwrapComponent(ts, sf, decl.initializer, depth)
      : undefined;
  }
  if (
    ts.isExportAssignment(statement) &&
    !statement.isExportEquals &&
    name === "default"
  ) {
    return unwrapComponent(ts, sf, statement.expression, depth);
  }
}

/** TypeScript's flags are bit sets; this is the one place they are tested. */
function hasFlag(flags: number, ...masks: number[]): boolean {
  for (const mask of masks) {
    // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript's type and symbol flags are bit sets
    if ((flags & mask) !== 0) {
      return true;
    }
  }
  return false;
}

function truncate(text: string): string {
  const flat = text.replace(WHITESPACE_RUN, " ").trim();
  return flat.length > MAX_TYPE_TEXT
    ? `${flat.slice(0, MAX_TYPE_TEXT - 1)}…`
    : flat;
}

function unionLiteralOptions(
  ts: TypeScript,
  checker: TS.TypeChecker,
  node: TS.UnionTypeNode,
  depth: number
): string[] | null {
  const out: string[] = [];
  for (const member of node.types) {
    const nullish =
      member.kind === ts.SyntaxKind.UndefinedKeyword ||
      (ts.isLiteralTypeNode(member) &&
        member.literal.kind === ts.SyntaxKind.NullKeyword);
    if (nullish) {
      continue;
    }
    const inner = literalOptionsFromNode(ts, checker, member, depth + 1);
    if (!inner) {
      return null;
    }
    out.push(...inner);
  }
  return out;
}

/**
 * String-literal options in the order the source writes them. The checker's
 * union is ordered by type id, which drifts with whatever the program happened
 * to see first; the declaration is what the author meant.
 */
function literalOptionsFromNode(
  ts: TypeScript,
  checker: TS.TypeChecker,
  node: TS.TypeNode,
  depth = 0
): string[] | null {
  if (depth > MAX_UNWRAP_DEPTH) {
    return null;
  }
  if (ts.isParenthesizedTypeNode(node)) {
    return literalOptionsFromNode(ts, checker, node.type, depth + 1);
  }
  if (ts.isUnionTypeNode(node)) {
    return unionLiteralOptions(ts, checker, node, depth);
  }
  if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) {
    return [node.literal.text];
  }
  if (ts.isTypeReferenceNode(node)) {
    let symbol = checker.getSymbolAtLocation(node.typeName);
    if (symbol && hasFlag(symbol.flags, ts.SymbolFlags.Alias)) {
      symbol = checker.getAliasedSymbol(symbol);
    }
    const alias = symbol?.declarations?.find(ts.isTypeAliasDeclaration);
    return alias
      ? literalOptionsFromNode(ts, checker, alias.type, depth + 1)
      : null;
  }
  return null;
}

function textControl(name: string): PropControl {
  if (COLOR_NAME.test(name)) {
    return "color";
  }
  if (IMAGE_NAME.test(name) && !ALT_NAME.test(name)) {
    return "image";
  }
  if (LINK_NAME.test(name)) {
    return "link";
  }
  return "text";
}

interface Classified {
  control: PropControl;
  options?: string[];
}

function classifyType(
  ts: TypeScript,
  name: string,
  type: TS.Type,
  texts: readonly string[]
): Classified {
  const { TypeFlags } = ts;
  if (texts.some((t) => NODE_TYPE.test(t))) {
    return { control: "node" };
  }
  if (hasFlag(type.flags, TypeFlags.Boolean, TypeFlags.BooleanLiteral)) {
    return { control: "boolean" };
  }
  if (type.isUnion()) {
    const members = type.types;
    if (members.every((m) => m.isStringLiteral())) {
      return {
        control: "enum",
        options: members.map((m) => (m as TS.StringLiteralType).value),
      };
    }
    if (members.every((m) => m.isNumberLiteral())) {
      return {
        control: "enum",
        options: members.map((m) => String((m as TS.NumberLiteralType).value)),
      };
    }
    if (members.every((m) => hasFlag(m.flags, TypeFlags.BooleanLiteral))) {
      return { control: "boolean" };
    }
    return { control: "object" };
  }
  if (type.isStringLiteral()) {
    return { control: "enum", options: [type.value] };
  }
  if (hasFlag(type.flags, TypeFlags.Number, TypeFlags.NumberLiteral)) {
    return { control: "number" };
  }
  if (hasFlag(type.flags, TypeFlags.String, TypeFlags.TemplateLiteral)) {
    return { control: textControl(name) };
  }
  return { control: "object" };
}

function isCallable(type: TS.Type): boolean {
  if (type.isUnion()) {
    return (
      type.types.length > 0 &&
      type.types.every((m) => m.getCallSignatures().length > 0)
    );
  }
  return type.getCallSignatures().length > 0;
}

function defaultsOf(
  ts: TypeScript,
  sf: TS.SourceFile,
  param: TS.ParameterDeclaration
): Map<string, string> {
  const out = new Map<string, string>();
  if (!ts.isObjectBindingPattern(param.name)) {
    return out;
  }
  for (const element of param.name.elements) {
    const key = element.propertyName?.getText(sf) ?? element.name.getText(sf);
    if (element.initializer) {
      out.set(key, element.initializer.getText(sf));
    }
  }
  return out;
}

/** Declared props of a component, in declaration order. Empty on any doubt. */
function readProps(cwd: string, target: Target): PropSpec[] {
  if (target.local.includes(".")) {
    return [];
  }
  const loaded = programWith(cwd, target.file);
  if (!loaded) {
    return [];
  }
  const { program, ts } = loaded;
  const sf = program.getSourceFile(target.file);
  if (!sf) {
    return [];
  }
  const fn = findDeclared(ts, sf, target.local, 0);
  const param = fn?.parameters[0];
  if (!param) {
    return [];
  }
  const checker = program.getTypeChecker();
  const type = checker.getTypeAtLocation(param);
  const defaults = defaultsOf(ts, sf, param);
  const out: PropSpec[] = [];
  for (const prop of checker.getPropertiesOfType(type)) {
    const spec = propSpec(ts, checker, prop, param, defaults);
    if (spec) {
      out.push(spec);
    }
  }
  return out;
}

function propSpec(
  ts: TypeScript,
  checker: TS.TypeChecker,
  prop: TS.Symbol,
  param: TS.ParameterDeclaration,
  defaults: ReadonlyMap<string, string>
): PropSpec | null {
  const name = prop.getName();
  const declarations = prop.getDeclarations() ?? [];
  const fromLibrary =
    declarations.length > 0 &&
    declarations.every((d) =>
      toPosix(d.getSourceFile().fileName).includes(NODE_MODULES_SEGMENT)
    );
  if (SKIPPED_PROPS.has(name) || fromLibrary) {
    return null;
  }
  const type = checker.getNonNullableType(
    checker.getTypeOfSymbolAtLocation(prop, param)
  );
  if (isCallable(type)) {
    return null;
  }
  const [decl] = declarations;
  const typeNode =
    decl && (ts.isPropertySignature(decl) || ts.isPropertyDeclaration(decl))
      ? decl.type
      : undefined;
  const printed = checker.typeToString(type);
  const declaredText = typeNode?.getText();
  const classified = classifyType(ts, name, type, [
    declaredText ?? "",
    printed,
  ]);
  if (classified.control === "enum" && typeNode) {
    const ordered = literalOptionsFromNode(ts, checker, typeNode);
    if (ordered && ordered.length === classified.options?.length) {
      classified.options = ordered;
    }
  }
  const spec: PropSpec = {
    control: classified.control,
    name,
    optional: hasFlag(prop.flags, ts.SymbolFlags.Optional),
    typeText: truncate(declaredText ?? printed),
  };
  if (classified.options) {
    spec.options = classified.options;
  }
  const fallback = defaults.get(name);
  if (fallback !== undefined) {
    spec.defaultValue = fallback;
  }
  return spec;
}

function scriptKindFor(ts: TypeScript, file: string): TS.ScriptKind {
  if (file.endsWith(".tsx")) {
    return ts.ScriptKind.TSX;
  }
  if (file.endsWith(".jsx")) {
    return ts.ScriptKind.JSX;
  }
  if (file.endsWith(".ts") || file.endsWith(".mts") || file.endsWith(".cts")) {
    return ts.ScriptKind.TS;
  }
  return ts.ScriptKind.JS;
}

type JsxOpening = TS.JsxOpeningElement | TS.JsxSelfClosingElement;

/** The `<Local …>` element nearest the call-site line, within the slack. */
function findCallElement(
  ts: TypeScript,
  sf: TS.SourceFile,
  localName: string,
  line: number
): JsxOpening | null {
  let best: { distance: number; node: JsxOpening } | null = null;
  const visit = (node: TS.Node): void => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(sf) === localName
    ) {
      const at = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      const distance = Math.abs(at - line);
      if (distance <= CALL_SITE_SLACK && (!best || distance < best.distance)) {
        best = { distance, node };
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return (best as { distance: number; node: JsxOpening } | null)?.node ?? null;
}

function isLiteralExpression(ts: TypeScript, expr: TS.Expression): boolean {
  const { SyntaxKind } = ts;
  return (
    ts.isStringLiteral(expr) ||
    ts.isNoSubstitutionTemplateLiteral(expr) ||
    ts.isNumericLiteral(expr) ||
    expr.kind === SyntaxKind.TrueKeyword ||
    expr.kind === SyntaxKind.FalseKeyword ||
    expr.kind === SyntaxKind.NullKeyword ||
    (ts.isPrefixUnaryExpression(expr) && ts.isNumericLiteral(expr.operand))
  );
}

function attributeOrigin(
  ts: TypeScript,
  sf: TS.SourceFile,
  attr: TS.JsxAttribute
): PropOrigin {
  const init = attr.initializer;
  if (!init || ts.isStringLiteral(init)) {
    return { kind: "literal" };
  }
  if (ts.isJsxExpression(init)) {
    if (!init.expression || isLiteralExpression(ts, init.expression)) {
      return { kind: "literal" };
    }
    return { kind: "expression", text: init.expression.getText(sf) };
  }
  return { kind: "expression", text: init.getText(sf) };
}

/** `content.hero.data` → `content`, plus the first member (`hero`). */
function spreadBase(
  ts: TypeScript,
  expr: TS.Expression
): { base: string; member: string | null } | null {
  let current: TS.Expression = expr;
  let member: string | null = null;
  while (
    ts.isPropertyAccessExpression(current) ||
    ts.isElementAccessExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    if (ts.isPropertyAccessExpression(current)) {
      member = current.name.text;
    }
    current = current.expression;
  }
  return ts.isIdentifier(current) ? { base: current.text, member } : null;
}

/** Where a spread's object is defined: the import it came through, followed. */
function spreadTarget(
  index: ProjectIndex,
  callSiteAbs: string,
  base: string,
  member: string | null
): Target | null {
  const record = index.files.get(callSiteAbs);
  const binding = record?.bindings.find((b) => b.local === base);
  if (!binding) {
    return record?.declared.has(base)
      ? { exportName: base, file: callSiteAbs, local: base }
      : null;
  }
  const lookup =
    binding.imported === "*" && member ? `${base}.${member}` : base;
  return resolveLocal(index, callSiteAbs, lookup)?.target ?? null;
}

interface OriginsResult {
  origins: Record<string, PropOrigin>;
  spreads: Target[];
}

function readOrigins(
  index: ProjectIndex,
  callSiteAbs: string,
  localName: string,
  line: number,
  props: readonly PropSpec[]
): OriginsResult {
  const origins: Record<string, PropOrigin> = {};
  const spreads: Target[] = [];
  const ts = loadTypeScript(index.cwd);
  const element = ts ? callElementIn(ts, callSiteAbs, localName, line) : null;
  if (ts && element) {
    const record = index.files.get(callSiteAbs);
    const context: AttributeContext = {
      callSiteAbs,
      cms: record ? usesCms(record) : false,
      index,
      props,
      spreads,
      ts,
    };
    applyAttributes(context, element, origins);
  }
  for (const prop of props) {
    origins[prop.name] ??= { kind: "default" };
  }
  return { origins, spreads };
}

interface AttributeContext {
  callSiteAbs: string;
  cms: boolean;
  index: ProjectIndex;
  props: readonly PropSpec[];
  /** Collects each spread's resolved data object, for `sharedData`. */
  spreads: Target[];
  ts: TypeScript;
}

/**
 * Attributes in source order, so a later attribute overrides an earlier
 * spread and a later spread overrides an earlier attribute — as React applies
 * them.
 */
function applyAttributes(
  context: AttributeContext,
  element: JsxOpening,
  origins: Record<string, PropOrigin>
): void {
  const { callSiteAbs, cms, index, props, spreads, ts } = context;
  const sf = element.getSourceFile();
  for (const attr of element.attributes.properties) {
    if (ts.isJsxAttribute(attr)) {
      const name = attr.name.getText(sf);
      if (name !== "key") {
        origins[name] = cmsOr(attributeOrigin(ts, sf, attr), cms);
      }
    } else if (ts.isJsxSpreadAttribute(attr)) {
      const origin = cmsOr(
        spreadOrigin(index, ts, sf, callSiteAbs, attr, spreads),
        cms
      );
      for (const prop of props) {
        origins[prop.name] = origin;
      }
    }
  }
}

function callElementIn(
  ts: TypeScript,
  file: string,
  localName: string,
  line: number
): JsxOpening | null {
  const text = readCapped(file);
  if (text === null) {
    return null;
  }
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(ts, file)
  );
  return findCallElement(ts, sf, localName, line);
}

function spreadOrigin(
  index: ProjectIndex,
  ts: TypeScript,
  sf: TS.SourceFile,
  callSiteAbs: string,
  attr: TS.JsxSpreadAttribute,
  spreads: Target[]
): PropOrigin {
  const origin: PropOrigin = {
    kind: "spread",
    text: attr.expression.getText(sf),
  };
  const base = spreadBase(ts, attr.expression);
  const target = base
    ? spreadTarget(index, callSiteAbs, base.base, base.member)
    : null;
  if (target) {
    origin.exportName = target.exportName;
    origin.file = projectPath(index.cwd, target.file);
    spreads.push(target);
  }
  return origin;
}

function usesCms(record: FileRecord): boolean {
  const specifiers = [
    ...record.bindings.map((b) => b.specifier),
    ...record.sideEffects,
  ];
  return specifiers.some((s) => CMS_SPECIFIER.test(s));
}

function cmsOr(origin: PropOrigin, cms: boolean): PropOrigin {
  if (cms && (origin.kind === "expression" || origin.kind === "spread")) {
    return origin.text === undefined
      ? { kind: "cms" }
      : { kind: "cms", text: origin.text };
  }
  return origin;
}

/**
 * For each spread data object, the routes of *other* files that import the
 * same export — editing it changes those pages too.
 */
function sharedDataFor(
  index: ProjectIndex,
  callSiteAbs: string,
  spreads: readonly Target[]
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (spreads.length === 0) {
    return out;
  }
  const { importers } = ensureUsage(index);
  const own = new Set(pagesFor(index, callSiteAbs));
  for (const target of spreads) {
    const routes = new Set<string>();
    for (const file of importers.get(defKey(target)) ?? []) {
      if (file === callSiteAbs) {
        continue;
      }
      for (const route of pagesFor(index, file)) {
        if (!own.has(route)) {
          routes.add(route);
        }
      }
    }
    out[target.exportName] = [...routes].sort();
  }
  return out;
}

/**
 * Everything `resolveComponents` says about one ref, plus its declared props,
 * where each prop's value comes from at this call site, and which other pages
 * share the data it spreads. Null when neither a call site nor a definition
 * can be found, or on an unexpected failure.
 */
export function resolveComponentDetail(
  cwd: string,
  ref: ComponentFrameRef
): ComponentDetail | null {
  try {
    const index = refreshIndex(cwd);
    const { callSiteAbs, info, localName, target } = refContext(index, ref);
    if (!(info.callSite || info.definition)) {
      return null;
    }
    const props = target && !info.external ? readProps(cwd, target) : [];
    const { origins, spreads } =
      callSiteAbs && localName
        ? readOrigins(
            index,
            callSiteAbs,
            localName,
            info.callSite?.line ?? 0,
            props
          )
        : { origins: defaultOrigins(props), spreads: [] };
    const sharedData = callSiteAbs
      ? sharedDataFor(index, callSiteAbs, spreads)
      : {};
    return { ...info, origins, props, sharedData };
  } catch {
    return null;
  }
}

function defaultOrigins(
  props: readonly PropSpec[]
): Record<string, PropOrigin> {
  const out: Record<string, PropOrigin> = {};
  for (const prop of props) {
    out[prop.name] = { kind: "default" };
  }
  return out;
}
