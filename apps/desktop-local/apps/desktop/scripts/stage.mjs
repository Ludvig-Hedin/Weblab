// Stages everything the packaged app carries next to itself:
//   .runtime/cli  the built Airship CLI plus a flat, symlink-free production
//                 node_modules (Claude Agent SDK with its macOS binary, ws, ...)
//   .runtime/bun  a pinned, checksum-verified Bun for installs and `bun run dev`
//
// Set WEBLAB_SKIP_CLI_BUILD=1 to reuse the existing apps/cli/dist.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import {
  chmod,
  copyFile,
  mkdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DESKTOP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(DESKTOP, "../..");
const RUNTIME = join(DESKTOP, ".runtime");
const PNPM = ["corepack", ["pnpm@11.9.0"]];

const BUN_VERSION = "1.3.10";
const BUN_ASSET = "bun-darwin-aarch64";
// Published checksum: https://github.com/oven-sh/bun/releases/tag/bun-v1.3.10
const BUN_SHA256 =
  "82034e87c9d9b4398ea619aee2eed5d2a68c8157e9a6ae2d1052d84d533ccd8d";

// Weblab only drives Claude. Codex ships a 260 MB native binary we never run.
const PRUNE = [
  "@openai/codex",
  "@openai/codex-darwin-arm64",
  "@openai/codex-darwin-x64",
  ".bin",
];

function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, { stdio: "inherit", ...opts });
}

function assertNoSymlinks(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const info = lstatSync(path);
    if (info.isSymbolicLink()) {
      throw new Error(`Symlink in staged runtime: ${path}`);
    }
    if (info.isDirectory()) {
      assertNoSymlinks(path);
    }
  }
}

async function stageCli() {
  if (process.env.WEBLAB_SKIP_CLI_BUILD !== "1") {
    run(
      PNPM[0],
      [...PNPM[1], "turbo", "run", "build", "--filter=@airshiplabs/cli"],
      { cwd: REPO }
    );
  }
  if (!existsSync(join(REPO, "apps/cli/dist/index.js"))) {
    throw new Error("apps/cli/dist/index.js is missing. Build the CLI first.");
  }
  const staging = join(RUNTIME, ".cli-stage");
  await rm(staging, { force: true, recursive: true });
  run(
    PNPM[0],
    [
      ...PNPM[1],
      "--filter",
      "@airshiplabs/cli",
      "deploy",
      "--legacy",
      "--prod",
      "--config.node-linker=hoisted",
      staging,
    ],
    { cwd: REPO }
  );
  for (const entry of PRUNE) {
    // biome-ignore lint/performance/noAwaitInLoops: a handful of deletes, order irrelevant but kept simple
    await rm(join(staging, "node_modules", entry), {
      force: true,
      recursive: true,
    });
  }
  assertNoSymlinks(staging);
  const claude = join(
    staging,
    "node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude"
  );
  if (!existsSync(claude)) {
    throw new Error("The Claude binary is missing from the staged CLI.");
  }
  const pkg = JSON.parse(readFileSync(join(staging, "package.json"), "utf8"));
  const destination = join(RUNTIME, "cli");
  await rm(destination, { force: true, recursive: true });
  await rename(staging, destination);
  console.log(`[stage] CLI ${pkg.version} staged at ${destination}`);
}

async function stageBun() {
  const destination = join(RUNTIME, "bun");
  const binary = join(destination, "bun");
  if (existsSync(binary)) {
    const version = execFileSync(binary, ["--version"], {
      encoding: "utf8",
    }).trim();
    if (version === BUN_VERSION) {
      console.log(`[stage] Bun ${version} already staged`);
      return;
    }
  }
  const cache = join(RUNTIME, ".cache");
  await mkdir(cache, { recursive: true });
  const archive = join(cache, `${BUN_ASSET}-${BUN_VERSION}.zip`);
  if (!existsSync(archive)) {
    const url = `https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/${BUN_ASSET}.zip`;
    const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok) {
      throw new Error(`Could not download Bun: HTTP ${response.status}`);
    }
    await writeFile(
      `${archive}.part`,
      Buffer.from(await response.arrayBuffer())
    );
    await rename(`${archive}.part`, archive);
  }
  const hash = createHash("sha256").update(readFileSync(archive)).digest("hex");
  if (hash !== BUN_SHA256) {
    await rm(archive, { force: true });
    throw new Error("Bun archive did not match the published checksum.");
  }
  const extract = join(cache, "bun-extract");
  await rm(extract, { force: true, recursive: true });
  run("unzip", ["-q", archive, "-d", extract]);
  await rm(destination, { force: true, recursive: true });
  await mkdir(destination, { recursive: true });
  await copyFile(join(extract, BUN_ASSET, "bun"), binary);
  await chmod(binary, 0o755);
  await rm(extract, { force: true, recursive: true });
  const version = execFileSync(binary, ["--version"], {
    encoding: "utf8",
  }).trim();
  if (version !== BUN_VERSION) {
    throw new Error(`Staged Bun reported ${version}`);
  }
  console.log(`[stage] Bun ${version} staged at ${destination}`);
}

if (process.platform !== "darwin" || process.arch !== "arm64") {
  throw new Error("Weblab builds on Apple silicon macOS only.");
}
await mkdir(RUNTIME, { recursive: true });
await stageBun();
await stageCli();
