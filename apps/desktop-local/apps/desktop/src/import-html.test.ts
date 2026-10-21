import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
const { copyLinkedFiles } = createRequire(import.meta.url)("./import-html.js") as { copyLinkedFiles: (source: string, destination: string) => string };
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() { const root = mkdtempSync(join(tmpdir(), "weblab-html-import-")); roots.push(root); const source = join(root, "source"); const dest = join(root, "dest"); mkdirSync(source); mkdirSync(dest); return { root, source, dest }; }

test("copies linked HTML pages, nested assets and handles cycles", () => {
  const { source, dest } = fixture(); mkdirSync(join(source, "pages"));
  writeFileSync(join(source, "index.html"), '<a href="pages/about.html?x=1">About</a>');
  writeFileSync(join(source, "pages/about.html"), '<a href="../index.html">Home</a><img src="photo.png">');
  writeFileSync(join(source, "pages/photo.png"), "asset");
  expect(copyLinkedFiles(join(source, "index.html"), dest)).toBe("index.html");
  expect(readFileSync(join(dest, "pages/photo.png"), "utf8")).toBe("asset");
  expect(existsSync(join(dest, "pages/about.html"))).toBe(true);
});

test.each(["external", "hidden"])("does not follow a %s ancestor directory link", (kind) => {
  const { root, source, dest } = fixture(); const target = kind === "external" ? join(root, "outside") : join(source, ".hidden"); mkdirSync(target);
  writeFileSync(join(target, "private.html"), "private"); symlinkSync(target, join(source, "alias"));
  writeFileSync(join(source, "index.html"), '<a href="alias/private.html">Link</a>');
  copyLinkedFiles(join(source, "index.html"), dest);
  expect(existsSync(join(dest, "alias/private.html"))).toBe(false);
});

test("ignores dangling links and encoded traversal", () => {
  const { root, source, dest } = fixture(); writeFileSync(join(root, "outside.html"), "outside"); symlinkSync(join(source, "missing.html"), join(source, "dead.html"));
  writeFileSync(join(source, "index.html"), '<a href="dead.html">Dead</a><a href="%2e%2e/outside.html">Outside</a>');
  copyLinkedFiles(join(source, "index.html"), dest);
  expect(existsSync(join(dest, "dead.html"))).toBe(false); expect(existsSync(join(dest, "outside.html"))).toBe(false);
});
