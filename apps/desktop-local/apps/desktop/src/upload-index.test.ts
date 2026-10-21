import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { afterEach, expect, test } from "vitest";

const require = createRequire(import.meta.url);
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});
const git = (cwd: string, ...args: string[]) =>
  execFileSync("/usr/bin/git", args, { cwd, encoding: "utf8" });
function fixture(initial = true) {
  const cwd = mkdtempSync(join(tmpdir(), "weblab-upload-index-"));
  roots.push(cwd);
  git(cwd, "init", "-q");
  git(cwd, "config", "user.name", "Fixture");
  git(cwd, "config", "user.email", "fixture@example.test");
  if (initial) {
    for (const file of ["chosen.txt", "peer.txt", "old.txt"]) {
      writeFileSync(join(cwd, file), "before");
    }
    git(cwd, "add", ".");
    git(cwd, "commit", "-qm", "baseline");
  }
  const module = {
    exports: {} as {
      commitFiles: (
        cwd: string,
        paths: string[],
        note: string
      ) => Promise<{ ok: boolean }>;
    },
  };
  vm.runInNewContext(
    readFileSync(new URL("./upload.js", import.meta.url), "utf8") +
      "\nmodule.exports.commitFiles = commitFiles;",
    {
      module,
      process,
      require(name: string) {
        if (name === "./runtime") {
          return {
            childEnv: (extra: Record<string, string>) => ({
              ...process.env,
              ...extra,
            }),
          };
        }
        if (name === "./github") {
          return {};
        }
        if (name === "./sites") {
          return { checkVerifiedPath: () => undefined };
        }
        return require(name);
      },
    }
  );
  return { commit: module.exports.commitFiles, cwd };
}

test.each(["modified", "new"])(
  "keeps unrelated staged %s files and excludes them from the commit",
  async (kind) => {
    const { cwd, commit } = fixture();
    const peer = kind === "new" ? "new-peer.txt" : "peer.txt";
    writeFileSync(join(cwd, peer), "peer staged");
    git(cwd, "add", "--", peer);
    writeFileSync(join(cwd, peer), "peer unstaged");
    const entry = git(cwd, "ls-files", "--stage", "--", peer);
    writeFileSync(join(cwd, "chosen.txt"), "chosen edit");
    expect(await commit(cwd, ["chosen.txt"], "chosen only")).toEqual({
      ok: true,
    });
    expect(git(cwd, "ls-files", "--stage", "--", peer)).toBe(entry);
    expect(readFileSync(join(cwd, peer), "utf8")).toBe("peer unstaged");
    expect(
      git(
        cwd,
        "diff-tree",
        "--no-commit-id",
        "--name-only",
        "-r",
        "HEAD"
      ).trim()
    ).toBe("chosen.txt");
  }
);

test("commits selected additions, deletions and both rename sides", async () => {
  const { cwd, commit } = fixture();
  writeFileSync(join(cwd, "peer.txt"), "peer staged");
  git(cwd, "add", "--", "peer.txt");
  const peerIndex = git(cwd, "ls-files", "--stage", "--", "peer.txt");
  writeFileSync(join(cwd, "peer.txt"), "peer unstaged");
  writeFileSync(join(cwd, "new.txt"), "new");
  unlinkSync(join(cwd, "chosen.txt"));
  renameSync(join(cwd, "old.txt"), join(cwd, "renamed.txt"));
  expect(
    await commit(
      cwd,
      ["new.txt", "chosen.txt", "old.txt", "renamed.txt"],
      "selection"
    )
  ).toEqual({ ok: true });
  expect(git(cwd, "ls-tree", "--name-only", "HEAD").trim().split("\n")).toEqual(
    ["new.txt", "peer.txt", "renamed.txt"]
  );
  expect(git(cwd, "ls-files", "--stage", "--", "peer.txt")).toBe(peerIndex);
  expect(readFileSync(join(cwd, "peer.txt"), "utf8")).toBe("peer unstaged");
});

test("initial commit excludes unrelated staged additions", async () => {
  const { cwd, commit } = fixture(false);
  writeFileSync(join(cwd, "peer.txt"), "peer");
  git(cwd, "add", "peer.txt");
  writeFileSync(join(cwd, "chosen.txt"), "chosen");
  expect(await commit(cwd, ["chosen.txt"], "first")).toEqual({ ok: true });
  expect(git(cwd, "ls-tree", "--name-only", "HEAD").trim()).toBe("chosen.txt");
  expect(git(cwd, "diff", "--cached", "--name-only").trim()).toBe("peer.txt");
});

test("treats Git pathspec punctuation and option-like filenames literally", async () => {
  const { cwd, commit } = fixture();
  const selected = [
    "chosen[1].txt",
    "chosen*.txt",
    ":(glob)chosen*",
    "--chosen.txt",
  ];
  for (const name of selected) {
    writeFileSync(join(cwd, name), `selected ${name}`);
  }
  writeFileSync(join(cwd, "chosen1.txt"), "unselected wildcard sibling");
  writeFileSync(join(cwd, "peer.txt"), "peer staged");
  git(cwd, "add", "--", "peer.txt");
  const peerIndex = git(cwd, "ls-files", "--stage", "--", "peer.txt");
  writeFileSync(join(cwd, "peer.txt"), "peer unstaged");
  expect(await commit(cwd, selected, "literal selection")).toEqual({
    ok: true,
  });
  expect(
    git(cwd, "diff-tree", "--no-commit-id", "--name-only", "-z", "-r", "HEAD")
      .split("\0")
      .filter(Boolean)
      .sort()
  ).toEqual([...selected].sort());
  expect(git(cwd, "ls-files", "--stage", "--", "peer.txt")).toBe(peerIndex);
  expect(readFileSync(join(cwd, "peer.txt"), "utf8")).toBe("peer unstaged");
  expect(readFileSync(join(cwd, "chosen1.txt"), "utf8")).toBe(
    "unselected wildcard sibling"
  );
  expect(git(cwd, "status", "--porcelain", "--", "chosen1.txt").trim()).toBe(
    "?? chosen1.txt"
  );
});
