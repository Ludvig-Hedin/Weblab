/**
 * electron-builder afterSign hook: sends the signed app to Apple's notary
 * service and staples the ticket. Skips (so unsigned local builds work) when
 * the build was not signed or no credentials are in the environment.
 *
 * Credentials, either:
 *   APPLE_API_KEY (path to AuthKey_XXXX.p8), APPLE_API_KEY_ID, APPLE_API_ISSUER
 * or:
 *   APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
 * Set SKIP_NOTARIZATION=1 to force a no-op.
 */
const { spawnSync } = require("node:child_process");

const DEVELOPER_ID = /Authority=Developer ID Application/;

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== "darwin") {
    return;
  }
  if (process.env.SKIP_NOTARIZATION === "1") {
    console.log("[notarize] SKIP_NOTARIZATION=1, skipping.");
    return;
  }

  const appName = context.packager.appInfo.productFilename; // "Weblab"
  const appPath = `${appOutDir}/${appName}.app`;

  // codesign prints signature details on stderr.
  const signature =
    spawnSync("/usr/bin/codesign", ["-dvv", appPath], { encoding: "utf8" })
      .stderr || "";
  if (!DEVELOPER_ID.test(signature)) {
    console.log("[notarize] App is not signed with a Developer ID, skipping.");
    return;
  }

  const hasApiKey =
    process.env.APPLE_API_KEY &&
    process.env.APPLE_API_KEY_ID &&
    process.env.APPLE_API_ISSUER;
  const hasAppleId =
    process.env.APPLE_ID &&
    process.env.APPLE_APP_SPECIFIC_PASSWORD &&
    process.env.APPLE_TEAM_ID;
  if (!(hasApiKey || hasAppleId)) {
    console.log("[notarize] No notarization credentials in env, skipping.");
    return;
  }

  const { notarize } = await import("@electron/notarize");
  const opts = hasApiKey
    ? {
        appleApiIssuer: process.env.APPLE_API_ISSUER,
        appleApiKey: process.env.APPLE_API_KEY,
        appleApiKeyId: process.env.APPLE_API_KEY_ID,
        appPath,
      }
    : {
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
        appPath,
        teamId: process.env.APPLE_TEAM_ID,
      };

  console.log(`[notarize] Submitting ${appPath} to Apple…`);
  await notarize(opts); // @electron/notarize staples the ticket when it succeeds.
  console.log("[notarize] Notarized and stapled.");
};
