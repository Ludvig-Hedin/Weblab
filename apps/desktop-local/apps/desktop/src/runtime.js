// biome-ignore-all lint/correctness/noGlobalDirnameFilename: Electron loads this file as CommonJS, where import.meta does not exist.
// Where the bundled pieces live, and the environment every child process gets.
// Packaged: everything sits in Contents/Resources. Unpackaged (`pnpm dev`):
// the repo's built CLI and its pnpm node_modules, plus the staged Bun.

const { app } = require("electron");
const {
  existsSync,
  mkdirSync,
  writeFileSync,
  chmodSync,
  realpathSync,
} = require("node:fs");
const { dirname, join, resolve } = require("node:path");
const { execFileSync } = require("node:child_process");

const DESKTOP_ROOT = resolve(__dirname, "..");
const REPO_ROOT = resolve(DESKTOP_ROOT, "../..");
const SYSTEM_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";

function resourcesRoot() {
  return app.isPackaged ? process.resourcesPath : null;
}

function cliEntry() {
  const root = resourcesRoot();
  return root
    ? join(root, "cli/dist/index.js")
    : join(REPO_ROOT, "apps/cli/dist/index.js");
}

function templateDir() {
  const root = resourcesRoot();
  return root ? join(root, "template") : join(DESKTOP_ROOT, "template");
}

function bunBinary() {
  const root = resourcesRoot();
  if (root) {
    return join(root, "bun/bun");
  }
  const staged = join(DESKTOP_ROOT, ".runtime/bun/bun");
  if (existsSync(staged)) {
    return staged;
  }
  for (const candidate of [
    "/opt/homebrew/bin/bun",
    join(process.env.HOME || "", ".bun/bin/bun"),
  ]) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return staged;
}

let claudeCache;
/** The Claude Code binary that ships inside the Agent SDK's platform package. */
function claudeBinary() {
  if (claudeCache) {
    return claudeCache;
  }
  const root = resourcesRoot();
  if (root) {
    claudeCache = join(
      root,
      "cli/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude"
    );
    return claudeCache;
  }
  // pnpm keeps the platform package next to the SDK in its virtual store.
  const sdk = realpathSync(
    join(REPO_ROOT, "apps/cli/node_modules/@anthropic-ai/claude-agent-sdk")
  );
  const platformPkg = join(
    dirname(sdk),
    "claude-agent-sdk-darwin-arm64",
    "package.json"
  );
  claudeCache = join(dirname(platformPkg), "claude");
  return claudeCache;
}

let shimDir;
/**
 * A `node` on PATH that is really Electron in Node mode. Next's bin starts
 * with `#!/usr/bin/env node`, and designers have no Node installed.
 */
function nodeShimDir() {
  if (shimDir) {
    return shimDir;
  }
  shimDir = join(app.getPath("userData"), "bin");
  mkdirSync(shimDir, { recursive: true });
  const script = `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${process.execPath}" "$@"\n`;
  const target = join(shimDir, "node");
  writeFileSync(target, script);
  chmodSync(target, 0o755);
  return shimDir;
}

/** Environment for everything Weblab starts. Never inherits the user's PATH. */
function childEnv(extra = {}) {
  const env = {
    BUN_INSTALL_CACHE_DIR: join(app.getPath("userData"), "bun-cache"),
    DO_NOT_TRACK: "1",
    FORCE_COLOR: "0",
    HOME: process.env.HOME || app.getPath("home"),
    LANG: process.env.LANG || "en_US.UTF-8",
    LOGNAME: process.env.LOGNAME || process.env.USER || "",
    NEXT_TELEMETRY_DISABLED: "1",
    NO_COLOR: "1",
    PATH: [nodeShimDir(), dirname(bunBinary()), SYSTEM_PATH].join(":"),
    SHELL: "/bin/sh",
    TMPDIR: process.env.TMPDIR || app.getPath("temp"),
    USER: process.env.USER || "",
    ...extra,
  };
  return env;
}

let gitUsable;
/** True only when git runs without triggering Apple's developer tools prompt. */
function canUseGit() {
  if (gitUsable !== undefined) {
    return gitUsable;
  }
  try {
    execFileSync("/usr/bin/xcode-select", ["-p"], {
      stdio: "ignore",
      timeout: 5000,
    });
    execFileSync("/usr/bin/git", ["--version"], {
      stdio: "ignore",
      timeout: 10_000,
    });
    gitUsable = true;
  } catch {
    gitUsable = false;
  }
  return gitUsable;
}

module.exports = {
  bunBinary,
  canUseGit,
  childEnv,
  claudeBinary,
  cliEntry,
  DESKTOP_ROOT,
  templateDir,
};
