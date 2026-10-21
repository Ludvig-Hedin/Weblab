import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { afterEach, expect, test } from "vitest";
const require = createRequire(import.meta.url); const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture(response: unknown) {
  const cwd = mkdtempSync(join(tmpdir(), "weblab-deploy-keys-")); roots.push(cwd); mkdirSync(join(cwd, ".vercel"));
  writeFileSync(join(cwd, ".vercel/project.json"), JSON.stringify({ projectId: "test", orgId: "test", projectName: "test" }));
  writeFileSync(join(cwd, ".vercel/weblab.json"), JSON.stringify({ keysAsked: true }));
  writeFileSync(join(cwd, ".env.local"), "EXISTING=test\nADDED=test\n");
  const module = { exports: {} as { prepare: (cwd: string, site: object) => Promise<{ ok: boolean; missingKeys?: string[] }> } };
  vm.runInNewContext(readFileSync(new URL("./deploy.js", import.meta.url), "utf8") + "\napi = async () => apiResponse;", {
    module, process, apiResponse: response,
    require(name: string) { if (name === "electron" || name === "./runtime") return {}; return require(name); },
  });
  return { cwd, api: module.exports };
}

test("checks new missing keys even after a previous prompt was skipped", async () => {
  const { cwd, api } = fixture({ ok: true, data: { envs: [{ key: "EXISTING" }] } });
  expect(await api.prepare(cwd, {})).toMatchObject({ ok: true, missingKeys: ["ADDED"] });
});

test.each([{ ok: false }, { ok: true, data: {} }, { ok: true, data: { envs: [null] } }])("refuses preparation when remote keys cannot be verified (%j)", async (response) => {
  const { cwd, api } = fixture(response);
  expect(await api.prepare(cwd, {})).toMatchObject({ ok: false });
});
