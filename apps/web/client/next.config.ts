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
            // Common short paths that external sites/email footers link to.
            // Canonical routes live under the longer slugs.
            {
                source: '/privacy',
                destination: '/privacy-policy',
                permanent: true,
            },
            {
                source: '/terms',
                destination: '/terms-of-service',
                permanent: true,
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
                            // `unsafe-eval` is required in prod too: Next 16
                            // Turbopack ships chunks that evaluate strings
                            // (`new Function(...)`) during module init, and
                            // several runtime deps (mobx, AI tooling, parser
                            // helpers) follow the same pattern. Dropping it
                            // in prod broke the entire client bundle — every
                            // visit ended on the global error boundary with
                            // `EvalError: Evaluating a string as JavaScript
                            // violates the following Content Security Policy
                            // directive` (see BACKLOG: "harden CSP — drop
                            // unsafe-eval via nonces/strict-dynamic").
                            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
                            "style-src 'self' 'unsafe-inline' https:",
                            // Local Ollama is a development convenience only. In production we
                            // must not advertise that any visitor's localhost is reachable from
                            // this origin — XSS injected into a prod page could otherwise probe
                            // / attack the user's local Ollama instance.
                            // Dev also needs the local Fastify sandbox server's
                            // INSECURE WebSocket (`ws://localhost:8080`, see
                            // sandbox-server-client.ts). Prod uses `wss:` (already
                            // allowed); without the `ws://` origins here the editor's
                            // sandbox WS is CSP-blocked and previews never boot.
                            process.env.NODE_ENV === 'production'
                                ? "connect-src 'self' https: wss:"
                                : // Dev: the local Fastify sandbox server speaks an insecure WS.
                                  // It defaults to :8080, but DERIVE the origin from
                                  // NEXT_PUBLIC_SANDBOX_SERVER_URL when set so running the
                                  // sandbox server on a non-default port (e.g. when :8080 is
                                  // taken by another app) isn't silently CSP-blocked.
                                  `connect-src 'self' https: wss: ws://localhost:8080 ws://127.0.0.1:8080${(() => {
                                      const u = process.env.NEXT_PUBLIC_SANDBOX_SERVER_URL?.trim();
                                      if (!u) return '';
                                      try {
                                          const { protocol, host } = new URL(u);
                                          return ` ${protocol === 'https:' ? 'wss:' : 'ws:'}//${host}`;
                                      } catch {
                                          return '';
                                      }
                                  })()} http://localhost:11434 http://127.0.0.1:11434`,
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
