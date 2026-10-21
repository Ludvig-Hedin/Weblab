import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { assertRuntimeTree, stageRuntime } from "./stage-runtime.mjs";

const fixtures: string[] = [];

afterEach(() => {
  for (const path of fixtures.splice(0)) {
    rmSync(path, { force: true, recursive: true });
  }
});

function write(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function pkg(path: string, name: string, data: object = {}) {
  write(
    join(path, "package.json"),
    JSON.stringify({ name, version: "1.0.0", ...data })
  );
  write(join(path, "dist/index.js"), `export default ${JSON.stringify(name)};`);
  return path;
}

function fixture(dependencies: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), "weblab-stage-test-"));
  fixtures.push(root);
  const entry = pkg(join(root, "cli"), "fixture-cli", {
    dependencies,
    devDependencies: { "build-only": "1" },
    scripts: { prepare: "must-not-run" },
  });
  return { destination: join(root, "staged"), entry, root };
}

test("stages built workspaces and installed production files without secrets or links", () => {
  const f = fixture({ "@example/workspace": "workspace:*" });
  const workspace = pkg(join(f.root, "workspace"), "@example/workspace");
  write(join(workspace, "src/private.ts"), "not a runtime file");
  write(join(workspace, ".env.local"), "DO_NOT_SHIP=1");
  write(join(f.entry, ".env"), "DO_NOT_SHIP=1");
  mkdirSync(join(f.entry, "node_modules/@example"), { recursive: true });
  symlinkSync(workspace, join(f.entry, "node_modules/@example/workspace"));
  pkg(join(f.entry, "node_modules/build-only"), "build-only");

  stageRuntime({ ...f, workspaceRoots: [f.entry, workspace] });

  const staged = join(f.destination, "node_modules/@example/workspace");
  expect(readdirSync(staged).sort()).toEqual(["dist", "package.json"]);
  expect(existsSync(join(f.destination, ".env"))).toBe(false);
  expect(existsSync(join(f.destination, "node_modules/build-only"))).toBe(
    false
  );
  const manifest = JSON.parse(
    readFileSync(join(f.destination, "package.json"), "utf8")
  );
  expect(manifest.devDependencies).toBeUndefined();
  expect(manifest.scripts).toBeUndefined();
  expect(() => assertRuntimeTree(f.destination)).not.toThrow();
});

test("keeps direct versions hoisted and conflicting transitive versions nested", () => {
  const f = fixture({ consumer: "1", shared: "2" });
  const consumer = pkg(join(f.entry, "node_modules/consumer"), "consumer", {
    dependencies: { shared: "1" },
  });
  pkg(join(f.entry, "node_modules/shared"), "shared", { version: "2.0.0" });
  pkg(join(consumer, "node_modules/shared"), "shared", { version: "1.0.0" });

  stageRuntime(f);

  const rootVersion = JSON.parse(
    readFileSync(
      join(f.destination, "node_modules/shared/package.json"),
      "utf8"
    )
  ).version;
  const nestedVersion = JSON.parse(
    readFileSync(
      join(
        f.destination,
        "node_modules/consumer/node_modules/shared/package.json"
      ),
      "utf8"
    )
  ).version;
  expect(rootVersion).toBe("2.0.0");
  expect(nestedVersion).toBe("1.0.0");
});

test("finishes cyclic production graphs without copying dependencies twice", () => {
  const f = fixture({ first: "1" });
  pkg(join(f.entry, "node_modules/first"), "first", {
    dependencies: { second: "1" },
  });
  pkg(join(f.entry, "node_modules/second"), "second", {
    dependencies: { first: "1" },
  });

  stageRuntime(f);

  expect(readdirSync(join(f.destination, "node_modules")).sort()).toEqual([
    "first",
    "second",
  ]);
  expect(
    existsSync(join(f.destination, "node_modules/second/node_modules"))
  ).toBe(false);
});

test("copies native optional binaries with executable permissions and runtime peers", () => {
  const f = fixture({ sdk: "1" });
  pkg(join(f.entry, "node_modules/sdk"), "sdk", {
    optionalDependencies: { absent: "1", foreign: "1", native: "1" },
    peerDependencies: { "optional-peer": "1", peer: "1" },
    peerDependenciesMeta: { "optional-peer": { optional: true } },
  });
  const native = pkg(join(f.entry, "node_modules/native"), "native", {
    cpu: ["arm64"],
    os: ["darwin"],
  });
  write(join(native, "cli"), "#!/bin/sh\nexit 0\n");
  chmodSync(join(native, "cli"), 0o755);
  pkg(join(f.entry, "node_modules/peer"), "peer");
  pkg(join(f.entry, "node_modules/foreign"), "foreign", { os: ["win32"] });

  stageRuntime({ ...f, arch: "arm64", platform: "darwin" });

  expect(
    statSync(join(f.destination, "node_modules/native/cli")).mode % 0o1000
  ).toBe(0o755);
  expect(
    existsSync(join(f.destination, "node_modules/peer/package.json"))
  ).toBe(true);
  expect(existsSync(join(f.destination, "node_modules/foreign"))).toBe(false);
});

test("fails clearly for missing required production dependencies", () => {
  const f = fixture({ missing: "1" });
  expect(() => stageRuntime(f)).toThrow(
    "Missing production dependency missing"
  );
});

test("refuses a package link to a file outside its installed package", () => {
  const f = fixture({ dependency: "1" });
  const dependency = pkg(
    join(f.entry, "node_modules/dependency"),
    "dependency"
  );
  write(join(f.root, "private.txt"), "private");
  symlinkSync(join(f.root, "private.txt"), join(dependency, "unexpected"));

  expect(() => stageRuntime(f)).toThrow("Package link leaves its folder");
});

test("dereferences internal file links and strips secret files from third-party packages", () => {
  const f = fixture({ dependency: "1" });
  const dependency = pkg(
    join(f.entry, "node_modules/dependency"),
    "dependency"
  );
  symlinkSync("dist/index.js", join(dependency, "entry.js"));
  write(join(dependency, ".env.production"), "private");
  write(join(dependency, ".npmrc"), "private");

  stageRuntime(f);

  const staged = join(f.destination, "node_modules/dependency");
  expect(readFileSync(join(staged, "entry.js"), "utf8")).toContain(
    "dependency"
  );
  expect(existsSync(join(staged, ".env.production"))).toBe(false);
  expect(existsSync(join(staged, ".npmrc"))).toBe(false);
  expect(() => assertRuntimeTree(f.destination)).not.toThrow();
});

test("never overwrites an existing runtime", () => {
  const f = fixture();
  write(join(f.destination, "keep.txt"), "keep");
  expect(() => stageRuntime(f)).toThrow("Runtime destination already exists");
  expect(readFileSync(join(f.destination, "keep.txt"), "utf8")).toBe("keep");
});
