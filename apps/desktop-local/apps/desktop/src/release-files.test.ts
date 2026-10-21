import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import releaseFiles from "./release-files.js";

const { freezeSource, sourceHash } = releaseFiles;
const link = { orgId: "team_example", projectId: "prj_example" };
let root: string;
let repo: string;
const cleanups: (() => void)[] = [];

function git(args: string[], cwd = repo) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: path.join(root, "gitconfig"),
      GIT_CONFIG_NOSYSTEM: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function write(name: string, value: string | Buffer) {
  const file = path.join(repo, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "weblab-release-test-"));
  repo = path.join(root, "site");
  fs.mkdirSync(repo);
  fs.writeFileSync(path.join(root, "gitconfig"), "");
  git(["init", "-q", "-b", "main"]);
  git(["config", "user.name", "Snapshot Test"]);
  git(["config", "user.email", "snapshot@example.test"]);
  git(["config", "commit.gpgsign", "false"]);
  git(["config", "core.autocrlf", "false"]);
  write("package.json", '{"name":"snapshot-fixture"}');
  write("src/page.tsx", "export default 'Original';\n");
  git(["add", "-A"]);
  git(["commit", "-qm", "Fixture"]);
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
  fs.rmSync(root, { force: true, recursive: true });
});

test("fingerprints linked Git worktrees and freezes their own changed source", () => {
  const worktree = path.join(root, "worktree");
  git(["worktree", "add", "-q", "--detach", worktree, "HEAD"]);
  expect(fs.lstatSync(path.join(worktree, ".git")).isFile()).toBe(true);
  expect(sourceHash(worktree)).toBe(sourceHash(repo));
  fs.writeFileSync(path.join(worktree, "src/page.tsx"), "Worktree text");
  expect(sourceHash(worktree)).not.toBe(sourceHash(repo));
  const snapshot = freezeSource(worktree, link);
  cleanups.push(snapshot.cleanup);
  expect(
    fs.readFileSync(path.join(snapshot.directory, "src/page.tsx"), "utf8")
  ).toBe("Worktree text");
  expect(fs.existsSync(path.join(snapshot.directory, ".git"))).toBe(false);
});

test("tracked deletions change the fingerprint without resurrecting deleted files", () => {
  const before = sourceHash(repo);
  fs.unlinkSync(path.join(repo, "src/page.tsx"));
  const deleted = sourceHash(repo);
  expect(deleted).not.toBe(before);
  const snapshot = freezeSource(repo, link);
  cleanups.push(snapshot.cleanup);
  expect(fs.existsSync(path.join(snapshot.directory, "src/page.tsx"))).toBe(
    false
  );
  git(["rm", "--cached", "src/page.tsx"]);
  expect(sourceHash(repo)).toBe(deleted);
});

test("secret files and local drafts are excluded even when tracked", () => {
  const baseline = sourceHash(repo);
  const excluded = [
    ".env",
    ".env.production",
    "nested/.env.local",
    ".envrc",
    ".weblab/content/draft.json",
    ".airship/history.json",
    ".vercel/weblab-release.json",
    ".codex/auth.json",
    ".claude/settings.json",
    ".npmrc",
    "service.pem",
    "private.key",
  ];
  for (const name of excluded) {
    write(name, "not for release");
  }
  git(["add", "-f", ...excluded]);
  expect(sourceHash(repo)).toBe(baseline);
  const snapshot = freezeSource(repo, {
    ...link,
    projectName: "unused",
    token: "must not copy",
  });
  cleanups.push(snapshot.cleanup);
  for (const name of excluded) {
    expect(fs.existsSync(path.join(snapshot.directory, name))).toBe(false);
  }
  expect(
    JSON.parse(
      fs.readFileSync(
        path.join(snapshot.directory, ".vercel/project.json"),
        "utf8"
      )
    )
  ).toEqual(link);
});

test("untracked source is included, while ignored build output stays out", () => {
  write(".gitignore", "ignored/\n");
  const before = sourceHash(repo);
  write("ignored/output.js", "ignored output");
  expect(sourceHash(repo)).toBe(before);
  write("new-page.tsx", "new source");
  expect(sourceHash(repo)).not.toBe(before);
  const snapshot = freezeSource(repo, link);
  cleanups.push(snapshot.cleanup);
  expect(
    fs.readFileSync(path.join(snapshot.directory, "new-page.tsx"), "utf8")
  ).toBe("new source");
  expect(fs.existsSync(path.join(snapshot.directory, "ignored"))).toBe(false);
});

test("frozen binary bytes survive later edits and cleanup is idempotent", () => {
  const bytes = Buffer.from([0, 255, 10, 13, 128]);
  write("asset.bin", bytes);
  const snapshot = freezeSource(repo, link);
  cleanups.push(snapshot.cleanup);
  const frozenHash = snapshot.sourceHash;
  write("asset.bin", "Changed source");
  expect(sourceHash(repo)).not.toBe(frozenHash);
  expect(fs.readFileSync(path.join(snapshot.directory, "asset.bin"))).toEqual(
    bytes
  );
  snapshot.cleanup();
  snapshot.cleanup();
  expect(fs.existsSync(snapshot.directory)).toBe(false);
});

test("a dangling source link is refused instead of treated as a deletion", () => {
  if (process.platform === "win32") {
    return;
  }
  fs.symlinkSync(path.join(root, "missing"), path.join(repo, "dangling"));
  git(["add", "dangling"]);
  expect(() => sourceHash(repo)).toThrow("source link");
});

test("a parent link is refused even when its tracked child is missing", () => {
  const outside = path.join(root, "outside");
  fs.mkdirSync(outside);
  fs.rmSync(path.join(repo, "src"), { recursive: true });
  fs.symlinkSync(
    outside,
    path.join(repo, "src"),
    process.platform === "win32" ? "junction" : "dir"
  );
  expect(() => sourceHash(repo)).toThrow("source link");
});

test("hard-linked source cannot enter a release", () => {
  fs.linkSync(path.join(repo, "src/page.tsx"), path.join(root, "outside.tsx"));
  expect(() => sourceHash(repo)).toThrow("Unsupported source file");
});

test("private key contents in ordinary source files stop the release", () => {
  for (const type of [
    "RSA PRIVATE KEY",
    "EC PRIVATE KEY",
    "OPENSSH PRIVATE KEY",
    "ENCRYPTED PRIVATE KEY",
  ]) {
    write("accidental.txt", `-----BEGIN ${type}-----\nfixture only`);
    expect(() => sourceHash(repo)).toThrow("private key");
  }
});

test("oversized sparse files fail before their contents are read", () => {
  write("large.bin", "");
  fs.truncateSync(path.join(repo, "large.bin"), 100 * 1024 * 1024 + 1);
  expect(() => sourceHash(repo)).toThrow("too large");
});

test("source changes during freeze refuse the release and remove its temporary folder", () => {
  const { mkdtempSync } = fs;
  let created = "";
  vi.spyOn(fs, "mkdtempSync").mockImplementation((prefix, options) => {
    const directory = mkdtempSync(prefix, options) as string;
    if (String(prefix).includes("weblab-release-")) {
      created = directory;
      write("src/page.tsx", "A concurrent edit");
    }
    return directory;
  });
  expect(() => freezeSource(repo, link)).toThrow("source changed");
  expect(created).not.toBe("");
  expect(fs.existsSync(created)).toBe(false);
});

test("copy failure removes the incomplete snapshot and preserves source", () => {
  const { mkdtempSync, writeFileSync } = fs;
  let created = "";
  vi.spyOn(fs, "mkdtempSync").mockImplementation((prefix, options) => {
    const directory = mkdtempSync(prefix, options) as string;
    if (String(prefix).includes("weblab-release-")) {
      created = directory;
    }
    return directory;
  });
  vi.spyOn(fs, "writeFileSync").mockImplementation((file, value, options) => {
    if (
      String(file).includes("weblab-release-") &&
      String(file).endsWith("package.json")
    ) {
      throw new Error("Simulated disk failure");
    }
    return writeFileSync(file, value, options);
  });
  expect(() => freezeSource(repo, link)).toThrow("Simulated disk failure");
  expect(fs.existsSync(created)).toBe(false);
  expect(fs.readFileSync(path.join(repo, "src/page.tsx"), "utf8")).toBe(
    "export default 'Original';\n"
  );
});

test("invalid deployment link fails without copying source", () => {
  expect(() =>
    freezeSource(repo, { orgId: "team", projectId: "../other" })
  ).toThrow("valid project");
  expect(() => freezeSource(repo, { projectId: "prj_example" })).toThrow(
    "valid project"
  );
});
