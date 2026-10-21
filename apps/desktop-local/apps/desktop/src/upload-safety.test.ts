import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { expect, test } from "vitest";

const nodeRequire = createRequire(import.meta.url);
const source = readFileSync(new URL("./upload.js", import.meta.url), "utf8");

function harness(raw = "", gitAvailable = true) {
  const calls: string[][] = [];
  const module = { exports: {} as {
    parseStatus: (raw: string) => { files: { path: string; secret: boolean }[] };
    upload: (cwd: string, options: { paths: string[]; newBranch?: boolean }) => Promise<{ code?: string; ok: boolean }>;
  } };
  vm.runInNewContext(source, {
    module,
    process: { env: {} },
    require(name: string) {
      if (name === "./runtime") return { canUseGit: () => gitAvailable, childEnv: () => ({}) };
      if (name === "./github") return { readToken: () => "test", account: () => ({ login: "test" }), gitAuthEnv: () => ({}) };
      if (name === "node:child_process") return {
        execFile(_binary: string, args: string[], _opts: unknown, callback: (error: null, out: string, err: string) => void) {
          calls.push(args);
          const out = args[0] === "status" ? raw
            : args[0] === "rev-parse" ? "true\n"
            : args[0] === "remote" ? "https://github.com/test/site.git\n"
            : args[0] === "symbolic-ref" ? "origin/main\n" : "0\n";
          callback(null, out, "");
        },
      };
      return nodeRequire(name);
    },
  });
  return { api: module.exports, calls };
}

test.each([".env", "nested/.env.production", "key.pem", ".npmrc"])("refuses %s before invoking Git", async (path) => {
  const h = harness();
  expect(await h.api.upload("/site", { paths: [path], newBranch: true })).toMatchObject({ ok: false, code: "secret" });
  expect(h.calls).toEqual([]);
});

test("a secret renamed to an ordinary file is still excluded", async () => {
  const h = harness("# branch.head main\0" + "2 R. N... 100644 100644 100644 a b R100 public.txt\0.env\0");
  expect(h.api.parseStatus("2 R. N... 100644 100644 100644 a b R100 public.txt\0.env\0").files[0].secret).toBe(true);
  expect(await h.api.upload("/site", { paths: ["public.txt"], newBranch: true })).toMatchObject({ ok: false, code: "secret" });
  expect(h.calls.some((args) => ["checkout", "reset", "add", "commit", "push"].includes(args[0]))).toBe(false);
});

test("missing Git remains an ordinary refusal", async () => {
  const h = harness("", false);
  expect(await h.api.upload("/site", { paths: ["page.tsx"] })).toMatchObject({ ok: false, code: "no-remote" });
  expect(h.calls).toEqual([]);
});
