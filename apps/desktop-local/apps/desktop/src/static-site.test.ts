import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import importHtml from "./import-html.js";
import staticSite from "./static-site.js";

const { createStaticSite } = staticSite;
const { copyLinkedFiles } = importHtml;

test("imports only linked local assets, leaving unrelated sibling files out", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "weblab-import-"));
  const source = path.join(root, "source");
  const destination = path.join(root, "copy");
  fs.mkdirSync(path.join(source, "assets"), { recursive: true });
  fs.writeFileSync(
    path.join(source, "sketch.html"),
    '<link href="style.css" rel="stylesheet"><img src="assets/logo.svg"><a href="invoice.pdf">open</a>'
  );
  fs.writeFileSync(
    path.join(source, "style.css"),
    'body { background: url("assets/bg.svg"); }'
  );
  fs.writeFileSync(path.join(source, "assets/logo.svg"), "<svg/>");
  fs.writeFileSync(path.join(source, "assets/bg.svg"), "<svg/>");
  fs.writeFileSync(path.join(source, "private.txt"), "do not copy");
  fs.writeFileSync(path.join(source, "invoice.pdf"), "do not copy");
  try {
    expect(copyLinkedFiles(path.join(source, "sketch.html"), destination)).toBe(
      "sketch.html"
    );
    expect(fs.existsSync(path.join(destination, "style.css"))).toBe(true);
    expect(fs.existsSync(path.join(destination, "assets/logo.svg"))).toBe(true);
    expect(fs.existsSync(path.join(destination, "assets/bg.svg"))).toBe(true);
    expect(fs.existsSync(path.join(destination, "private.txt"))).toBe(false);
    expect(fs.existsSync(path.join(destination, "invoice.pdf"))).toBe(false);
  } finally {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

test("serves a chosen HTML file and local assets without exposing parent files", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "weblab-html-"));
  const site = path.join(root, "site");
  fs.mkdirSync(site);
  fs.writeFileSync(
    path.join(site, "sketch.html"),
    '<link rel="stylesheet" href="style.css">'
  );
  fs.writeFileSync(path.join(site, "style.css"), "body { color: red; }");
  fs.writeFileSync(path.join(root, "private.txt"), "private");
  fs.mkdirSync(path.join(site, ".git"));
  fs.writeFileSync(path.join(site, ".git/config"), "private");
  fs.symlinkSync(path.join(root, "private.txt"), path.join(site, "secret.txt"));
  const server = createStaticSite(site, "sketch.html");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  const events = new AbortController();
  try {
    const page = await fetch(base);
    expect(page.headers.get("content-type")).toBe("text/html");
    expect(await page.text()).toContain("style.css");
    expect((await fetch(`${base}/__weblab_reload.js`)).status).toBe(200);
    const css = await fetch(`${base}/style.css`);
    expect(css.headers.get("content-type")).toBe("text/css");
    expect(await css.text()).toContain("color: red");
    expect((await fetch(`${base}/secret.txt`)).status).toBe(403);
    expect((await fetch(`${base}/.git/config`)).status).toBe(403);
    expect((await fetch(`${base}/%2e%2e/private.txt`)).status).not.toBe(200);
    expect(
      (await fetch(`${base}/__weblab_reload`, { signal: events.signal })).status
    ).toBe(200);
  } finally {
    await server.stopStaticSite();
    events.abort();
    fs.rmSync(root, { force: true, recursive: true });
  }
});
