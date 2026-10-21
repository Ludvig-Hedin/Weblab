import { EventEmitter } from "node:events";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const nativeRequire = createRequire(import.meta.url);
const source = fs.readFileSync(
  fileURLToPath(new URL("./runner.js", import.meta.url)),
  "utf8"
);
interface RunnerEvent {
  details?: string;
  message?: string;
  type: string;
}
interface Runner {
  open: (site: { path: string }) => Promise<void>;
  stop: () => Promise<void>;
}
class Child extends EventEmitter {
  pid = 123;
  exitCode: number | null = null;
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  exit(code: number) {
    this.exitCode = code;
    this.emit("exit", code, null);
  }
}
function harness() {
  const events: RunnerEvent[] = [];
  const children: Child[] = [];
  const requests: {
    reply: (status: number) => void;
    fail: (message: string) => void;
    signal: AbortSignal;
  }[] = [];
  const spawn = vi.fn(
    (
      _command: string,
      _args: string[],
      _options: { env: Record<string, string> }
    ) => {
      const child = new Child();
      children.push(child);
      return child;
    }
  );
  const stopTree = vi.fn(async (child: Child | null) => child?.exit(0));
  const stopGroups = vi.fn(async (_groups: Set<number>) => undefined);
  const modules: Record<string, unknown> = {
    "./auth": { readApiKey: () => null },
    "./procs": {
      snapshotTree: () => ({ groups: [123] }),
      stopGroups,
      stopTree,
    },
    "./runtime": {
      bunBinary: () => "bun",
      childEnv: (env: object) => env,
      cliEntry: () => "/cli.js",
    },
    "./static-site": {},
    "node:child_process": { spawn },
    "node:fs": { existsSync: () => true },
    "node:http": {
      get: (
        _url: string,
        { signal }: { signal: AbortSignal },
        respond: (response: { statusCode: number; resume: () => void }) => void
      ) => {
        const request = Object.assign(new EventEmitter(), {
          destroy: (error: Error) => request.emit("error", error),
          setTimeout: vi.fn(),
        });
        const cancel = () => request.emit("error", signal.reason);
        signal.addEventListener("abort", cancel, { once: true });
        requests.push({
          fail: (message) => request.emit("error", new Error(message)),
          reply: (status) => {
            signal.removeEventListener("abort", cancel);
            respond({ resume: vi.fn(), statusCode: status });
          },
          signal,
        });
        return request;
      },
    },
    "node:net": {
      createServer: () => ({
        close: (done: () => void) => done(),
        listen: (_options: object, done: () => void) => done(),
        once: vi.fn(),
      }),
    },
  };
  const module = {
    exports: {} as {
      SiteRunner: new (onEvent: (event: RunnerEvent) => void) => Runner;
    },
  };
  vm.runInNewContext(source, {
    AbortController,
    clearInterval,
    clearTimeout,
    module,
    process: { execPath: "/electron" },
    require: (name: string) => modules[name] ?? nativeRequire(name),
    setInterval,
    setTimeout,
  });
  const runner = new module.exports.SiteRunner((event) => events.push(event));
  const start = async () => {
    const opening = runner.open({ path: "/site" });
    await vi.advanceTimersByTimeAsync(0);
    return { child: children.at(-1) as Child, opening };
  };
  const proxyReady = async (child: Child) => {
    child.stdout.emit("data", '{"url":"http://localhost:4101"}\n');
    await vi.advanceTimersByTimeAsync(0);
  };
  return {
    events,
    proxyReady,
    requests,
    runner,
    spawn,
    start,
    stopGroups,
    stopTree,
  };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("proxy JSON stays pending until the target returns a successful page", async () => {
  const h = harness();
  const { child, opening } = await h.start();
  await h.proxyReady(child);
  expect(h.events.some((event) => event.type === "ready")).toBe(false);
  h.requests[0].reply(503);
  await vi.advanceTimersByTimeAsync(500);
  expect(h.events.some((event) => event.type === "ready")).toBe(false);
  h.requests[1].reply(200);
  await opening;
  expect(h.events.filter((event) => event.type === "ready")).toHaveLength(1);
  expect(h.spawn.mock.calls[0][2].env.WEBLAB_LOCAL_EDITING).toBe("1");
  await h.runner.stop();
  expect(vi.getTimerCount()).toBe(0);
});
test("a redirect is a valid site response", async () => {
  const h = harness();
  const { child, opening } = await h.start();
  await h.proxyReady(child);
  h.requests[0].reply(307);
  await opening;
  expect(h.events.at(-1)?.type).toBe("ready");
  await h.runner.stop();
});
test("an unreachable target times out with logs and stops the proxy tree", async () => {
  const h = harness();
  const { child, opening } = await h.start();
  child.stderr.emit("data", "Next failed: missing required setting\n");
  await h.proxyReady(child);
  h.requests[0].fail("socket hang up");
  await vi.advanceTimersByTimeAsync(120_000);
  await opening;
  const errors = h.events.filter((event) => event.type === "error");
  expect(errors).toHaveLength(1);
  expect(errors[0].message).toContain("Check the site log");
  expect(errors[0].details).toContain("missing required setting");
  expect(errors[0].details).toContain("socket hang up");
  expect(h.events.some((event) => event.type === "ready")).toBe(false);
  expect(h.stopTree).toHaveBeenCalledWith(child, 6000);
  expect(Array.from(h.stopGroups.mock.calls.at(-1)?.[0] ?? [])).toEqual([123]);
  expect(h.requests.at(-1)?.signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
test("a CLI that never emits its URL has a bounded startup", async () => {
  const h = harness();
  const { child, opening } = await h.start();
  child.stdout.emit("data", "startup diagnostic\n");
  await vi.advanceTimersByTimeAsync(120_000);
  await opening;
  expect(h.events.at(-1)?.type).toBe("error");
  expect(h.events.at(-1)?.details).toContain("startup diagnostic");
  expect(h.stopTree).toHaveBeenCalledWith(child, 6000);
  expect(vi.getTimerCount()).toBe(0);
});
test("stop cancels a probe without a stale ready or error event", async () => {
  const h = harness();
  const { child, opening } = await h.start();
  await h.proxyReady(child);
  await h.runner.stop();
  await opening;
  h.requests[0].reply(200);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(
    h.events.some((event) => ["ready", "error"].includes(event.type))
  ).toBe(false);
  expect(h.requests[0].signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
test("CLI exit during page readiness fails once and preserves its diagnostic", async () => {
  const h = harness();
  const { child, opening } = await h.start();
  await h.proxyReady(child);
  child.stderr.emit("data", "Build failed\n");
  child.exit(1);
  await opening;
  expect(h.events.filter((event) => event.type === "error")).toHaveLength(1);
  expect(h.events.at(-1)?.message).toContain("stopped before it loaded");
  expect(h.events.at(-1)?.details).toContain("Build failed");
  expect(h.requests[0].signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
test("a new opening cancels an earlier probe and only the new site becomes ready", async () => {
  const h = harness();
  const first = await h.start();
  await h.proxyReady(first.child);
  const second = await h.start();
  await h.proxyReady(second.child);
  h.requests[0].reply(200);
  h.requests[1].reply(200);
  await Promise.all([first.opening, second.opening]);
  expect(h.events.filter((event) => event.type === "ready")).toHaveLength(1);
  expect(h.events.some((event) => event.type === "error")).toBe(false);
  await h.runner.stop();
  expect(vi.getTimerCount()).toBe(0);
});
