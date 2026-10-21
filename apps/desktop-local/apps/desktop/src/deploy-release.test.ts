import { EventEmitter } from "node:events";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { expect, test, vi } from "vitest";

const nativeRequire = createRequire(import.meta.url);
const source = fs.readFileSync(new URL("./deploy.js", import.meta.url), "utf8");
interface FlowConfig {
  provider: {
    build: (
      snapshot: { directory: string },
      production: boolean,
      id: string
    ) => Promise<{ id: string }>;
  };
  verify: () => void;
}
async function fixture() {
  let valid = true;
  let config: FlowConfig | undefined;
  const checked: string[] = [];
  const check = (cwd: string) => {
    checked.push(cwd);
    if (!valid || cwd !== "/site") {
      throw new Error("The site folder moved.");
    }
  };
  const spawn = vi.fn((_binary: string, args: string[]) => {
    const child = Object.assign(new EventEmitter(), {
      pid: 123,
      stderr: new EventEmitter(),
      stdin: Object.assign(new EventEmitter(), { end: vi.fn() }),
      stdout: new EventEmitter(),
    });
    queueMicrotask(() => {
      let output = "designer";
      if (args.includes("deploy")) {
        output = "https://snapshot.vercel.app";
      } else if (args.includes("api")) {
        output = JSON.stringify({ id: "built" });
      }
      child.stdout.emit("data", output);
      child.emit("close", 0);
    });
    return child;
  });
  const modules: Record<string, unknown> = {
    "./release-flow": {
      createReleaseFlow: (value: FlowConfig) => {
        config = value;
        return { state: () => ({}) };
      },
    },
    "./runtime": { bunBinary: () => "bun", childEnv: () => ({}) },
    "./sites": { checkVerifiedPath: check },
    electron: { shell: {} },
    "node:child_process": { spawn },
    "node:fs": {
      readFileSync: (file: string) =>
        file.endsWith("project.json")
          ? JSON.stringify({ orgId: "team", projectId: "prj" })
          : "{}",
    },
  };
  const module = {
    exports: {} as { status: (root: string) => Promise<unknown> },
  };
  vm.runInNewContext(source, {
    Buffer,
    clearTimeout,
    module,
    process: { env: { HOME: "/owner" } },
    require: (name: string) => modules[name] ?? nativeRequire(name),
    setTimeout,
    URL,
  });
  await module.exports.status("/site");
  if (!config) {
    throw new Error("Release adapter was not created.");
  }
  return {
    checked,
    config,
    move: () => {
      valid = false;
    },
    spawn,
  };
}

test("frozen build uses its artifact directory while checking the captured source", async () => {
  const h = await fixture();
  expect(
    await h.config.provider.build({ directory: "/frozen" }, false, "intent")
  ).toEqual({ id: "built" });
  expect(h.checked.every((path) => path === "/site")).toBe(true);
  expect(h.config.verify).toBeTypeOf("function");
});

test("a moved source refuses a frozen build before spawning a provider command", async () => {
  const h = await fixture();
  h.spawn.mockClear();
  h.move();
  await expect(
    h.config.provider.build({ directory: "/frozen" }, false, "intent")
  ).rejects.toThrow("folder moved");
  expect(h.spawn).not.toHaveBeenCalled();
  expect(h.config.verify).toThrow("folder moved");
});
