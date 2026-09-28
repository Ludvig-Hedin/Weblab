import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listSiteRoutes, PAGES_API_PATH } from "./pages";
import { createProxyServer, type ProxyDeps } from "./proxy";

let project: string;
let outside: string;

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "airship-pages-"));
}

beforeEach(() => {
  project = tmp();
  outside = tmp();
});

afterEach(() => {
  rmSync(project, { force: true, recursive: true });
  rmSync(outside, { force: true, recursive: true });
});

function put(rel: string, body = ""): void {
  const abs = join(project, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body);
}

function withDeps(deps: Record<string, string>): void {
  put("package.json", JSON.stringify({ dependencies: deps }));
}

function patterns(): string[] {
  return listSiteRoutes(project).routes.map((r) => r.pattern);
}

describe("listSiteRoutes", () => {
  it("reads the Next.js app router, minus groups, private, slots and intercepts", () => {
    withDeps({ next: "15.0.0" });
    put("app/page.tsx");
    put("app/(marketing)/about/page.tsx");
    put("app/blog/[slug]/page.tsx");
    put("app/docs/[[...path]]/page.mdx");
    put("app/shop/[...rest]/page.js");
    put("app/_components/page.tsx");
    put("app/@modal/login/page.tsx");
    put("app/feed/(.)photo/page.tsx");
    put("app/about/layout.tsx");
    put("app/node_modules/x/page.tsx");
    const result = listSiteRoutes(project);
    expect(result.framework).toBe("next");
    expect(result.routes.map((r) => r.pattern)).toEqual([
      "/",
      "/about",
      "/blog/*",
      "/docs",
      "/docs/**",
      "/shop/**",
    ]);
    expect(result.routes.find((r) => r.pattern === "/about")).toEqual({
      dynamic: false,
      file: "app/(marketing)/about/page.tsx",
      pattern: "/about",
    });
    expect(result.routes.find((r) => r.pattern === "/blog/*")?.dynamic).toBe(
      true
    );
  });

  it("reads the Next.js pages router under src/", () => {
    withDeps({ next: "14.0.0" });
    put("src/pages/index.tsx");
    put("src/pages/about.tsx");
    put("src/pages/blog/index.tsx");
    put("src/pages/blog/[slug].tsx");
    put("src/pages/_app.tsx");
    put("src/pages/_document.tsx");
    put("src/pages/404.tsx");
    put("src/pages/api/hello.ts");
    expect(patterns()).toEqual(["/", "/about", "/blog", "/blog/*"]);
  });

  it("reads Astro pages, skipping endpoints and underscored entries", () => {
    withDeps({ astro: "4.0.0" });
    put("src/pages/index.astro");
    put("src/pages/about.md");
    put("src/pages/blog/[slug].astro");
    put("src/pages/docs/[...path].mdx");
    put("src/pages/rss.xml.ts");
    put("src/pages/_draft.astro");
    put("src/pages/_parts/card.astro");
    expect(patterns()).toEqual(["/", "/about", "/blog/*", "/docs/**"]);
  });

  it("reads SvelteKit routes, minus groups", () => {
    put(
      "package.json",
      JSON.stringify({ devDependencies: { "@sveltejs/kit": "2.0.0" } })
    );
    put("src/routes/+page.svelte");
    put("src/routes/(app)/settings/+page.svelte");
    put("src/routes/blog/[slug]/+page.svelte");
    put("src/routes/[[lang]]/help/+page.svelte");
    put("src/routes/files/[...rest]/+page.svelte");
    put("src/routes/api/+server.ts");
    const result = listSiteRoutes(project);
    expect(result.framework).toBe("sveltekit");
    expect(result.routes.map((r) => r.pattern)).toEqual([
      "/",
      "/*/help",
      "/blog/*",
      "/files/**",
      "/settings",
    ]);
  });

  it("reads Nuxt pages, preferring app/pages", () => {
    withDeps({ nuxt: "4.0.0" });
    put("app/pages/index.vue");
    put("app/pages/users/[id].vue");
    put("app/pages/[...slug].vue");
    put("app/pages/[[opt]]/x.vue");
    put("pages/ignored.vue");
    expect(patterns()).toEqual(["/", "/**", "/*/x", "/users/*"]);
  });

  it("reads Remix flat routes", () => {
    withDeps({ "@remix-run/react": "2.0.0" });
    put("app/routes/_index.tsx");
    put("app/routes/about.tsx");
    put("app/routes/blog._index.tsx");
    put("app/routes/blog.$slug.tsx");
    put("app/routes/_auth.tsx");
    put("app/routes/_auth.login.tsx");
    put("app/routes/files.$.tsx");
    put("app/routes/posts_.$id.edit.tsx");
    put("app/routes/sitemap[.]xml.ts");
    put("app/routes/data.server.ts");
    put("app/routes/settings.profile/route.tsx");
    put("app/routes/settings.profile/form.tsx");
    const result = listSiteRoutes(project);
    expect(result.framework).toBe("remix");
    expect(result.routes.map((r) => r.pattern)).toEqual([
      "/",
      "/about",
      "/blog",
      "/blog/*",
      "/files/**",
      "/login",
      "/posts/*/edit",
      "/settings/profile",
      "/sitemap.xml",
    ]);
  });

  it("picks the framework from package.json over folders", () => {
    withDeps({ astro: "4.0.0" });
    put("app/page.tsx");
    put("src/pages/index.astro");
    expect(listSiteRoutes(project).framework).toBe("astro");
  });

  it("falls back to folders when package.json names none", () => {
    put("src/routes/+page.svelte");
    expect(listSiteRoutes(project).framework).toBe("sveltekit");
  });

  it("returns nothing for an unknown project", () => {
    put("index.html");
    expect(listSiteRoutes(project)).toEqual({ framework: null, routes: [] });
  });

  it("never follows a symlink out of the project", () => {
    withDeps({ next: "15.0.0" });
    put("app/page.tsx");
    mkdirSync(join(outside, "secret"), { recursive: true });
    writeFileSync(join(outside, "secret", "page.tsx"), "");
    symlinkSync(join(outside, "secret"), join(project, "app", "secret"));
    expect(patterns()).toEqual(["/"]);
  });

  it("refuses a route folder that is itself a symlink", () => {
    withDeps({ next: "15.0.0" });
    mkdirSync(join(outside, "app"));
    writeFileSync(join(outside, "app", "page.tsx"), "");
    symlinkSync(join(outside, "app"), join(project, "app"));
    expect(patterns()).toEqual([]);
  });
});

describe("pages API", () => {
  let server: http.Server;
  let port: number;

  async function start(projectRoot: string | undefined): Promise<void> {
    const deps: ProxyDeps = {
      allowedHosts: new Set(),
      defaultMode: "inline",
      onAirshipUpgrade: () => undefined,
      projectRoot,
      // Nothing listens here: a request that leaked to the dev server would 502.
      targetHost: "127.0.0.1",
      targetPort: 1,
      wsPath: "/__airship/ws",
    };
    server = createProxyServer(deps);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    ({ port } = server.address() as AddressInfo);
  }

  afterEach(async () => {
    await new Promise((r) => server.close(r));
  });

  function call(
    method = "GET"
  ): Promise<{ json: Record<string, unknown>; status: number }> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", method, path: PAGES_API_PATH, port },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            resolve({
              json: text ? JSON.parse(text) : {},
              status: res.statusCode ?? 0,
            });
          });
        }
      );
      req.on("error", reject);
      req.end();
    });
  }

  it("lists the routes over GET", async () => {
    withDeps({ next: "15.0.0" });
    put("app/page.tsx");
    await start(project);
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.json).toEqual({
      framework: "next",
      routes: [{ dynamic: false, file: "app/page.tsx", pattern: "/" }],
    });
  });

  it("refuses other methods with 405", async () => {
    await start(project);
    const res = await call("POST");
    expect(res.status).toBe(405);
    expect(res.json.error).toBeTypeOf("string");
  });

  it("answers 404 without a project root", async () => {
    await start(undefined);
    const res = await call();
    expect(res.status).toBe(404);
    expect(res.json.error).toBeTypeOf("string");
  });
});
