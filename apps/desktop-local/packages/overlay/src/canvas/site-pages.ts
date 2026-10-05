/**
 * Where the page list learns about pages beyond the links on screen.
 *
 * - **The site's route files**, read by the editor server
 *   (`/__airship/api/pages`). The only source that knows a page nobody links to
 *   yet, and the only one that knows for certain which pages a CMS template
 *   makes.
 * - **The sitemap**, fetched through the proxy like any page. Framework-free,
 *   and on a CMS site usually the one list that names every item.
 *
 * Both are best-effort. A site with neither still gets the links and Home, so
 * every failure here resolves to "nothing extra", never to an error.
 */

import type { RouteInfo } from "./page-tree";

const ROUTES_ENDPOINT = "/__airship/api/pages";
/** Where sitemaps live by convention. Astro's integration writes the second. */
const SITEMAP_PATHS = ["/sitemap.xml", "/sitemap-index.xml"];
/** A sitemap index can nest; a few levels cover every real site. */
const MAX_SITEMAPS = 8;
/** The list is for browsing, not a crawl. */
const MAX_SITEMAP_PAGES = 1000;
const TITLE_SEPARATORS = [" | ", " – ", " — ", " - ", " · "];
const WHITESPACE = /\s+/g;
/** Link text that names the gesture, not the page. */
const GENERIC_LINK =
  /^(read more|learn more|more|here|click here|see all|view all|view|open|next|previous|back|→|←|›|»)$/i;
const MAX_TITLE = 60;

export interface SiteRoutes {
  framework: string | null;
  routes: RouteInfo[];
}

/** The site's routes from its files, or null when the server cannot say. */
export async function loadRoutes(): Promise<SiteRoutes | null> {
  try {
    const res = await fetch(ROUTES_ENDPOINT, { cache: "no-store" });
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as Partial<SiteRoutes>;
    return Array.isArray(body.routes)
      ? { framework: body.framework ?? null, routes: body.routes }
      : null;
  } catch {
    return null;
  }
}

/**
 * The page paths and nested sitemaps one sitemap document names.
 *
 * Paths only, whatever the host: a dev sitemap usually lists the production
 * domain, and it is the same page either way.
 */
export function readSitemap(xml: string): {
  pages: string[];
  nested: string[];
} {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    return { nested: [], pages: [] };
  }
  const locs = (parent: string): string[] =>
    Array.from(doc.querySelectorAll(`${parent} > loc`))
      .map((loc) => loc.textContent?.trim() ?? "")
      .filter(Boolean);
  const pathOf = (loc: string): string | null => {
    try {
      return new URL(loc, "http://site.invalid").pathname;
    } catch {
      return null;
    }
  };
  return {
    nested: locs("sitemap")
      .map(pathOf)
      .filter((p): p is string => p !== null),
    pages: locs("url")
      .map(pathOf)
      .filter((p): p is string => p !== null),
  };
}

async function fetchText(path: string): Promise<string | null> {
  try {
    const res = await fetch(path, { cache: "no-store" });
    const type = res.headers.get("content-type") ?? "";
    // A dev server answers a missing sitemap with its HTML 404 page, often 200.
    return res.ok && !type.includes("html") ? await res.text() : null;
  } catch {
    return null;
  }
}

/**
 * Every page path the site's sitemap names, following a sitemap index.
 *
 * One level at a time, each level's files fetched together: an index's
 * children are only known once the index has been read.
 */
export async function loadSitemap(): Promise<string[]> {
  const seen = new Set<string>();
  const pages = new Set<string>();
  let level = [...SITEMAP_PATHS];
  while (level.length && seen.size < MAX_SITEMAPS) {
    const batch = level
      .filter((path) => !seen.has(path))
      .slice(0, MAX_SITEMAPS - seen.size);
    for (const path of batch) {
      seen.add(path);
    }
    // biome-ignore lint/performance/noAwaitInLoops: each level names the next
    const docs = await Promise.all(batch.map(fetchText));
    level = [];
    for (const xml of docs) {
      if (!xml) {
        continue;
      }
      const found = readSitemap(xml);
      level.push(...found.nested);
      for (const page of found.pages) {
        if (pages.size < MAX_SITEMAP_PAGES) {
          pages.add(page);
        }
      }
    }
  }
  return [...pages];
}

/**
 * A page's name from its `<title>`: `About us | Acme` → `About us`.
 *
 * The site name after the separator is the same on every page, so it is noise
 * in a list of them.
 */
export function titleFromDocument(raw: string): string {
  const title = raw.replace(WHITESPACE, " ").trim();
  for (const sep of TITLE_SEPARATORS) {
    const at = title.indexOf(sep);
    if (at > 0) {
      return clip(title.slice(0, at));
    }
  }
  return clip(title);
}

/** A page's name from the text of a link to it, or "" when that says nothing. */
export function titleFromLink(text: string): string {
  const clean = text.replace(WHITESPACE, " ").trim();
  return clean && !GENERIC_LINK.test(clean) ? clip(clean) : "";
}

function clip(text: string): string {
  return text.length > MAX_TITLE ? `${text.slice(0, MAX_TITLE - 1)}…` : text;
}

/** Is the page at `path` answering? Null when the check itself failed. */
export async function pageStatus(path: string): Promise<number | null> {
  try {
    const res = await fetch(path, { cache: "no-store", method: "HEAD" });
    return res.status;
  } catch {
    return null;
  }
}
