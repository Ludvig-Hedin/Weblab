import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";

const require = createRequire(import.meta.url);
const settings = require("./env-settings.js") as { save: (root: string, answers: Record<string, string>) => void };
const dirs: string[] = [];
function folder() {
  const dir = mkdtempSync(join(tmpdir(), "weblab-settings-"));
  dirs.push(dir);
  writeFileSync(join(dir, ".env.example"), "CLIENT_KEY=example\n");
  return dir;
}
afterEach(() => { vi.restoreAllMocks(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

test("settings merge keeps other values and saves a private complete file", () => {
  const dir = folder();
  writeFileSync(join(dir, ".env.local"), "# existing\nOTHER=keep\nCLIENT_KEY=old\n");
  settings.save(dir, { CLIENT_KEY: "test-value", UNLISTED: "ignored" });
  expect(readFileSync(join(dir, ".env.local"), "utf8")).toBe("# existing\nOTHER=keep\nCLIENT_KEY=test-value\n");
  expect(statSync(join(dir, ".env.local")).mode & 0o777).toBe(0o600);
  expect(readdirSync(dir).filter((name) => name.endsWith(".tmp"))).toEqual([]);
});

test.each([true, false])("settings refuse external symlinks, existing target: %s", (exists) => {
  const dir = folder();
  const outside = folder();
  const target = join(outside, "outside.txt");
  if (exists) writeFileSync(target, "keep outside\n");
  symlinkSync(target, join(dir, ".env.local"));
  expect(() => settings.save(dir, { CLIENT_KEY: "test-value" })).toThrow();
  expect(existsSync(target)).toBe(exists);
  if (exists) expect(readFileSync(target, "utf8")).toBe("keep outside\n");
});

test("settings refuse an unreadable file shape instead of replacing it", () => {
  const dir = folder();
  mkdirSync(join(dir, ".env.local"));
  expect(() => settings.save(dir, { CLIENT_KEY: "test-value" })).toThrow();
  expect(statSync(join(dir, ".env.local")).isDirectory()).toBe(true);
});

test("new settings can be saved without a previous file", () => {
  const dir = folder();
  settings.save(dir, { CLIENT_KEY: "test-value" });
  expect(readFileSync(join(dir, ".env.local"), "utf8")).toBe("CLIENT_KEY=test-value\n");
});

test.skipIf(process.platform === "win32")("settings refuse a named pipe without waiting for its writer", () => {
  const dir = folder();
  execFileSync("mkfifo", [join(dir, ".env.local")]);
  expect(() => settings.save(dir, { CLIENT_KEY: "test-value" })).toThrow("regular file");
});

test("a failed temporary write leaves the previous settings and no secret temp file", () => {
  const dir = folder();
  writeFileSync(join(dir, ".env.local"), "CLIENT_KEY=keep\n");
  vi.spyOn(fs, "writeFileSync").mockImplementationOnce(() => { throw new Error("disk full"); });
  expect(() => settings.save(dir, { CLIENT_KEY: "test-value" })).toThrow("disk full");
  expect(readFileSync(join(dir, ".env.local"), "utf8")).toBe("CLIENT_KEY=keep\n");
  expect(readdirSync(dir).filter((name) => name.endsWith(".tmp"))).toEqual([]);
});
