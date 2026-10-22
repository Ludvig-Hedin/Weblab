import { EventEmitter } from "node:events";
import { afterEach, expect, test, vi } from "vitest";

const spawn = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ spawn, spawnSync: vi.fn() }));
vi.mock("./detect", () => ({ isListening: () => Promise.resolve(true) }));

import { startDevServer } from "./exec";

afterEach(() => {
  vi.unstubAllEnvs();
  spawn.mockReset();
});

test.each([
  {
    expected: undefined,
    key: "fixture-desktop-key",
    marker: "1",
    name: "desktop-injected key",
  },
  {
    expected: "fixture-project-key",
    key: "fixture-project-key",
    marker: undefined,
    name: "project-owned key",
  },
  {
    expected: "fixture-project-key",
    key: "fixture-project-key",
    marker: "0",
    name: "inactive internal marker",
  },
  {
    expected: undefined,
    key: undefined,
    marker: undefined,
    name: "absent key",
  },
  {
    expected: undefined,
    key: undefined,
    marker: "1",
    name: "absent marked key",
  },
])(
  "project scripts receive the right environment for $name",
  async ({ expected, key, marker }) => {
    vi.stubEnv("ANTHROPIC_API_KEY", key);
    vi.stubEnv("PROJECT_SETTING", "keep");
    vi.stubEnv("WEBLAB_PREVIEW_STRIP_ANTHROPIC_KEY", marker);
    const child = Object.assign(new EventEmitter(), {
      exitCode: null,
      pid: undefined,
    });
    spawn.mockReturnValue(child);

    const preview = await startDevServer({
      command: "dev",
      cwd: "/site",
      port: 4100,
      quiet: true,
    });
    const childEnv = spawn.mock.calls[0][1].env;
    expect(childEnv.ANTHROPIC_API_KEY).toBe(expected);
    expect(childEnv.WEBLAB_PREVIEW_STRIP_ANTHROPIC_KEY).toBeUndefined();
    expect(childEnv.PROJECT_SETTING).toBe("keep");
    expect(process.env.ANTHROPIC_API_KEY).toBe(key);
    expect(process.env.WEBLAB_PREVIEW_STRIP_ANTHROPIC_KEY).toBe(marker);
    child.emit("exit", 0, null);
    await preview.stop();
  }
);
