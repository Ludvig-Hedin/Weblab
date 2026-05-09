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
    ...(process.env.STANDALONE_BUILD === 'true' && { output: 'standalone' }),
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
        ];
    },
    eslint: {
        // Don't run ESLint during builds - handle it separately in CI
        ignoreDuringBuilds: true,
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
