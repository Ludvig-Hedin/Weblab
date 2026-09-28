/**
 * The editor's page list: which pages the user's site has, read from the
 * project's route files on disk.
 *
 * Read-only and never proxied. The Host allowlist runs in `handleHttp` before
 * any `/__airship/` route. The walk never leaves the project: route folders
 * must resolve to themselves under the canonical root, symlinks inside them
 * are skipped, and the walk is capped in entries, depth and routes.
 */
import {
  type Dirent,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import type http from "node:http";
import { join } from "node:path";
import { isPathInside } from "@airship/core";

export const PAGES_API_PATH = "/__airship/api/pages";

export interface SiteRoute {
  dynamic: boolean;
  /** Project-relative file, forward slashes. */
  file: string;
  /** URL pattern. Static segments as-is; a dynamic segment is `*`; a catch-all is `**`. e.g. "/", "/about", "/blog/*", "/docs/**" */
  pattern: string;
}

export interface SiteRoutes {
  framework: Framework | null;
  /** Sorted by pattern, de-duplicated by pattern. */
  routes: SiteRoute[];
}

export type Framework = "next" | "astro" | "sveltekit" | "nuxt" | "remix";

const MAX_ENTRIES = 5000;
const MAX_DEPTH = 12;
const MAX_ROUTES = 1000;

/** Checked in this order, so a project with several picks the first. */
const FRAMEWORK_DEPS: readonly [string, Framework][] = [
  ["next", "next"],
  ["astro", "astro"],
  ["@sveltejs/kit", "sveltekit"],
  ["nuxt", "nuxt"],
  ["@remix-run/react", "remix"],
  ["@remix-run/dev", "remix"],
  ["@react-router/dev", "remix"],
];

/** Fallback when package.json names none: a telltale file or folder. */
const FRAMEWORK_MARKERS: readonly [string, Framework][] = [
  ["astro.config.mjs", "astro"],
  ["astro.config.ts", "astro"],
  ["svelte.config.js", "sveltekit"],
  ["nuxt.config.ts", "nuxt"],
  ["nuxt.config.js", "nuxt"],
  ["next.config.js", "next"],
  ["next.config.mjs", "next"],
  ["next.config.ts", "next"],
  ["app/routes", "remix"],
  ["src/routes", "sveltekit"],
  ["app", "next"],
  ["src/app", "next"],
  ["pages", "next"],
];

const NEXT_APP_PAGE = /^page\.(tsx|ts|jsx|js|mdx)$/;
const NEXT_PAGES_FILE = /\.(tsx|ts|jsx|js|mdx)$/;
const NEXT_PAGES_SKIP = new Set(["_app", "_document", "_error", "404", "500"]);
const ASTRO_FILE = /\.(astro|md|mdx|html)$/;
const NUXT_FILE = /\.vue$/;
const REMIX_FILE = /\.(tsx|ts|jsx|js|mdx|md)$/;
const REMIX_ROUTE_FILE = /^route\.(tsx|ts|jsx|js|mdx|md)$/;
const EXTENSION = /\.[^.]+$/;
const GROUP = /^\([^)]*\)$/;
const INTERCEPT = /^\(\.{1,3}\)/;
const REMIX_DOTS = /\.(?![^[]*\])/;
const REMIX_ESCAPES = /[[\]]/g;

const ERR = {
  failed: "Something went wrong reading your pages. Please try again.",
  method: "This action is not supported.",
} as const;

export function isPagesRequest(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  const q = url.indexOf("?");
  return (q === -1 ? url : url.slice(0, q)) === PAGES_API_PATH;
}

/** Route entry. Never throws and never lets a request reach the dev server. */
export function handlePagesRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  options: { projectRoot: string }
): void {
  try {
    if (req.method !== "GET") {
      res.setHeader("allow", "GET");
      sendJson(res, 405, { error: ERR.method });
      req.resume();
      return;
    }
    sendJson(res, 200, listSiteRoutes(options.projectRoot));
  } catch {
    if (!res.headersSent) {
      sendJson(res, 500, { error: ERR.failed });
    }
  }
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "cache-control": "no-store",
    "content-length": String(Buffer.byteLength(json)),
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  });
  res.end(json);
}

// ---------------------------------------------------------------------------
// Detection

export function listSiteRoutes(projectRoot: string): SiteRoutes {
  let rootReal: string;
  try {
    rootReal = realpathSync(projectRoot);
  } catch {
    return { framework: null, routes: [] };
  }
  const framework = detectFramework(rootReal);
  if (!framework) {
    return { framework: null, routes: [] };
  }
  return { framework, routes: finish(COLLECTORS[framework](rootReal)) };
}

function detectFramework(rootReal: string): Framework | null {
  const deps = readDeps(rootReal);
  for (const [dep, framework] of FRAMEWORK_DEPS) {
    if (deps.has(dep)) {
      return framework;
    }
  }
  for (const [marker, framework] of FRAMEWORK_MARKERS) {
    if (realEntry(rootReal, marker)) {
      return framework;
    }
  }
  return null;
}

function readDeps(rootReal: string): Set<string> {
  const names = new Set<string>();
  if (realEntry(rootReal, "package.json") !== "file") {
    return names;
  }
  try {
    const pkg: unknown = JSON.parse(
      readFileSync(join(rootReal, "package.json"), "utf8")
    );
    for (const key of ["dependencies", "devDependencies"]) {
      const deps = (pkg as Record<string, unknown> | null)?.[key];
      if (deps && typeof deps === "object") {
        for (const name of Object.keys(deps)) {
          names.add(name);
        }
      }
    }
  } catch {
    // Unreadable or malformed: fall back to the folder markers.
  }
  return names;
}

/**
 * What sits at `rel` under the root, if every component on the way is real:
 * its canonical path must equal its lexical one, so no symlink leads out.
 */
function realEntry(rootReal: string, rel: string): "dir" | "file" | null {
  const abs = join(rootReal, rel);
  try {
    const st = lstatSync(abs);
    const real = realpathSync(abs);
    if (real !== abs || !isPathInside(rootReal, real)) {
      return null;
    }
    if (st.isDirectory()) {
      return "dir";
    }
    return st.isFile() ? "file" : null;
  } catch {
    return null;
  }
}

function firstDir(rootReal: string, candidates: string[]): string | null {
  return candidates.find((rel) => realEntry(rootReal, rel) === "dir") ?? null;
}

function finish(routes: SiteRoute[]): SiteRoute[] {
  const byPattern = new Map<string, SiteRoute>();
  for (const route of routes) {
    if (!byPattern.has(route.pattern)) {
      byPattern.set(route.pattern, route);
    }
  }
  return [...byPattern.values()]
    .sort((a, b) => (a.pattern < b.pattern ? -1 : 1))
    .slice(0, MAX_ROUTES);
}

// ---------------------------------------------------------------------------
// Walking

/**
 * Every file under `baseRel`, as paths relative to it, sorted. Skips dot
 * entries, node_modules and symlinks; stops at the entry and depth caps.
 */
function walkFiles(rootReal: string, baseRel: string): string[] {
  const files: string[] = [];
  const budget = { entries: 0 };
  walkDir(join(rootReal, baseRel), "", 0, budget, files);
  return files;
}

function walkDir(
  abs: string,
  rel: string,
  depth: number,
  budget: { entries: number },
  acc: string[]
): void {
  if (depth > MAX_DEPTH) {
    return;
  }
  let entries: Dirent[];
  try {
    entries = readdirSync(abs, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const entry of entries) {
    budget.entries += 1;
    if (budget.entries > MAX_ENTRIES) {
      return;
    }
    if (entry.name.startsWith(".") || entry.name === "node_modules") {
      continue;
    }
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      walkDir(join(abs, entry.name), childRel, depth + 1, budget, acc);
    } else if (entry.isFile()) {
      acc.push(childRel);
    }
  }
}

/** Files under the first existing base, mapped to patterns; null skips one. */
function collect(
  rootReal: string,
  bases: string[],
  toPatterns: (rel: string) => string[] | null
): SiteRoute[] {
  const base = firstDir(rootReal, bases);
  if (!base) {
    return [];
  }
  const routes: SiteRoute[] = [];
  for (const rel of walkFiles(rootReal, base)) {
    for (const pattern of toPatterns(rel) ?? []) {
      routes.push({
        dynamic: pattern.includes("*"),
        file: `${base}/${rel}`,
        pattern,
      });
    }
  }
  return routes;
}

// ---------------------------------------------------------------------------
// Segments

function toPattern(segments: string[]): string {
  return `/${segments.join("/")}`;
}

/** `[...x]` → `**`, `[x]` or `[[x]]` → `*`, anything else unchanged. */
function bracketSegment(segment: string): string {
  if (segment.includes("[...")) {
    return "**";
  }
  return segment.includes("[") ? "*" : segment;
}

/** `[[...x]]`: a catch-all that also matches its parent path. */
function isOptionalCatchAll(segment: string): boolean {
  return segment.startsWith("[[...");
}

/** Patterns for bracket-style segments, adding the parent for `[[...x]]`. */
function bracketPatterns(segments: string[]): string[] {
  const last = segments.at(-1);
  const patterns = [toPattern(segments.map(bracketSegment))];
  if (last && isOptionalCatchAll(last)) {
    patterns.push(toPattern(segments.slice(0, -1).map(bracketSegment)));
  }
  return patterns;
}

/** Drop `index` as the final segment: `blog/index` is `/blog`. */
function dropIndex(segments: string[]): string[] {
  return segments.at(-1) === "index" ? segments.slice(0, -1) : segments;
}

function stripExtension(name: string): string {
  return name.replace(EXTENSION, "");
}

// ---------------------------------------------------------------------------
// Frameworks

const COLLECTORS: Readonly<
  Record<Framework, (rootReal: string) => SiteRoute[]>
> = {
  astro: (root) => collect(root, ["src/pages"], astroPatterns),
  next: (root) => [
    ...collect(root, ["app", "src/app"], nextAppPatterns),
    ...collect(root, ["pages", "src/pages"], nextPagesPatterns),
  ],
  nuxt: (root) => collect(root, ["app/pages", "pages"], nuxtPatterns),
  remix: (root) => collect(root, ["app/routes"], remixPatterns),
  sveltekit: (root) => collect(root, ["src/routes"], sveltePatterns),
};

/** App router: a folder holding `page.tsx`, minus groups. */
function nextAppPatterns(rel: string): string[] | null {
  const parts = rel.split("/");
  if (!NEXT_APP_PAGE.test(parts.pop() ?? "")) {
    return null;
  }
  const skip = parts.some(
    (p) => p.startsWith("_") || p.startsWith("@") || INTERCEPT.test(p)
  );
  if (skip) {
    return null;
  }
  return bracketPatterns(parts.filter((p) => !GROUP.test(p)));
}

/** Pages router: every page file, minus the special ones and `api/`. */
function nextPagesPatterns(rel: string): string[] | null {
  if (!NEXT_PAGES_FILE.test(rel) || rel.endsWith(".d.ts")) {
    return null;
  }
  const parts = stripExtension(rel).split("/");
  const special = parts.length === 1 && NEXT_PAGES_SKIP.has(parts[0] ?? "");
  if (special || parts[0] === "api") {
    return null;
  }
  return bracketPatterns(dropIndex(parts));
}

/** Astro: page files only (not `.ts` endpoints), minus `_` entries. */
function astroPatterns(rel: string): string[] | null {
  if (!ASTRO_FILE.test(rel)) {
    return null;
  }
  const parts = stripExtension(rel).split("/");
  if (parts.some((p) => p.startsWith("_"))) {
    return null;
  }
  return bracketPatterns(dropIndex(parts));
}

/** SvelteKit: a folder holding `+page.svelte`, minus groups. */
function sveltePatterns(rel: string): string[] | null {
  const parts = rel.split("/");
  if (parts.pop() !== "+page.svelte") {
    return null;
  }
  return [toPattern(parts.filter((p) => !GROUP.test(p)).map(bracketSegment))];
}

/** Nuxt: every `.vue` page, minus groups. */
function nuxtPatterns(rel: string): string[] | null {
  if (!NUXT_FILE.test(rel)) {
    return null;
  }
  const parts = dropIndex(stripExtension(rel).split("/"));
  return [toPattern(parts.filter((p) => !GROUP.test(p)).map(bracketSegment))];
}

/**
 * Remix / React Router flat files: `blog.$slug.tsx`, or the folder form
 * `blog.$slug/route.tsx`. Dots separate segments unless escaped in `[]`.
 */
function remixPatterns(rel: string): string[] | null {
  const name = remixRouteName(rel);
  if (name === null) {
    return null;
  }
  const raw = name.split(REMIX_DOTS);
  const last = raw.at(-1) ?? "";
  // `.server`/`.client` modules are not routes; a pathless layout alone is not a page.
  if (last === "server" || last === "client") {
    return null;
  }
  if (last.startsWith("_") && last !== "_index") {
    return null;
  }
  const segments = raw.map(remixSegment).filter((s): s is string => s !== null);
  return [toPattern(segments)];
}

function remixRouteName(rel: string): string | null {
  const parts = rel.split("/");
  if (parts.length === 1) {
    const file = parts[0] ?? "";
    return REMIX_FILE.test(file) ? stripExtension(file) : null;
  }
  if (parts.length === 2 && REMIX_ROUTE_FILE.test(parts[1] ?? "")) {
    return parts[0] ?? null;
  }
  return null;
}

/** One flat-file segment as a pattern segment, or null when it adds no path. */
function remixSegment(segment: string): string | null {
  if (segment === "_index" || segment.startsWith("_")) {
    return null;
  }
  const trimmed = segment.endsWith("_") ? segment.slice(0, -1) : segment;
  if (trimmed === "$") {
    return "**";
  }
  const bare = trimmed.startsWith("(") ? trimmed.slice(1, -1) : trimmed;
  if (bare.startsWith("$")) {
    return "*";
  }
  return bare.replace(REMIX_ESCAPES, "");
}
