import type { NextConfig } from 'next';

const config: NextConfig = {
    experimental: { cpus: 1 },
    turbopack: { root: process.cwd() },
    outputFileTracingRoot: process.cwd(),
};

export default config;
