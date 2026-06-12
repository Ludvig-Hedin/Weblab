// Host-classification policy for the desktop shell's navigation guard.
// Extracted from main.js so it can be unit-tested without booting Electron
// (mirrors the weblab-local.js / weblab-cli.js split).
//
// The app window must NEVER render a third-party OAuth *provider* sign-in page:
// Google blocks embedded Chromium outright, GitHub / Vercel / Apple mis-handle
// the OAuth `client_id` outside a real browser, and splitting a flow across
// cookie jars breaks PKCE. Those hosts are bounced to the user's real browser
// (the renderer drives them via `weblabNative.openExternal`; this is the
// defense-in-depth net for any stray navigation/redirect).
//
// BUT Clerk's own Frontend API / handshake hosts are NOT sign-in pages — they
// are cookie-sync + session endpoints Clerk drives via top-level redirects.
// In development, clerk-js redirects the top-level document to
// `<slug>.clerk.accounts.dev/v1/client/handshake?...` on first load whenever
// the persisted session partition has no `__client` cookie — which is exactly
// the state of Electron's fresh `persist:weblab` partition. Bouncing that
// handshake to the external browser aborts it mid-flight and leaves the desktop
// window blank ("desktop loads empty in dev, app only shows in localhost
// browser"). These hosts MUST resolve in-window.

// Third-party OAuth provider hosts + Clerk's *hosted account portal* (the full
// sign-in UI served from accounts.<domain>). All bounced to the real browser.
const BLOCKED_OAUTH_HOSTS = new Set([
    'accounts.google.com',
    'appleid.apple.com',
    'github.com',
    'vercel.com',
    // Clerk's hosted account portal (full sign-in UI). NOT the FAPI below.
    'accounts.weblab.build',
]);

// Clerk Frontend API / handshake hosts — must stay in-window so the dev-mode
// handshake (and prod session sync) can complete instead of being bounced.
const CLERK_FAPI_HOSTS = new Set([
    'clerk.weblab.build',
]);

/**
 * True when `hostname` is one of Clerk's own Frontend API / handshake hosts.
 * Covers the production FAPI subdomain and any development instance, whose FAPI
 * lives at `<slug>.clerk.accounts.dev` (e.g. `full-redbird-32.clerk.accounts.dev`).
 */
function isClerkFapiHost(hostname) {
    if (CLERK_FAPI_HOSTS.has(hostname)) return true;
    return hostname.endsWith('.clerk.accounts.dev');
}

/**
 * True when navigating to `hostname` should be denied in-window and handed to
 * the OS browser. Clerk FAPI/handshake hosts are explicitly exempt — they are
 * not provider sign-in pages and must complete inside the app window.
 */
function isOAuthHost(hostname) {
    // Never bounce Clerk's own FAPI/handshake — doing so blanks the window.
    if (isClerkFapiHost(hostname)) return false;
    for (const host of BLOCKED_OAUTH_HOSTS) {
        if (hostname === host || hostname.endsWith(`.${host}`)) return true;
    }
    return false;
}

module.exports = {
    BLOCKED_OAUTH_HOSTS,
    CLERK_FAPI_HOSTS,
    isClerkFapiHost,
    isOAuthHost,
};
