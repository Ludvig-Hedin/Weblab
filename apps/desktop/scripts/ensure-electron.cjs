"use strict";
// pnpm blocks Electron's postinstall unless the workspace allows it, which
// leaves the package without its binary. Run the download once if needed.
const { existsSync } = require("node:fs");
const { dirname, join } = require("node:path");
const { execFileSync } = require("node:child_process");

const pkgDir = dirname(require.resolve("electron/package.json"));
if (!existsSync(join(pkgDir, "path.txt"))) {
  console.log("[weblab] Downloading Electron…");
  execFileSync(process.execPath, [join(pkgDir, "install.js")], {
    cwd: pkgDir,
    stdio: "inherit",
  });
}
