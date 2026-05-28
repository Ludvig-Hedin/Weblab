// One-off: push GitHub App env vars into the Convex deployment so
// githubActions.* actions can read them. Run from apps/web/client.
//   bun scripts/set-convex-github-env.mjs            # dev (default)
//   bun scripts/set-convex-github-env.mjs --prod     # production
import { readFileSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

/**
 * Minimal .env parser. Handles quoted values that span multiple lines (PEM
 * private keys) and `\n` escapes inside quotes. Exported for unit tests.
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseEnv(text) {
  const out = {};
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const eq = line.indexOf("=");
    if (eq < 0 || line.trimStart().startsWith("#")) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Z0-9_]+$/.test(key)) continue;
    let rest = line.slice(eq + 1);
    if (rest.startsWith('"')) {
      // Quoted value, possibly spanning multiple lines until closing quote.
      let val = rest.slice(1);
      while (!val.endsWith('"') && i + 1 < lines.length) {
        i++;
        val += "\n" + lines[i];
      }
      val = val.replace(/"$/, "").replace(/\\n/g, "\n");
      out[key] = val;
    } else {
      out[key] = rest.trim();
    }
  }
  return out;
}

function main() {
  const isProd = process.argv.includes("--prod");

  const env = parseEnv(readFileSync(".env.local", "utf8"));

  const required = [
    "GITHUB_APP_ID",
    "GITHUB_APP_SLUG",
    "GITHUB_APP_PRIVATE_KEY",
  ];
  const missing = required.filter((k) => !env[k]);
  if (missing.length) {
    console.error(`Missing in .env.local: ${missing.join(", ")}`);
    process.exit(1);
  }

  const getExistingConvexEnv = (key) => {
    const args = ["convex", "env", "get"];
    if (isProd) args.push("--prod");
    args.push("--", key);
    const res = spawnSync("bunx", args, { encoding: "utf8" });
    if (res.status !== 0) return null;
    const val = (res.stdout ?? "").trim();
    return val.length > 0 ? val : null;
  };

  // The install-state secret only has to be stable WITHIN a deployment (signed
  // at generate-time, verified at callback-time). Rotating it invalidates any
  // in-flight install states, so never overwrite an existing one — reuse what
  // the deployment already has, else prefer .env.local, else mint a fresh one.
  const stateSecret =
    getExistingConvexEnv("GITHUB_INSTALL_STATE_SECRET") ||
    env.GITHUB_INSTALL_STATE_SECRET ||
    randomBytes(32).toString("hex");

  const toSet = {
    GITHUB_APP_ID: env.GITHUB_APP_ID,
    GITHUB_APP_SLUG: env.GITHUB_APP_SLUG,
    GITHUB_APP_PRIVATE_KEY: env.GITHUB_APP_PRIVATE_KEY,
    GITHUB_INSTALL_STATE_SECRET: stateSecret,
  };

  for (const [key, value] of Object.entries(toSet)) {
    const args = ["convex", "env", "set"];
    if (isProd) args.push("--prod");
    // `--` ends option parsing so PEM values starting with `-----` aren't
    // mistaken for CLI flags.
    args.push("--", key, value);
    const res = spawnSync("bunx", args, { stdio: "inherit" });
    if (res.status !== 0) {
      console.error(`Failed to set ${key}`);
      process.exit(res.status ?? 1);
    }
    const preview =
      key === "GITHUB_APP_PRIVATE_KEY"
        ? `len=${value.length}`
        : key === "GITHUB_INSTALL_STATE_SECRET"
          ? `sha256=${createHash("sha256").update(value).digest("hex").slice(0, 12)}…`
          : value;
    console.log(`✓ ${key} (${preview})`);
  }

  console.log(`\nDone (${isProd ? "production" : "dev"}).`);
}

// Only run the provisioning side-effects when executed directly, not on import
// (the test imports `parseEnv`).
if (import.meta.main) {
  main();
}
