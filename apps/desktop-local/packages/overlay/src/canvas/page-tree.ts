/**
 * The page list as a site map: `/blog/a` sits under a `/blog` folder, and the
 * pages a CMS template makes fold into one collection row.
 *
 * Pure, so the shape can be tested without frames. `pages-panel.ts` gathers the
 * paths and draws the tree; this only decides what goes where.
 *
 * Collections come from two places, best first:
 *
 * - **The site's route files.** A dynamic route (`app/blog/[slug]/page.tsx`)
 *   is a collection for certain, and every known page it matches is an item.
 *   It shows even with no items found yet, which is how a new blog with no
 *   links to its posts still appears.
 * - **A guess from shape**, when the server could not read the routes. A folder
 *   holding many plain pages is what a collection template produces; see
 *   `COLLECTION_MIN`.
 */

export interface PageNode {
  children: PageNode[];
  kind: "home" | "page" | "folder" | "collection";
  /** The label: `Home`, `/slug`, or a collection's title. */
  name: string;
  /** Whether `path` itself is a page the frames can open. */
  page: boolean;
  /** The page's path, or the folder's. A collection's is its route pattern. */
  path: string;
}

/** What the editor server read from the site's route files. */
export interface RouteInfo {
  dynamic: boolean;
  /** `/about`, `/blog/*`, `/docs/**`. */
  pattern: string;
}

/**
 * How many plain sibling pages make a folder read as a CMS collection. Three
 * hand-made pages under `/docs` is a small section; four or more slugs side by
 * side is what a collection template produces.
 */
const COLLECTION_MIN = 4;
const SEGMENT_SPLIT = /[-_]+/;
const REGEX_SPECIAL = /[.+?^${}()|[\]\\]/g;

interface Trie {
  children: Map<string, Trie>;
  collections: PageNode[];
  page: boolean;
  path: string;
}

/** `blog-posts` → `Blog posts`. */
export function titleOf(segment: string): string {
  const words = segment.split(SEGMENT_SPLIT).filter(Boolean).join(" ");
  return words ? words[0].toUpperCase() + words.slice(1) : segment;
}

/** A route pattern as a test: `*` is one segment, `**` is one or more. */
export function patternTest(pattern: string): RegExp {
  const body = pattern
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      if (segment === "**") {
        return "/.+";
      }
      if (segment === "*") {
        return "/[^/]+";
      }
      return `/${segment.replace(REGEX_SPECIAL, "\\$&")}`;
    })
    .join("");
  return new RegExp(`^${body}$`);
}

/** The static part of a pattern before its first dynamic segment. */
export function anchorOf(pattern: string): string[] {
  const segments = pattern.split("/").filter(Boolean);
  const first = segments.findIndex((s) => s === "*" || s === "**");
  return first === -1 ? segments : segments.slice(0, first);
}

/**
 * Which pattern gets first pick of the pages it matches: a longer static
 * prefix, then more static segments overall, and a catch-all last — so
 * `/blog/*\/edit` keeps its pages from `/blog/**`.
 */
function specificity(pattern: string): number {
  const segments = pattern.split("/").filter(Boolean);
  const statics = segments.filter((s) => s !== "*" && s !== "**").length;
  const catchAll = segments.includes("**") ? 1 : 0;
  return anchorOf(pattern).length * 10_000 + statics * 10 - catchAll;
}

function emptyTrie(path: string): Trie {
  return { children: new Map(), collections: [], page: false, path };
}

function descend(root: Trie, segments: string[]): Trie {
  let at = root;
  for (const segment of segments) {
    let next = at.children.get(segment);
    if (!next) {
      next = emptyTrie(`${at.path}/${segment}`);
      at.children.set(segment, next);
    }
    at = next;
  }
  return at;
}

const byName = (a: PageNode, b: PageNode): number =>
  a.name.localeCompare(b.name);

function toNode(trie: Trie, name: string, guess: boolean): PageNode {
  const kids = [...trie.children.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([segment, child]) => toNode(child, `/${segment}`, guess));
  if (!(kids.length || trie.collections.length)) {
    return { children: [], kind: "page", name, page: true, path: trie.path };
  }
  const leaves = kids.filter((kid) => kid.kind === "page");
  const guessed =
    guess && leaves.length >= COLLECTION_MIN
      ? [
          {
            children: leaves,
            kind: "collection" as const,
            name: titleOf(trie.path.slice(trie.path.lastIndexOf("/") + 1)),
            page: false,
            path: `${trie.path}/*`,
          },
        ]
      : [];
  const children = [
    ...trie.collections,
    ...guessed,
    ...(guessed.length ? kids.filter((kid) => kid.kind !== "page") : kids),
  ];
  return { children, kind: "folder", name, page: trie.page, path: trie.path };
}

/**
 * Pages as a site map: Home, then folders and pages by name, with a
 * collection's pages folded into one row.
 *
 * `routes` is what the server read from the site's files, or empty when it
 * could not. Static routes count as known pages; each dynamic one becomes a
 * collection holding the known pages it matches, the most specific pattern
 * first. A path that is itself a static route never counts as an item.
 */
export function pageTree(
  paths: Iterable<string>,
  routes: readonly RouteInfo[] = []
): PageNode[] {
  const statics = new Set(
    routes.filter((r) => !r.dynamic).map((r) => r.pattern)
  );
  const all = new Set([...paths, ...statics]);
  const root = emptyTrie("");

  const dynamic = routes
    .filter((r) => r.dynamic)
    .sort((a, b) => specificity(b.pattern) - specificity(a.pattern));
  const claimed = new Set<string>();
  for (const route of dynamic) {
    const test = patternTest(route.pattern);
    const anchor = anchorOf(route.pattern);
    const base = anchor.length ? `/${anchor.join("/")}` : "";
    const items: PageNode[] = [];
    for (const path of all) {
      if (claimed.has(path) || statics.has(path) || !test.test(path)) {
        continue;
      }
      claimed.add(path);
      items.push({
        children: [],
        kind: "page",
        name: path.slice(base.length),
        page: true,
        path,
      });
    }
    const last = anchor.at(-1);
    descend(root, anchor).collections.push({
      children: items.sort(byName),
      kind: "collection",
      name: last ? titleOf(last) : "Dynamic pages",
      page: false,
      path: route.pattern,
    });
  }

  let home = false;
  for (const path of all) {
    if (path === "/") {
      home = true;
    } else if (!claimed.has(path)) {
      descend(root, path.split("/").filter(Boolean)).page = true;
    }
  }

  // Only guess from shape when the site's own routes are not known.
  const guess = routes.length === 0;
  const top = [
    ...root.collections,
    ...[...root.children.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([segment, child]) => toNode(child, `/${segment}`, guess)),
  ];
  return home
    ? [
        { children: [], kind: "home", name: "Home", page: true, path: "/" },
        ...top,
      ]
    : top;
}

/** Does `node` hold the page at `path`, at any depth? */
export function holds(node: PageNode, path: string): boolean {
  return node.children.some((kid) => kid.path === path || holds(kid, path));
}
