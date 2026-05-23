// Convex auth config — wires Convex identity verification to Clerk's JWT
// template named "convex".
//
// CLERK_JWT_ISSUER_DOMAIN is set on the Convex deployment (NOT in .env.local).
// To change it: `bunx convex env set CLERK_JWT_ISSUER_DOMAIN <issuer-url>`
//
// We deliberately fail loud when the env var is missing at module load.
// Convex otherwise accepts `{ domain: undefined, applicationID: 'convex' }`
// silently and refuses every JWT thereafter — invisible misconfiguration.

const domain = process.env.CLERK_JWT_ISSUER_DOMAIN;
if (!domain) {
    throw new Error(
        'CLERK_JWT_ISSUER_DOMAIN is not set on this Convex deployment. ' +
            'Run `bunx convex env set CLERK_JWT_ISSUER_DOMAIN <issuer-url>` ' +
            'with the URL from Clerk dashboard → JWT Templates → convex → Issuer.',
    );
}

export default {
    providers: [
        {
            domain,
            applicationID: 'convex',
        },
    ],
};
