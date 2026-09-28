import { describe, expect, it } from "vitest";
import { pageTree } from "./page-tree";
import {
  linkedPaths,
  newPagePrompt,
  normalizePath,
  slugPath,
  sortPages,
} from "./pages-panel";
import { readSitemap, titleFromDocument, titleFromLink } from "./site-pages";

describe("normalizePath", () => {
  it("treats a trailing slash as the same page", () => {
    expect(normalizePath("/about/")).toBe("/about");
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("")).toBe("/");
  });
});

describe("sortPages", () => {
  it("puts Home first and drops repeats", () => {
    expect(sortPages(["/work", "/", "/about", "/work"])).toEqual([
      "/",
      "/about",
      "/work",
    ]);
  });
});

describe("linkedPaths", () => {
  it("keeps same-site pages and skips files, framework internals and other sites", () => {
    document.body.innerHTML = `
      <a href="/pricing/">Pricing</a>
      <a href="/blog/post?x=1#top">Post</a>
      <a href="/logo.png">Logo</a>
      <a href="/_next/static/chunk">Chunk</a>
      <a href="https://example.org/elsewhere">Elsewhere</a>
    `;
    expect(linkedPaths(document)).toEqual(["/pricing", "/blog/post"]);
  });
});

describe("pageTree", () => {
  it("nests pages under folders and puts Home first", () => {
    const tree = pageTree(["/blog", "/", "/about/team", "/about"]);
    expect(tree.map((n) => [n.kind, n.name])).toEqual([
      ["home", "Home"],
      ["folder", "/about"],
      ["page", "/blog"],
    ]);
    // `/about` is a page and a folder at once, so it can still be opened.
    expect(tree[1].page).toBe(true);
    expect(tree[1].children.map((n) => n.name)).toEqual(["/team"]);
  });

  it("folds many sibling pages into one collection", () => {
    const posts = ["/a", "/b", "/c", "/d"].map((slug) => `/blog-posts${slug}`);
    const [folder] = pageTree(posts);
    expect(folder.kind).toBe("folder");
    expect(folder.page).toBe(false);
    const [collection] = folder.children;
    expect(collection.kind).toBe("collection");
    expect(collection.name).toBe("Blog posts");
    expect(collection.children).toHaveLength(4);
  });

  it("leaves a small section as plain pages", () => {
    const [folder] = pageTree(["/docs/intro", "/docs/setup", "/docs/api"]);
    expect(folder.children.map((n) => n.kind)).toEqual([
      "page",
      "page",
      "page",
    ]);
  });
});

describe("pageTree with the site's routes", () => {
  const routes = [
    { dynamic: false, pattern: "/about" },
    { dynamic: false, pattern: "/blog" },
    { dynamic: true, pattern: "/blog/*" },
  ];

  it("puts a dynamic route's pages in a collection, however few", () => {
    const tree = pageTree(["/", "/blog/first"], routes);
    const blog = tree.find((n) => n.path === "/blog");
    expect(blog?.kind).toBe("folder");
    expect(blog?.page).toBe(true);
    const [collection] = blog?.children ?? [];
    expect(collection.kind).toBe("collection");
    expect(collection.name).toBe("Blog");
    expect(collection.children.map((n) => n.path)).toEqual(["/blog/first"]);
  });

  it("lists a route nothing links to, and an empty collection", () => {
    const tree = pageTree(["/"], routes);
    expect(tree.map((n) => n.path)).toEqual(["/", "/about", "/blog"]);
    expect(tree[2].children[0].children).toEqual([]);
  });

  it("gives a page to the most specific pattern, not the catch-all", () => {
    const tree = pageTree(
      ["/blog/a/edit", "/blog/a/b"],
      [
        { dynamic: true, pattern: "/blog/**" },
        { dynamic: true, pattern: "/blog/*/edit" },
      ]
    );
    const [edit, rest] = tree[0].children;
    expect(edit.path).toBe("/blog/*/edit");
    expect(edit.children.map((n) => n.path)).toEqual(["/blog/a/edit"]);
    expect(rest.children.map((n) => n.path)).toEqual(["/blog/a/b"]);
  });

  it("does not guess collections once the routes are known", () => {
    const docs = ["/docs/a", "/docs/b", "/docs/c", "/docs/d"];
    const [folder] = pageTree(docs, routes).filter((n) => n.path === "/docs");
    expect(folder.children.every((n) => n.kind === "page")).toBe(true);
  });
});

describe("new pages", () => {
  it("turns what was typed into a path", () => {
    expect(slugPath("About Us")).toBe("/about-us");
    expect(slugPath("/blog//Hello World/")).toBe("/blog/hello-world");
  });

  it("names the path in the prompt", () => {
    expect(newPagePrompt("/pricing")).toContain("/pricing");
  });
});

describe("site-pages", () => {
  it("reads page paths and nested sitemaps, whatever the host", () => {
    const xml = `<?xml version="1.0"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example.com/blog/a</loc></url>
        <url><loc>https://example.com/</loc></url>
      </urlset>`;
    expect(readSitemap(xml).pages).toEqual(["/blog/a", "/"]);
    const index =
      "<sitemapindex><sitemap><loc>https://example.com/sitemap-0.xml</loc></sitemap></sitemapindex>";
    expect(readSitemap(index).nested).toEqual(["/sitemap-0.xml"]);
  });

  it("drops the site name from a title and ignores generic link text", () => {
    expect(titleFromDocument("About us | Acme")).toBe("About us");
    expect(titleFromLink("Read more")).toBe("");
    expect(titleFromLink("  Our  team ")).toBe("Our team");
  });
});
