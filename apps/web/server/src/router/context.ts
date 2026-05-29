import { createRemoteJWKSet, jwtVerify } from 'jose';

import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';

// Clerk JWT verification for the sandbox tRPC server.
//
// The browser passes a Clerk "convex"-template JWT in the WS connectionParams
// (`token`) — see apps/web/client/src/lib/sandbox-server-client.ts. We verify
// it against Clerk's JWKS (issuer = CLERK_JWT_ISSUER_DOMAIN) and expose the
// resolved Clerk user id on the context. Sandbox procedures (which will expose
// file read/write + command execution on a sandbox) MUST require `ctx.userId`
// via `requireUserId` — an unauthenticated caller must never reach the Vercel
// Sandbox SDK.
//
// Verification is best-effort here (no throw): the context attaches
// `userId: string | null`, and enforcement lives in each sandbox procedure, so
// a missing/invalid token fails that specific call rather than breaking the
// whole WS connection (and the unrelated components router).

const issuerDomain = process.env.CLERK_JWT_ISSUER_DOMAIN?.replace(/\/$/, '');

// Lazily-built remote JWKS (cached internally by jose). Null when the issuer
// env is missing — every token then resolves to `userId: null` and sandbox
// procedures reject, which is the safe failure mode.
const jwks = issuerDomain
    ? createRemoteJWKSet(new URL(`${issuerDomain}/.well-known/jwks.json`))
    : null;

export interface User {
    name: string[] | string;
}

async function resolveUserId(token: string | undefined): Promise<string | null> {
    if (!token || !jwks || !issuerDomain) return null;
    try {
        const { payload } = await jwtVerify(token, jwks, { issuer: issuerDomain });
        return typeof payload.sub === 'string' ? payload.sub : null;
    } catch {
        // Invalid / expired / wrong-issuer token → treat as unauthenticated.
        return null;
    }
}

export async function createContext(opts: CreateFastifyContextOptions) {
    const { req, res } = opts;

    // WS clients pass the Clerk JWT via connectionParams.token; HTTP callers
    // may use a Bearer header. `info` carries connectionParams in tRPC v11.
    const info = (opts as { info?: { connectionParams?: Record<string, string> | null } }).info;
    const wsToken = info?.connectionParams?.token;
    const headerToken =
        typeof req.headers.authorization === 'string'
            ? req.headers.authorization.replace(/^Bearer\s+/i, '')
            : undefined;
    // Treat an empty-string WS token (the client sends `token: ''` when signed
    // out) as absent so we fall back to the header. `??` would keep the '' and
    // skip the header, so an explicit length check is used instead.
    const token = wsToken && wsToken.length > 0 ? wsToken : headerToken;
    const userId = await resolveUserId(token);

    // `user` kept for back-compat with any existing consumers.
    const user: User = { name: req.headers.username ?? 'anonymous' };

    return { req, res, user, userId };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

/**
 * Guard for sandbox procedures: require an authenticated Clerk user. Throws
 * when the caller is unauthenticated so file/command procedures can never run
 * for an anonymous caller.
 */
export function requireUserId(ctx: Context): string {
    if (!ctx.userId) {
        throw new Error('UNAUTHORIZED: a valid Clerk session token is required.');
    }
    return ctx.userId;
}
