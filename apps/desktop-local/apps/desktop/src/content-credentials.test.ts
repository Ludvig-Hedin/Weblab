import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { afterEach, expect, test } from "vitest";

const requireNative = createRequire(import.meta.url);
const source = fs.readFileSync(
  new URL("./content-credentials.js", import.meta.url),
  "utf8"
);
const roots: string[] = [];
const identity = { dataset: "production", projectId: "project1" };
const original = "original-test-token-12345";
const replacement = "replacement-test-token-12345";
afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

function setup() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "weblab-credential-replace-")
  );
  roots.push(root);
  let failRename = false;
  let locked = false;
  const module = {
    exports: {} as {
      connect: (connection: object, token: string) => object;
      replace: (connection: object, token: string) => object;
      token: (connection: object) => string;
    },
  };
  vm.runInNewContext(source, {
    Buffer,
    module,
    require: (name: string) => {
      if (name === "electron") {
        return {
          app: { getPath: () => root },
          safeStorage: {
            decryptString: (value: Buffer) =>
              [...value.toString()].reverse().join(""),
            encryptString: (value: string) =>
              Buffer.from([...value].reverse().join("")),
            isEncryptionAvailable: () => !locked,
          },
        };
      }
      if (name === "node:fs") {
        return {
          ...fs,
          renameSync: (from: string, to: string) => {
            if (failRename) {
              throw new Error("Cannot replace file");
            }
            fs.renameSync(from, to);
          },
        };
      }
      return requireNative(name);
    },
  });
  const files = () => fs.readdirSync(path.join(root, "content-connections"));
  return {
    ...module.exports,
    fail: () => {
      failRename = true;
    },
    files,
    lock: () => {
      locked = true;
    },
    root,
  };
}

test("connect never overwrites; explicit replacement updates only encrypted storage", () => {
  const app = setup();
  app.connect(identity, original);
  expect(() => app.connect(identity, replacement)).toThrow("already connected");
  expect(app.token(identity)).toBe(original);
  expect(app.replace(identity, replacement)).toEqual({ ok: true });
  expect(app.token(identity)).toBe(replacement);
  expect(app.files()).toHaveLength(1);
  const file = path.join(app.root, "content-connections", app.files()[0]);
  const stored = fs.readFileSync(file, "utf8");
  expect(stored).not.toContain(original);
  expect(stored).not.toContain(replacement);
  expect(Object.keys(JSON.parse(stored))).toEqual(["encrypted"]);
  // biome-ignore lint/suspicious/noBitwiseOperators: inspect only Unix permission bits.
  expect(fs.statSync(file).mode & 0o777).toBe(0o600);
});

test("failed atomic replacement leaves original token and removes temporary file", () => {
  const app = setup();
  app.connect(identity, original);
  app.fail();
  expect(() => app.replace(identity, replacement)).toThrow("Cannot replace");
  expect(app.token(identity)).toBe(original);
  expect(app.files()).toHaveLength(1);
});

test("malformed tokens and locked encryption cannot replace saved credentials", () => {
  const app = setup();
  app.connect(identity, original);
  for (const token of [
    "short",
    "invalid token with spaces",
    "x".repeat(4097),
  ]) {
    expect(() => app.replace(identity, token)).toThrow("valid Sanity");
    expect(app.token(identity)).toBe(original);
  }
  app.lock();
  expect(() => app.replace(identity, replacement)).toThrow("Unlock");
  expect(app.files()).toHaveLength(1);
});

test("replacement cannot create a different project connection or follow a link", () => {
  const app = setup();
  app.connect(identity, original);
  expect(() =>
    app.replace({ ...identity, dataset: "other" }, replacement)
  ).toThrow("Connect this content project first");
  expect(app.files()).toHaveLength(1);
  const file = path.join(app.root, "content-connections", app.files()[0]);
  const target = path.join(app.root, "outside.json");
  fs.renameSync(file, target);
  fs.symlinkSync(target, file);
  expect(() => app.replace(identity, replacement)).toThrow(
    "Invalid content connection file"
  );
});
