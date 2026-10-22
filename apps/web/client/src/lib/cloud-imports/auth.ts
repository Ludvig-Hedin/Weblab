import { imageUploadOriginAllowed } from '@/app/api/cloud-editor/images/origin';

type SessionAuth = { userId: string | null; getToken: (options: { template: string }) => Promise<string | null> };
type SessionState = { status: string; tokenType: string | null; toAuth: (options: { treatPendingAsSignedOut: true }) => SessionAuth | null };
export type ImportSessionVerifier = (request: Request, options: {
    acceptsToken: 'session_token'; authorizedParties: string[];
}) => Promise<SessionState>;

/** Authenticate without middleware headers, query inputs or reading the upload body. */
export async function importSessionToken(request: Request, siteUrl: string, verify: ImportSessionVerifier): Promise<string | null> {
    const canonical = new URL(siteUrl);
    if (!imageUploadOriginAllowed(new Request(canonical, { headers: { origin: canonical.origin } }), siteUrl)) return null;
    canonical.pathname = new URL(request.url).pathname;
    canonical.search = '';
    const headers = new Headers();
    for (const name of ['cookie', 'authorization', 'origin', 'sec-fetch-dest']) {
        const value = request.headers.get(name);
        if (value !== null) headers.set(name, value);
    }
    // HEAD intentionally refuses Clerk cookie-refresh handshakes. The regular
    // app refreshes expired sessions; uploads never redirect or replay their body.
    const state = await verify(new Request(canonical, { method: 'HEAD', headers }), {
        acceptsToken: 'session_token', authorizedParties: [canonical.origin],
    });
    if (state.status !== 'signed-in' || state.tokenType !== 'session_token') return null;
    const session = state.toAuth({ treatPendingAsSignedOut: true });
    return session?.userId ? session.getToken({ template: 'convex' }) : null;
}
