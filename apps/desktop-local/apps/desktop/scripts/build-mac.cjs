"use strict";
// Runs electron-builder for macOS arm64. Unsigned by default so a local build
// works without a certificate; set CSC_LINK (or CSC_NAME) and
// CSC_IDENTITY_AUTO_DISCOVERY=true to sign, plus Apple credentials to notarize.
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

const env = { ...process.env };
if (
  env.CSC_IDENTITY_AUTO_DISCOVERY === undefined &&
  !env.CSC_LINK &&
  !env.CSC_NAME
) {
  env.CSC_IDENTITY_AUTO_DISCOVERY = "false";
}
const bin = join(__dirname, "../node_modules/.bin/electron-builder");
const result = spawnSync(
  bin,
  ["--mac", "--arm64", "--publish", "never", ...process.argv.slice(2)],
  {
    cwd: join(__dirname, ".."),
    env,
    stdio: "inherit",
  }
);
process.exit(result.status ?? 1);
