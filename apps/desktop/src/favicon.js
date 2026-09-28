// Read a site's own icon for the dashboard. Only local image files are used.
const fs = require("node:fs");
const { join } = require("node:path");

const MAX_BYTES = 256 * 1024;
const ICONS = [
  ["public/favicon.ico", "image/x-icon"],
  ["public/favicon.png", "image/png"],
  ["public/favicon.svg", "image/svg+xml"],
  ["public/icon.png", "image/png"],
  ["public/icon.svg", "image/svg+xml"],
  ["src/app/favicon.ico", "image/x-icon"],
  ["src/app/icon.png", "image/png"],
  ["src/app/icon.svg", "image/svg+xml"],
  ["app/favicon.ico", "image/x-icon"],
  ["app/icon.png", "image/png"],
  ["app/icon.svg", "image/svg+xml"],
];

async function read(sitePath) {
  for (const [relativePath, mime] of ICONS) {
    try {
      const file = join(sitePath, relativePath);
      // Keep the preferred icon order without reading every candidate file.
      // biome-ignore lint/performance/noAwaitInLoops: each candidate depends on the previous one being absent
      const stats = await fs.promises.stat(file);
      if (!stats.isFile() || stats.size > MAX_BYTES) {
        continue;
      }
      return `data:${mime};base64,${(await fs.promises.readFile(file)).toString("base64")}`;
    } catch {
      // Try the next common icon location.
    }
  }
  return null;
}

module.exports = { read };
