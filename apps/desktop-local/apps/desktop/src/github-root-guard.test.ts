import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { afterEach, expect, test } from "vitest";

const source = fs.readFileSync(new URL("./github.js", import.meta.url), "utf8");
const roots: string[] = [];
const pull = {
  base: "main",
  head: "work",
  name: "site",
  owner: "example",
  title: "Changes",
};
const repo = {
  clone_url: "https://github.com/example/site.git",
  full_name: "example/site",
  html_url: "https://github.com/example/site",
};
interface Response {
  json: () => Promise<unknown>;
  ok: boolean;
  status: number;
}
interface Result {
  code?: string;
  ok: boolean;
}
interface GitHub {
  createRepo: (name: string, verify?: () => void) => Promise<Result>;
  openPullRequest: (input: typeof pull, verify?: () => void) => Promise<Result>;
}
function gate() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function response(status = 200, value: unknown = repo): Response {
  return { json: async () => value, ok: status >= 200 && status < 300, status };
}
function setup(fetchReply: (index: number) => Promise<Response>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "weblab-github-root-"));
  roots.push(root);
  const identity = fs.statSync(root, { bigint: true });
  const calls: { url: string; method: string }[] = [];
  let tokenReads = 0;
  const module = { exports: {} };
  vm.runInNewContext(source, {
    Buffer,
    fetch: (url: string, options: { method?: string }) => {
      calls.push({ method: options.method || "GET", url });
      return fetchReply(calls.length);
    },
    module,
    require: (name: string) => {
      if (name === "node:path") {
        return path;
      }
      // This fixture never opens a token file or a network connection.
      if (name === "node:fs") {
        return { readFileSync: () => Buffer.from("encrypted fixture") };
      }
      if (name === "electron") {
        return {
          app: { getPath: () => "/unused-github-fixture" },
          safeStorage: {
            decryptString: () => {
              tokenReads += 1;
              return "fixture-token";
            },
            isEncryptionAvailable: () => true,
          },
        };
      }
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  const verify = () => {
    let current: fs.BigIntStats;
    try {
      current = fs.statSync(root, { bigint: true });
    } catch (cause) {
      throw Object.assign(new Error("Source folder changed", { cause }), {
        code: "source-unavailable",
      });
    }
    if (
      current.dev !== identity.dev ||
      current.ino !== identity.ino ||
      current.birthtimeNs !== identity.birthtimeNs
    ) {
      throw Object.assign(new Error("Source folder changed"), {
        code: "source-unavailable",
      });
    }
  };
  return {
    api: module.exports as GitHub,
    calls,
    move: (replace = true) => {
      const moved = `${root}-moved`;
      fs.renameSync(root, moved);
      roots.push(moved);
      if (replace) {
        fs.mkdirSync(root);
      }
    },
    tokenReads: () => tokenReads,
    verify,
  };
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

for (const replace of [false, true]) {
  test(`a 422 response cannot retry after root ${replace ? "replacement" : "move"}`, async () => {
    const entered = gate();
    const waiting = gate();
    const app = setup(async () => {
      entered.resolve();
      await waiting.promise;
      return response(422);
    });
    const creating = app.api.createRepo("site", app.verify);
    await entered.promise;
    app.move(replace);
    waiting.resolve();
    await expect(creating).rejects.toMatchObject({
      code: "source-unavailable",
    });
    expect(app.calls).toHaveLength(1);
  });
}

for (const operation of ["createRepo", "openPullRequest"] as const) {
  test(`${operation} refuses an invalid entry before token reads or requests`, async () => {
    const app = setup(async () => response());
    app.move();
    const result =
      operation === "createRepo"
        ? app.api.createRepo("site", app.verify)
        : app.api.openPullRequest(pull, app.verify);
    await expect(result).rejects.toMatchObject({ code: "source-unavailable" });
    expect(app.tokenReads()).toBe(0);
    expect(app.calls).toHaveLength(0);
  });
  for (const boundary of ["response", "json", "rejection"] as const) {
    test(`${operation} preserves root refusal during a delayed ${boundary}`, async () => {
      const entered = gate();
      const waiting = gate();
      const app = setup(async () => {
        const value =
          operation === "createRepo"
            ? repo
            : { html_url: "https://github.com/example/site/pull/1" };
        if (boundary === "json") {
          return {
            ...response(),
            json: async () => {
              entered.resolve();
              await waiting.promise;
              return value;
            },
          };
        }
        entered.resolve();
        await waiting.promise;
        if (boundary === "rejection") {
          throw new Error("Offline");
        }
        return response(200, value);
      });
      const result =
        operation === "createRepo"
          ? app.api.createRepo("site", app.verify)
          : app.api.openPullRequest(pull, app.verify);
      await entered.promise;
      app.move();
      waiting.resolve();
      await expect(result).rejects.toMatchObject({
        code: "source-unavailable",
      });
      expect(app.calls).toHaveLength(1);
    });
  }
}

for (const boundary of [
  "post",
  "fallback-response",
  "fallback-json",
] as const) {
  test(`open pull request stops at ${boundary} when the root changes`, async () => {
    const entered = gate();
    const waiting = gate();
    const app = setup(async (index) => {
      if (
        boundary === "post" ||
        (index === 2 && boundary === "fallback-response")
      ) {
        entered.resolve();
        await waiting.promise;
        return response(boundary === "post" ? 422 : 200, []);
      }
      if (index === 1) {
        return response(422);
      }
      return {
        ...response(),
        json: async () => {
          entered.resolve();
          await waiting.promise;
          return [{ html_url: "https://github.com/example/site/pull/1" }];
        },
      };
    });
    const opening = app.api.openPullRequest(pull, app.verify);
    await entered.promise;
    app.move();
    waiting.resolve();
    await expect(opening).rejects.toMatchObject({ code: "source-unavailable" });
    expect(app.calls).toHaveLength(boundary === "post" ? 1 : 2);
    if (boundary !== "post") {
      expect(app.calls[1].method).toBe("GET");
    }
  });
}

test("existing callers can still retry a taken name without a verify callback", async () => {
  const app = setup(async (index) => response(index === 1 ? 422 : 200));
  expect((await app.api.createRepo("site")).ok).toBe(true);
  expect(app.calls).toHaveLength(2);
});

test("ordinary network failures retain the existing offline result", async () => {
  const app = setup(() => Promise.reject(new Error("Offline")));
  expect(await app.api.createRepo("site", app.verify)).toMatchObject({
    code: "offline",
    ok: false,
  });
  expect(await app.api.openPullRequest(pull, app.verify)).toMatchObject({
    code: "offline",
    ok: false,
  });
});
