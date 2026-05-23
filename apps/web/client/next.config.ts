/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import path from 'node:path';
import './src/env';

const nextConfig: NextConfig = {
    devIndicators: false,
    // Allow dev access from Cloudflare quick tunnels so mobile/other devices
    // can hit the dev server through a public URL (used for cross-network QA).
    allowedDevOrigins: ['*.trycloudflare.com'],
    // Prevent Node.js-only packages from being bundled into client/edge chunks.
    // These are loaded via native require() in Route Handlers at runtime.
    serverExternalPackages: ['openai', 'mem0ai', '@vercel/sandbox'],
    webpack(config, { isServer }) {
        if (!isServer) {
            config.resolve.alias = {
                ...config.resolve.alias,
                '@vercel/sandbox': path.resolve(__dirname, './src/stubs/vercel-sandbox.ts'),
            };
        }
        return config;
    },
    ...(process.env.STANDALONE_BUILD === 'true' && { output: 'standalone' }),
    async redirects() {
        return [
            // Some legacy Android Chrome versions and third-party PWA install
            // prompts still look up /manifest.json. Redirect to the canonical
            // /manifest.webmanifest instead of returning 404.
            {
                source: '/manifest.json',
                destination: '/manifest.webmanifest',
                permanent: true,
            },
            // Stale references (old email templates, indexed pages, external links)
            // sometimes point at /auth/error. The real route is /auth/auth-code-error.
            {
                source: '/auth/error',
                destination: '/auth/auth-code-error',
                permanent: false,
            },
            // Shared project links sometimes use the plural pluralization. Forward
            // to the canonical singular route so users hit the login gate (or load
            // the project) instead of a flat 404.
            {
                source: '/projects/:id((?!new|import|creating|marketplace|plan|templates).+)',
                destination: '/project/:id',
                permanent: false,
            },
            // Convenience aliases for the all-sections showcase page.
            {
                source: '/blocks',
                destination: '/features/blocks',
                permanent: false,
            },
            {
                source: '/design-system/blocks',
                destination: '/features/blocks',
                permanent: false,
            },
        ];
    },
    async headers() {
        return [
            {
                source: '/:path*',
                headers: [
                    {
                        key: 'Strict-Transport-Security',
                        value: 'max-age=31536000; includeSubDomains',
                    },
                    {
                        key: 'X-Content-Type-Options',
                        value: 'nosniff',
                    },
                    {
                        key: 'X-Frame-Options',
                        value: 'SAMEORIGIN',
                    },
                    {
                        key: 'X-DNS-Prefetch-Control',
                        value: 'on',
                    },
                    {
                        key: 'Referrer-Policy',
                        value: 'strict-origin-when-cross-origin',
                    },
                    {
                        key: 'Permissions-Policy',
                        value: 'camera=(), geolocation=(), microphone=(self)',
                    },
                    {
                        key: 'Content-Security-Policy',
                        value: [
                            "default-src 'self'",
                            "base-uri 'self'",
                            "frame-ancestors 'self'",
                            "object-src 'none'",
                            "img-src 'self' data: blob: https:",
                            "font-src 'self' data: https:",
                            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
                            "style-src 'self' 'unsafe-inline' https:",
                            // Local Ollama is a development convenience only. In production we
                            // must not advertise that any visitor's localhost is reachable from
                            // this origin — XSS injected into a prod page could otherwise probe
                            // / attack the user's local Ollama instance.
                            process.env.NODE_ENV === 'production'
                                ? "connect-src 'self' https: wss:"
                                : "connect-src 'self' https: wss: http://localhost:11434 http://127.0.0.1:11434",
                            "frame-src 'self' https:",
                            "media-src 'self' blob: https:",
                            "worker-src 'self' blob:",
                        ].join('; '),
                    },
                ],
            },
            {
                source: '/sw.js',
                headers: [
                    { key: 'Service-Worker-Allowed', value: '/' },
                    { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
                    { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
                ],
            },
            {
                source: '/manifest.webmanifest',
                headers: [
                    { key: 'Content-Type', value: 'application/manifest+json; charset=utf-8' },
                ],
            },
            // Edge-cache marketing HTML on Cloudflare so non-EU TTFB is not gated
            // on the Railway origin in europe-west4. Keep auth/api/projects/dynamic
            // routes excluded — they still default to no-store via Next's dynamic
            // rendering pipeline.
            //
            // Two rules: an explicit '/' rule (Next's named-param `:path` does
            // not match the empty path) and a wildcard rule for everything else
            // that the negative-lookahead allows.
            //
            // Vary: Cookie ensures shared caches (Cloudflare, browsers) key the
            // cached HTML by Cookie header. Anonymous visitors share one cached
            // copy; visitors with a session cookie get an origin response. This
            // prevents serving authenticated-state HTML to anonymous users.
            {
                source: '/',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400',
                    },
                    { key: 'Vary', value: 'Accept-Encoding' },
                ],
            },
            {
                source:
                    '/:path((?!api|auth|login|projects|project|invitation|sw\\.js|manifest\\.webmanifest|_next).*)',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400',
                    },
                    { key: 'Vary', value: 'Accept-Encoding' },
                ],
            },
        ];
    },
};

if (process.env.NODE_ENV === 'development') {
    nextConfig.outputFileTracingRoot = path.join(__dirname, '../../..');
}

const withNextIntl = createNextIntlPlugin({
    experimental: {
        createMessagesDeclaration: './messages/en.json',
    },
});
export default withNextIntl(nextConfig);
