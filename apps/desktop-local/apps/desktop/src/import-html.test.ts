import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";

const { copyLinkedFiles } = createRequire(import.meta.url)(
  "./import-html.js"
) as {
  copyLinkedFiles: (source: string, destination: string) => string;
};
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "weblab-html-import-"));
  roots.push(root);
  const source = path.join(root, "source");
  const destination = path.join(root, "destination");
  fs.mkdirSync(source);
  fs.mkdirSync(destination);
  return { destination, root, source };
}

test("copies linked HTML pages, nested assets and handles cycles", () => {
  const { destination, source } = fixture();
  fs.mkdirSync(path.join(source, "pages"));
  fs.writeFileSync(
    path.join(source, "index.html"),
    '<a href="pages/about.html?x=1">About</a>'
  );
  fs.writeFileSync(
    path.join(source, "pages/about.html"),
    '<a href="../index.html">Home</a><img src="photo.png">'
  );
  fs.writeFileSync(path.join(source, "pages/photo.png"), "asset");
  expect(copyLinkedFiles(path.join(source, "index.html"), destination)).toBe(
    "index.html"
  );
  expect(
    fs.readFileSync(path.join(destination, "pages/photo.png"), "utf8")
  ).toBe("asset");
  expect(fs.existsSync(path.join(destination, "pages/about.html"))).toBe(true);
});

test.each(["external", "hidden"])(
  "does not follow a %s ancestor directory link",
  (kind) => {
    const { destination, root, source } = fixture();
    const target =
      kind === "external"
        ? path.join(root, "outside")
        : path.join(source, ".hidden");
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, "private.html"), "private");
    fs.symlinkSync(target, path.join(source, "alias"), "dir");
    fs.writeFileSync(
      path.join(source, "index.html"),
      '<a href="alias/private.html">Link</a>'
    );
    copyLinkedFiles(path.join(source, "index.html"), destination);
    expect(fs.existsSync(path.join(destination, "alias/private.html"))).toBe(
      false
    );
  }
);

test("ignores dangling links and encoded traversal", () => {
  const { destination, root, source } = fixture();
  fs.writeFileSync(path.join(root, "outside.html"), "outside");
  fs.symlinkSync(
    path.join(source, "missing.html"),
    path.join(source, "dead.html")
  );
  fs.writeFileSync(
    path.join(source, "index.html"),
    '<a href="dead.html">Dead</a><a href="%2e%2e/outside.html">Outside</a>'
  );
  copyLinkedFiles(path.join(source, "index.html"), destination);
  expect(fs.existsSync(path.join(destination, "dead.html"))).toBe(false);
  expect(fs.existsSync(path.join(destination, "outside.html"))).toBe(false);
});

test("refuses a chosen source file that is a symbolic link", () => {
  const { destination, root, source } = fixture();
  const target = path.join(root, "original.html");
  fs.writeFileSync(target, "keep outside");
  fs.symlinkSync(target, path.join(source, "index.html"));
  expect(() =>
    copyLinkedFiles(path.join(source, "index.html"), destination)
  ).toThrow("regular HTML file");
  expect(fs.readdirSync(destination)).toEqual([]);
  expect(fs.readFileSync(target, "utf8")).toBe("keep outside");
});

test("canonicalizes a chosen source parent before resolving linked assets", () => {
  const { destination, root, source } = fixture();
  fs.writeFileSync(path.join(source, "index.html"), '<img src="photo.png">');
  fs.writeFileSync(path.join(source, "photo.png"), "asset");
  const alias = path.join(root, "source-alias");
  fs.symlinkSync(source, alias, "dir");
  expect(copyLinkedFiles(path.join(alias, "index.html"), destination)).toBe(
    "index.html"
  );
  expect(fs.readFileSync(path.join(destination, "photo.png"), "utf8")).toBe(
    "asset"
  );
});
