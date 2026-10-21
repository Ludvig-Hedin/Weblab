import { EventEmitter } from "node:events";
import { afterEach, expect, test, vi } from "vitest";

const spawn = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ spawn, spawnSync: vi.fn() }));
vi.mock("./detect", () => ({ isListening: async () => true }));
import { startDevServer } from "./exec";

afterEach(() => {
  vi.unstubAllEnvs();
  spawn.mockReset();
});

test.each([true, false])("project preview only loses a Weblab-injected AI key: %s", async (injected) => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-only-key");
  vi.stubEnv("PROJECT_SETTING", "keep");
  vi.stubEnv("WEBLAB_PREVIEW_STRIP_ANTHROPIC_KEY", injected ? "1" : undefined);
  spawn.mockReturnValue(Object.assign(new EventEmitter(), { pid: undefined, exitCode: null }));
  const preview = await startDevServer({ command: "dev", cwd: "/site", port: 4100, quiet: true });
  const childEnv = spawn.mock.calls[0][1].env;
  expect(childEnv.ANTHROPIC_API_KEY).toBe(injected ? undefined : "test-only-key");
  expect(childEnv.WEBLAB_PREVIEW_STRIP_ANTHROPIC_KEY).toBeUndefined();
  expect(childEnv.PROJECT_SETTING).toBe("keep");
  expect(process.env.ANTHROPIC_API_KEY).toBe("test-only-key");
  spawn.mock.results[0].value.emit("exit", 0, null);
  await preview.stop();
});
