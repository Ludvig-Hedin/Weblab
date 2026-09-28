/**
 * The page list — the left dock's Pages tab, after Framer's.
 *
 * A site is more than the one page the frames happen to open on, and there was
 * nowhere that said which others exist or took you to one. Picking a page here
 * points every frame at it, so each device size shows the same page.
 *
 * The list is read from the pages themselves: every same-site link in every
 * loaded frame, plus Home and wherever the frames are now. That needs nothing
 * from the site's framework, and it lists exactly the pages a visitor can reach.
 * A page nothing links to does not show until a frame has been on it.
 *
 * Two more sources fill in what links cannot see (`site-pages.ts`): the site's
 * route files, read by the editor server, and its sitemap. The list is drawn
 * as a site map with CMS collections folded into one row (`page-tree.ts`).
 *
 * Each row names the page by its title when one is known, marks the page with
 * unsaved edits and a page that failed to load, and has a right-click menu.
 * The `+` in the heading asks the agent for a new page.
 */

import { AIRSHIP_MODE_PARAM } from "@airship/protocol";
import { clear, cls, el } from "../dom";
import { type IconName, icon } from "../icons";
import { createMenu, type MenuEntry } from "../popover-host";
import { toast } from "../toast";
import type { FrameManager } from "./frames";
import {
  anchorOf,
  holds,
  type PageNode,
  pageTree,
  type RouteInfo,
} from "./page-tree";
import {
  loadRoutes,
  loadSitemap,
  pageStatus,
  titleFromDocument,
  titleFromLink,
} from "./site-pages";

export interface PagesPanelDeps {
  frames: FrameManager;
}

/** What the app lends the list once it is mounted. The canvas has neither. */
export interface PagesPanelHooks {
  /** Put a prompt in the chat composer for the user to send. */
  askAgent: (prompt: string) => void;
  /** Whether the page on screen has edits not yet saved to code. */
  pendingEdits: () => boolean;
}

/** A link to a file (an image, a PDF, the sitemap) is not a page. */
const FILE_PATH = /\.[a-z0-9]{1,5}$/i;
/** Framework internals that show up as same-origin links. */
const INTERNAL_PATH = /^\/(_next|__|api\/)/;
/** A page with thousands of links should not cost a long list. */
const MAX_PAGES = 200;
const WHITESPACE = /\s+/g;
/** The dynamic tail of a route pattern: `/*` or `/**`. */
const PATTERN_TAIL = /\/\*\*?$/;
const TRAILING_SLASHES = /\/+$/;
/** How long a page's "does it load" answer stands before it is asked again. */
const STATUS_TTL_MS = 15_000;
/** How long the route and sitemap reads stay fresh before a re-show re-reads. */
const SOURCES_TTL_MS = 60_000;
const SLUG_UNSAFE = /[^a-z0-9/-]+/g;
const SLASH_RUNS = /\/{2,}/g;

/** `/about/` and `/about` are one page; `/` stays `/`. */
export function normalizePath(path: string): string {
  const trimmed = path.replace(TRAILING_SLASHES, "");
  return trimmed === "" ? "/" : trimmed;
}

/** Home first, then the rest in path order so nested pages sit together. */
export function sortPages(paths: Iterable<string>): string[] {
  return [...new Set(paths)].sort((a, b) => {
    if (a === "/") {
      return -1;
    }
    if (b === "/") {
      return 1;
    }
    return a.localeCompare(b);
  });
}

/** The site pages a document links to, as normalized paths. */
export function linkedPaths(doc: Document): string[] {
  return pageLinks(doc).map((link) => link.path);
}

/** The site pages a document links to, with each link's text. */
export function pageLinks(doc: Document): { path: string; text: string }[] {
  const origin = doc.location?.origin;
  if (!origin) {
    return [];
  }
  const out: { path: string; text: string }[] = [];
  for (const a of Array.from(doc.querySelectorAll("a[href]"))) {
    let url: URL;
    try {
      url = new URL(a.getAttribute("href") ?? "", doc.baseURI);
    } catch {
      continue;
    }
    const path = url.pathname;
    if (
      url.origin !== origin ||
      FILE_PATH.test(path) ||
      INTERNAL_PATH.test(path)
    ) {
      continue;
    }
    out.push({ path: normalizePath(path), text: a.textContent ?? "" });
  }
  return out;
}

/** What someone typed for a new page, as a path: `About Us` → `/about-us`. */
export function slugPath(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(WHITESPACE, "-")
    .replace(SLUG_UNSAFE, "")
    .replace(SLASH_RUNS, "/");
  return normalizePath(slug.startsWith("/") ? slug : `/${slug}`);
}

interface RowSpec {
  count?: number;
  depth: number;
  folder?: { open: boolean; toggle: (next?: boolean) => void };
  glyph: IconName;
  /** Pages under a collection, for its menu's "Open first item". */
  items?: PageNode[];
  key?: string;
  label: string;
  /** The page this row opens. Absent on a folder or collection that is not one. */
  path?: string;
  tip?: string;
}

export class PagesPanel {
  readonly element: HTMLElement;

  private readonly deps: PagesPanelDeps;
  private hooks: PagesPanelHooks | null = null;
  private readonly addBtn: HTMLButtonElement;
  private readonly list: HTMLElement;
  private readonly search: HTMLInputElement;
  private query = "";
  /**
   * Folders the user opened or closed by hand. Everything else takes its
   * default: folders open, collections shut unless they hold the page you are on.
   */
  private readonly opened = new Map<string, boolean>();
  private current = "/";
  /** The new-page field, while it is open. */
  private draft: HTMLInputElement | null = null;

  private routes: RouteInfo[] = [];
  private sitemap: string[] = [];
  private sourcesAt = 0;
  /** Titles by path: a loaded page's own `<title>` beats a link's text. */
  private readonly docTitles = new Map<string, string>();
  private readonly linkTitles = new Map<string, string>();
  /** HTTP status by path, for the pages someone has opened. */
  private readonly status = new Map<
    string,
    { at: number; code: number | null }
  >();
  private readonly checking = new Set<string>();
  /** What each live row does on a key, read by the window listener. */
  private readonly rowKeys = new WeakMap<
    HTMLElement,
    { activate: () => void; folder: RowSpec["folder"] }
  >();

  constructor(deps: PagesPanelDeps) {
    this.deps = deps;
    /*
     * Window, capture phase: ahead of the shortcut registry, which listens on
     * the document in capture and stops what it handles. A focused row is not
     * an input, so without this Enter ran "Edit text" on the selected element
     * and the arrows nudged it, instead of opening or folding the page.
     */
    window.addEventListener(
      "keydown",
      (e) => {
        const row = e.target instanceof HTMLElement ? e.target : null;
        const keys = row && this.rowKeys.get(row);
        if (keys && rowKey(e, keys.activate, keys.folder, row)) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true
    );
    this.search = el("input", {
      "aria-label": "Search pages",
      class: cls("layers-search"),
      placeholder: "Search pages",
      spellcheck: "false",
      type: "search",
    }) as HTMLInputElement;
    this.search.addEventListener("input", () => {
      this.query = this.search.value.trim().toLowerCase();
      this.render();
    });
    this.search.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.search.value) {
        e.stopPropagation();
        this.search.value = "";
        this.query = "";
        this.render();
      }
    });
    this.addBtn = el(
      "button",
      {
        "aria-label": "New page",
        class: `${cls("pg-add")} ${cls("hidden")}`,
        "data-tip": "New page",
        onClick: () => this.openDraft(),
        type: "button",
      },
      [icon("plus", "sm")]
    ) as HTMLButtonElement;
    this.list = el("div", { class: `${cls("pg-list")} ${cls("scroll-y")}` });
    this.element = el("div", { class: cls("pg") }, [
      el("div", { class: cls("layers-search-wrap") }, [
        icon("search", "sm"),
        this.search,
      ]),
      el("div", { class: cls("pg-head") }, [
        el("span", { text: "Pages" }),
        this.addBtn,
      ]),
      this.list,
    ]);
  }

  /** Lend the list the chat and the change set; shows the `+`. */
  setHooks(hooks: PagesPanelHooks): void {
    this.hooks = hooks;
    this.addBtn.classList.remove(cls("hidden"));
  }

  /** The page the frames are on: the selected frame's, else the first's. */
  private currentPath(): string {
    const { frames } = this.deps;
    const frame = frames.active ?? frames.all[0] ?? null;
    const doc = sitePage(frame?.doc ?? null);
    return normalizePath(doc?.location.pathname ?? frames.pathname);
  }

  /** Re-read the route files and the sitemap, at most once a minute. */
  private refreshSources(): void {
    const now = Date.now();
    if (now - this.sourcesAt < SOURCES_TTL_MS) {
      return;
    }
    this.sourcesAt = now;
    loadRoutes().then((found) => {
      this.routes = (found?.routes ?? []).map((r) => ({
        dynamic: r.dynamic,
        pattern: normalizePath(r.pattern),
      }));
      this.render(this.current);
    });
    loadSitemap().then((paths) => {
      this.sitemap = paths
        .filter((path) => !(FILE_PATH.test(path) || INTERNAL_PATH.test(path)))
        .map(normalizePath);
      this.render(this.current);
    });
  }

  private collect(): string[] {
    const { frames } = this.deps;
    const found = new Set<string>(["/", normalizePath(frames.pathname)]);
    for (const path of this.sitemap) {
      found.add(path);
    }
    for (const frame of frames.all) {
      const doc = sitePage(frame.doc);
      if (!doc) {
        continue;
      }
      const here = normalizePath(doc.location.pathname);
      found.add(here);
      if (doc.title) {
        this.docTitles.set(here, titleFromDocument(doc.title));
      }
      for (const { path, text } of pageLinks(doc)) {
        if (found.size >= MAX_PAGES + this.sitemap.length) {
          break;
        }
        found.add(path);
        const title = titleFromLink(text);
        if (title && !this.linkTitles.has(path)) {
          this.linkTitles.set(path, title);
        }
      }
    }
    return sortPages(found);
  }

  private titleOf(path: string): string | undefined {
    return path === "/"
      ? undefined
      : (this.docTitles.get(path) ?? this.linkTitles.get(path));
  }

  /** Re-read the pages. Cheap enough per frame load, not per pan. */
  render(current = this.currentPath()): void {
    this.current = current;
    this.refreshSources();
    this.checkStatus(current);
    const paths = this.collect();
    // Renders arrive on their own — a frame load, a sitemap read — so whatever
    // held the keyboard has to hold it again once the rows are rebuilt.
    const focused = document.activeElement;
    const { draft } = this;
    const draftFocused = draft !== null && focused === draft;
    const caret = draft?.selectionStart ?? null;
    const focusKey =
      focused instanceof HTMLElement && this.list.contains(focused)
        ? focused.dataset.key
        : undefined;
    this.renderList(paths);
    if (draftFocused && draft) {
      draft.focus();
      if (caret !== null) {
        draft.setSelectionRange(caret, caret);
      }
    } else if (focusKey !== undefined) {
      this.list
        .querySelector<HTMLElement>(`[data-key="${CSS.escape(focusKey)}"]`)
        ?.focus();
    }
  }

  private renderList(paths: string[]): void {
    const { draft } = this;
    clear(this.list);
    // Keep a half-typed new page across the re-renders a frame load causes.
    if (draft) {
      this.list.append(draft.parentElement ?? draft);
    }
    if (this.query) {
      this.renderMatches(paths);
      return;
    }
    for (const node of pageTree(paths, this.routes)) {
      this.renderNode(node, 0);
    }
    this.list.append(
      el("div", {
        class: cls("pg-note"),
        text: this.routes.length
          ? "Read from your site's files, its sitemap and its links."
          : "Pages show up here once a link to them is on screen.",
      })
    );
  }

  /** Ask once per page whether it loads, for the pages someone opens. */
  private checkStatus(path: string): void {
    const known = this.status.get(path);
    const fresh = known && Date.now() - known.at < STATUS_TTL_MS;
    if (fresh || this.checking.has(path)) {
      return;
    }
    this.checking.add(path);
    pageStatus(path).then((code) => {
      this.checking.delete(path);
      const was = this.status.get(path)?.code;
      this.status.set(path, { at: Date.now(), code });
      // Redraw when the answer changes what the row shows: a page the agent
      // has just made stops being a 404.
      if (isBroken(code) !== isBroken(was)) {
        this.render(this.current);
      }
    });
  }

  /** Searching flattens the tree: a match is a page, wherever it lives. */
  private renderMatches(paths: string[]): void {
    const matches = paths.filter((path) => {
      const title = this.titleOf(path)?.toLowerCase() ?? "";
      return (
        path.toLowerCase().includes(this.query) ||
        title.includes(this.query) ||
        (path === "/" && "home".includes(this.query))
      );
    });
    if (!matches.length) {
      this.list.append(
        el("div", { class: cls("insp-hint"), text: "No pages match." })
      );
      return;
    }
    for (const path of matches) {
      this.list.append(
        this.row({
          depth: 0,
          glyph: path === "/" ? "home" : "page",
          label: path === "/" ? "Home" : path,
          path,
        })
      );
    }
  }

  private isOpen(node: PageNode): boolean {
    const chosen = this.opened.get(node.path);
    if (chosen !== undefined) {
      return chosen;
    }
    return node.kind === "folder" || holds(node, this.current);
  }

  private renderNode(node: PageNode, depth: number): void {
    if (!(node.children.length || node.kind === "collection")) {
      this.list.append(
        this.row({
          depth,
          glyph: node.kind === "home" ? "home" : "page",
          label: node.name,
          path: node.path,
        })
      );
      return;
    }
    const open = this.isOpen(node);
    const toggle = (next = !open): void => {
      const focused = this.list.contains(document.activeElement);
      this.opened.set(node.path, next);
      this.render(this.current);
      // The rows were rebuilt; keep the keyboard where it was.
      if (focused) {
        this.list
          .querySelector<HTMLElement>(`[data-key="${CSS.escape(node.path)}"]`)
          ?.focus();
      }
    };
    const collection = node.kind === "collection";
    let glyph: IconName = "database";
    if (!collection) {
      glyph = open ? "folder-open" : "folder";
    }
    this.list.append(
      this.row({
        count: collection ? node.children.length : undefined,
        depth,
        folder: { open, toggle },
        glyph,
        items: collection ? node.children : undefined,
        key: node.path,
        label: node.name,
        // A folder that is also a page opens the page; one that is not, folds.
        path: node.page ? node.path : undefined,
        tip: collection ? this.collectionTip(node) : undefined,
      })
    );
    if (!open) {
      return;
    }
    for (const kid of node.children) {
      this.renderNode(kid, depth + 1);
    }
    if (collection && !node.children.length) {
      this.list.append(
        el("div", {
          class: cls("pg-empty"),
          style: `--pg-depth: ${depth + 1}`,
          text: "No items found yet",
        })
      );
    }
  }

  private collectionTip(node: PageNode): string {
    const n = node.children.length;
    const where = node.path.replace(PATTERN_TAIL, "/…");
    if (!n) {
      return `A CMS collection at ${where}. None of its pages are linked or in the sitemap yet.`;
    }
    return `A CMS collection at ${where}: ${n} page${n === 1 ? "" : "s"} found. Right-click to open the first.`;
  }

  /** What a row says about its page beyond the name. */
  private rowState(spec: RowSpec): {
    broken: boolean;
    on: boolean;
    tip: string;
    title: string | undefined;
    unsaved: boolean;
  } {
    const { path } = spec;
    if (path === undefined) {
      const tip = spec.tip ?? spec.label;
      return {
        broken: false,
        on: false,
        tip,
        title: undefined,
        unsaved: false,
      };
    }
    const on = path === this.current;
    const code = this.status.get(path)?.code;
    const broken = isBroken(code);
    const unsaved = on && (this.hooks?.pendingEdits() ?? false);
    let tip = spec.tip ?? path;
    if (broken) {
      tip =
        code === null ? `${path} did not answer` : `${path} answers ${code}`;
    } else if (unsaved) {
      tip = `${tip} · unsaved edits`;
    }
    return { broken, on, tip, title: this.titleOf(path), unsaved };
  }

  private row(spec: RowSpec): HTMLElement {
    const { folder, path } = spec;
    const { broken, on, tip, title, unsaved } = this.rowState(spec);
    // Not a button: the chevron has to be clickable on its own, and a
    // button cannot hold another. The row is focusable and answers keys.
    const chevron = el("span", { class: cls("pg-chev") });
    if (folder) {
      chevron.append(icon(folder.open ? "chev-down" : "chev-right", "xs"));
      chevron.addEventListener("click", (e) => {
        e.stopPropagation();
        folder.toggle();
      });
    }
    const activate = (): void => {
      if (path === undefined) {
        folder?.toggle();
        return;
      }
      if (folder && !folder.open) {
        this.opened.set(path, true);
      }
      this.open(path);
    };
    const row = el(
      "div",
      {
        "aria-current": on ? "page" : "false",
        class: `${cls("pg-row")}${on ? ` ${cls("pg-row-on")}` : ""}`,
        "data-key": spec.key ?? path ?? spec.label,
        onClick: activate,
        role: "button",
        style: `--pg-depth: ${spec.depth}`,
        tabindex: "0",
        title: tip,
      },
      [
        chevron,
        icon(broken ? "warning" : spec.glyph, "sm"),
        el("span", { class: cls("pg-name") }, [
          el("span", { text: title ?? spec.label }),
          ...(title
            ? [el("span", { class: cls("pg-path"), text: spec.label })]
            : []),
        ]),
        ...(unsaved
          ? [
              el("span", {
                "aria-label": "Unsaved edits",
                class: cls("pg-dot"),
              }),
            ]
          : []),
        ...(spec.count === undefined
          ? []
          : [el("span", { class: cls("pg-count"), text: String(spec.count) })]),
      ]
    );
    if (broken) {
      row.classList.add(cls("pg-row-broken"));
    }
    if (folder) {
      row.setAttribute("aria-expanded", String(folder.open));
    }
    this.rowKeys.set(row, { activate, folder });
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.openMenu({ x: e.clientX, y: e.clientY }, spec);
    });
    return row;
  }

  /** Point every frame at a page. */
  private open(path: string): void {
    // Opening is a fresh look: ask again rather than trust an old answer.
    this.status.delete(path);
    this.deps.frames.goTo(path);
    // The frames are still on the old page until they load.
    this.render(path);
  }

  private openMenu(at: { x: number; y: number }, spec: RowSpec): void {
    const { path } = spec;
    const first = spec.items?.[0]?.path;
    const entries: MenuEntry[] = [];
    if (path !== undefined) {
      entries.push(
        { icon: "proto-navigate", label: "Open", run: () => this.open(path) },
        {
          icon: "proto-open-link",
          label: "Open in browser",
          run: () => window.open(pageUrl(path), "_blank", "noopener"),
        },
        {
          icon: "clipboard",
          label: "Copy link",
          run: () => copyLink(path),
        }
      );
    }
    if (first !== undefined) {
      entries.push({
        icon: "proto-navigate",
        label: "Open first item",
        run: () => this.open(first),
      });
    }
    if (this.hooks) {
      const base = path ?? (spec.key ? `/${anchorOf(spec.key).join("/")}` : "");
      entries.push(...(entries.length ? [{ separator: true as const }] : []), {
        icon: "doc-plus",
        label: "New page here…",
        run: () => this.openDraft(base === "/" ? "" : base),
      });
    }
    if (!entries.length) {
      return;
    }
    const spot = el("div", { class: cls("point-anchor") });
    spot.style.left = `${at.x}px`;
    spot.style.top = `${at.y}px`;
    this.element.append(spot);
    createMenu(entries).open(spot, "below", { onClose: () => spot.remove() });
  }

  /**
   * The new-page field, at the top of the list.
   *
   * Hands a prompt to the chat rather than sending it: making a page is a real
   * change to the site, and the composer is where the user reads it, adds to it
   * and decides to send.
   */
  private openDraft(prefix = ""): void {
    if (!this.hooks) {
      return;
    }
    if (this.draft) {
      this.draft.focus();
      return;
    }
    const input = el("input", {
      "aria-label": "New page path",
      class: cls("pg-draft-input"),
      placeholder: "/new-page",
      spellcheck: "false",
      type: "text",
      value: prefix ? `${prefix}/` : "/",
    }) as HTMLInputElement;
    const close = (): void => {
      this.draft = null;
      wrap.remove();
    };
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        close();
      } else if (e.key === "Enter") {
        const path = slugPath(input.value);
        // Nothing typed past the folder it started in.
        if (path === normalizePath(prefix || "/")) {
          return;
        }
        close();
        this.hooks?.askAgent(newPagePrompt(path));
      }
    });
    input.addEventListener("blur", () => {
      if (input.value.trim() === "/" || input.value === `${prefix}/`) {
        close();
      }
    });
    const wrap = el("div", { class: cls("pg-draft") }, [
      icon("doc-plus", "sm"),
      input,
    ]);
    this.draft = input;
    this.list.prepend(wrap);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

/** A 4xx or 5xx, or no answer at all. `undefined` is "not asked yet". */
function isBroken(code: number | null | undefined): boolean {
  return code === null || (code !== undefined && code >= 400);
}

/**
 * A frame's document, if it is a page of this site.
 *
 * Not every frame is: one not yet scrolled into view holds `about:blank`
 * (whose path reads `blank`), and one showing the browser's error page or an
 * external link is cross-origin, where even reading `location` throws.
 */
function sitePage(doc: Document | null): Document | null {
  try {
    return doc?.location.origin === window.location.origin ? doc : null;
  } catch {
    return null;
  }
}

/**
 * A row's keys: Enter and Space open it, Left and Right fold a folder, Up and
 * Down move between rows. True when the key was the row's.
 */
function rowKey(
  e: KeyboardEvent,
  activate: () => void,
  folder: RowSpec["folder"],
  row: HTMLElement
): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) {
    return false;
  }
  switch (e.key) {
    case "Enter":
    case " ":
      activate();
      return true;
    case "ArrowRight":
      if (folder && !folder.open) {
        folder.toggle(true);
      }
      return true;
    case "ArrowLeft":
      if (folder?.open) {
        folder.toggle(false);
      }
      return true;
    case "ArrowDown":
    case "ArrowUp": {
      const rows = Array.from(
        row.parentElement?.querySelectorAll<HTMLElement>("[data-key]") ?? []
      );
      const at = rows.indexOf(row) + (e.key === "ArrowDown" ? 1 : -1);
      rows[at]?.focus();
      return true;
    }
    default:
      return false;
  }
}

/** The prompt for a new page: short, and in the user's terms. */
export function newPagePrompt(path: string): string {
  return `Create a new page at ${path}. Match the layout, header, footer and style of the existing pages, and add a link to it where it belongs in the navigation.`;
}

/** The page on its own, through the editor's server, without the canvas. */
function pageUrl(path: string): string {
  const url = new URL(path, window.location.origin);
  url.searchParams.set(AIRSHIP_MODE_PARAM, "inline");
  return url.href;
}

function copyLink(path: string): void {
  const url = new URL(path, window.location.origin).href;
  navigator.clipboard?.writeText(url).then(
    () => toast("Link copied", { icon: "clipboard" }),
    () => toast("Could not copy", { tone: "error" })
  );
}
