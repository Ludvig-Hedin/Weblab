import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { afterEach, expect, test, vi } from "vitest";

const nativeRequire = createRequire(import.meta.url);
const source = readFileSync(new URL("./deploy.js", import.meta.url), "utf8");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

interface ApiOptions {
  body?: { key: string; value: string; target: string[]; type: string }[];
  method?: string;
}

interface DeployApi {
  prepare: (
    cwd: string,
    site: object
  ) => Promise<{ ok: boolean; missingKeys: string[] }>;
  sendKeys: (
    cwd: string,
    names: string[]
  ) => Promise<{ ok: boolean; count: number }>;
  skipKeys: (cwd: string) => { ok: boolean };
}

function fixture(response: unknown) {
  const cwd = mkdtempSync(join(tmpdir(), "weblab-deploy-keys-"));
  roots.push(cwd);
  mkdirSync(join(cwd, ".vercel"));
  writeFileSync(
    join(cwd, ".vercel/project.json"),
    JSON.stringify({ orgId: "team", projectId: "project", projectName: "site" })
  );
  const setEnv = (text: string) => writeFileSync(join(cwd, ".env.local"), text);
  setEnv("EXISTING=local-value\n");
  const request = vi.fn(
    async (_root: string, _path: string, options?: ApiOptions) =>
      options?.method === "POST" ? { ok: true } : response
  );
  const checkVerifiedPath = vi.fn((root: string) => {
    if (root !== cwd) {
      throw new Error("Unverified site root.");
    }
  });
  const module = { exports: {} as DeployApi };
  vm.runInNewContext(`${source}\napi = mockApi;`, {
    mockApi: request,
    module,
    process,
    require: (name: string) => {
      if (name === "./sites") {
        return { checkVerifiedPath };
      }
      if (name === "electron" || name === "./runtime") {
        return {};
      }
      if (name === "./site-operation") {
        return {};
      }
      if (name === "node:child_process") {
        return {
          spawn: () => {
            throw new Error("These tests must never start a provider process.");
          },
        };
      }
      return nativeRequire(name);
    },
  });
  return { api: module.exports, checkVerifiedPath, cwd, request, setEnv };
}

test("rechecks a key added after an earlier preparation was skipped", async () => {
  const h = fixture({ data: { envs: [{ key: "EXISTING" }] }, ok: true });
  expect(await h.api.prepare(h.cwd, {})).toMatchObject({
    missingKeys: [],
    ok: true,
  });
  expect(h.api.skipKeys(h.cwd)).toEqual({ ok: true });
  h.setEnv("EXISTING=local-value\nADDED=new-value\n");
  expect(await h.api.prepare(h.cwd, {})).toMatchObject({
    missingKeys: ["ADDED"],
    ok: true,
  });
  expect(h.request).toHaveBeenCalledTimes(2);
  expect(h.checkVerifiedPath).toHaveBeenCalled();
});

const malformedResponses = [
  { ok: false },
  { data: {}, ok: true },
  { data: { envs: {} }, ok: true },
  { data: { envs: null }, ok: true },
  ...[null, "KEY", {}, { key: null }, { key: 123 }, { key: {} }].map(
    (entry) => ({ data: { envs: [{ key: "EXISTING" }, entry] }, ok: true })
  ),
];

test.each(malformedResponses)(
  "refuses preparation and writes when remote key settings are malformed (%j)",
  async (response) => {
    const h = fixture(response);
    await expect(h.api.prepare(h.cwd, {})).rejects.toThrow(
      "Vercel settings could not be checked."
    );
    await expect(h.api.sendKeys(h.cwd, ["EXISTING"])).rejects.toThrow(
      "Vercel settings could not be checked."
    );
    expect(h.request.mock.calls.every((call) => call[2] === undefined)).toBe(
      true
    );
  }
);

test("only creates missing permitted keys and preserves existing provider keys", async () => {
  const h = fixture({ data: { envs: [{ key: "EXISTING" }] }, ok: true });
  const reserved = [
    "VERCEL_TOKEN",
    "WEBLAB_TOKEN",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "CLAUDE_TOKEN",
    "GITHUB_TOKEN",
    "GH_TOKEN",
    "AWS_SECRET_ACCESS_KEY",
    "NODE_OPTIONS",
    "PATH",
    "HOME",
    "SANITY_API_WRITE_TOKEN",
  ];
  h.setEnv(
    [
      "EXISTING=changed-local-value",
      "ADDED=new-value",
      ...reserved.map((key) => `${key}=private`),
    ].join("\n")
  );
  expect(await h.api.prepare(h.cwd, {})).toMatchObject({
    missingKeys: ["ADDED"],
  });
  expect(
    await h.api.sendKeys(h.cwd, [
      "EXISTING",
      "ADDED",
      "ADDED",
      "ABSENT",
      ...reserved,
    ])
  ).toEqual({ count: 1, ok: true });
  const writes = h.request.mock.calls.filter(
    (call) => call[2]?.method === "POST"
  );
  expect(writes).toEqual([
    [
      h.cwd,
      "/v10/projects/project/env?teamId=team",
      {
        body: [
          {
            key: "ADDED",
            target: ["production", "preview"],
            type: "encrypted",
            value: "new-value",
          },
        ],
        method: "POST",
      },
    ],
  ]);
});

test("does not write when every requested key already exists remotely", async () => {
  const h = fixture({ data: { envs: [{ key: "EXISTING" }] }, ok: true });
  expect(await h.api.sendKeys(h.cwd, ["EXISTING", "EXISTING"])).toEqual({
    count: 0,
    ok: true,
  });
  expect(h.request).toHaveBeenCalledTimes(1);
  expect(h.request.mock.calls[0][2]).toBeUndefined();
});
