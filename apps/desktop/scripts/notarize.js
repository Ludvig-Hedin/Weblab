/**
 * electron-builder afterSign hook — sends the signed .app to Apple's
 * notary service.
 *
 * Runs only if the build was signed AND notarization credentials exist.
 * Otherwise it logs and returns (so an unsigned local dev build still works).
 *
 * Required env vars (any one of the two auth methods):
 *
 *   API-key (recommended):
 *     APPLE_API_KEY            absolute path to AuthKey_XXXX.p8
 *     APPLE_API_KEY_ID         the key ID (e.g. ABCDE12345)
 *     APPLE_API_ISSUER         issuer UUID from App Store Connect
 *
 *   App-specific password:
 *     APPLE_ID                 your Apple ID email
 *     APPLE_APP_SPECIFIC_PASSWORD   generated at appleid.apple.com
 *     APPLE_TEAM_ID            10-char Team ID
 *
 *   Common (required either way):
 *     CSC_LINK / CSC_KEY_PASSWORD  the signing cert (used by electron-builder
 *                                  before this hook runs)
 *
 * Skipping is allowed: set SKIP_NOTARIZATION=1 to force a no-op.
 */
exports.default = async function notarizing(context) {
    const { electronPlatformName, appOutDir } = context;

    if (electronPlatformName !== 'darwin') return;

    if (process.env.SKIP_NOTARIZATION === '1') {
        console.log('[notarize] SKIP_NOTARIZATION=1 — skipping.');
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

    if (!hasApiKey && !hasAppleId) {
        console.log(
            '[notarize] No notarization credentials in env — skipping. ' +
                'macOS will show the Gatekeeper warning until this is run with ' +
                'APPLE_API_KEY/_ID/_ISSUER or APPLE_ID/_APP_SPECIFIC_PASSWORD/_TEAM_ID set.',
        );
        return;
    }

    let notarize;
    try {
        ({ notarize } = require('@electron/notarize'));
    } catch (err) {
        console.error(
            '[notarize] @electron/notarize is not installed. Add it with: ' +
                'cd apps/desktop && bun add -d @electron/notarize',
        );
        throw err;
    }

    const appName = context.packager.appInfo.productFilename; // "Weblab"
    const appPath = `${appOutDir}/${appName}.app`;

    console.log(`[notarize] Submitting ${appPath} to Apple…`);
    const opts = { tool: 'notarytool', appPath };
    if (hasApiKey) {
        opts.appleApiKey = process.env.APPLE_API_KEY;
        opts.appleApiKeyId = process.env.APPLE_API_KEY_ID;
        opts.appleApiIssuer = process.env.APPLE_API_ISSUER;
    } else {
        opts.appleId = process.env.APPLE_ID;
        opts.appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
        opts.teamId = process.env.APPLE_TEAM_ID;
    }

    await notarize(opts);
    console.log('[notarize] Done. Stapling…');
};
