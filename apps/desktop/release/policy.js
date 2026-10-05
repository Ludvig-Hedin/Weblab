'use strict';

const { createHash } = require('node:crypto');
const { privateCredentialPath } = require('../private-path-policy');

const EXCLUDED = new Set(['.git', '.weblab', '.codex', '.claude', '.ssh', '.aws', 'node_modules', '.next', '.vercel', 'dist', 'coverage']);
const PRIVATE_DATABASE = /\.(?:sqlite|sqlite3|db)$/i;
const INLINE_SECRET = /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----|\bAKIA[A-Z0-9]{16}\b|\bsk_(?:live|test)_[A-Za-z0-9]{12,}|\bsk-(?:ant-|proj-)[A-Za-z0-9_-]{12,}|\b(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}/;
const GENERATED = /^(?:next-env\.d\.ts|.*\.tsbuildinfo|\.DS_Store)$/;
const EDITOR_ASSETS = new Set(['public/weblab-preload-script.js', 'public/weblab-ix-runtime.js', '__weblab-preload.js', '__weblab-ix-runtime.js']);

function releasePathAllowed(file) {
    if (typeof file !== 'string' || file.length > 1024 || file.includes('\\') || /[\x00-\x1f]/.test(file) || EDITOR_ASSETS.has(file)) return false;
    const parts = file.split('/');
    if (parts.some((part) => !part || part === '.' || part === '..' || EXCLUDED.has(part.toLowerCase()))) return false;
    return !privateCredentialPath(file) && !PRIVATE_DATABASE.test(parts.at(-1)) && !GENERATED.test(parts.at(-1));
}

function sha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

const SANITY_PACKAGES = new Set(['sanity', 'next-sanity', '@sanity/client']);

function contentSources(files) {
    const detected = new Set();
    for (const file of files) {
        if (file.path !== 'package.json' && !file.path.endsWith('/package.json')) continue;
        let manifest;
        try { manifest = JSON.parse(file.bytes.toString('utf8')); }
        catch { throw new Error(`The release package manifest could not be verified: ${file.path}`); }
        if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
            throw new Error(`Invalid release package manifest: ${file.path}`);
        }
        for (const group of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
            const dependencies = manifest[group];
            if (dependencies === undefined) continue;
            if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) {
                throw new Error(`Invalid release dependencies: ${file.path}`);
            }
            for (const [name, version] of Object.entries(dependencies)) {
                if (typeof version !== 'string' || !version) throw new Error(`Invalid release dependency: ${file.path}`);
                if (SANITY_PACKAGES.has(name) || /^npm:(?:sanity|next-sanity|@sanity\/client)(?:@|$)/.test(version)) detected.add('sanity');
            }
        }
    }
    return [...detected].sort();
}

function assertSourceOnlyRelease(release) {
    if (!Array.isArray(release.contentSources)) throw new Error('Release content sources could not be verified.');
    if (release.contentSources.length) {
        throw new Error('This site uses Sanity and needs a reviewed immutable content runtime. CMS publishing is not available yet.');
    }
}

/** Only frozen bytes enter a deployment. Caller must establish native private-copy provenance. */
function freezeFiles(input) {
    if (!Array.isArray(input) || input.length === 0 || input.length > 10_000) throw new Error('Invalid release file count.');
    let size = 0;
    const paths = new Set();
    const files = input.map((file) => {
        if (!releasePathAllowed(file.path) || paths.has(file.path)) throw new Error('Unsafe or duplicate release path.');
        paths.add(file.path);
        if (!Buffer.isBuffer(file.bytes)) throw new Error('Release file bytes are missing.');
        const bytes = Buffer.from(file.bytes);
        if (INLINE_SECRET.test(bytes.toString('utf8'))) throw new Error(`Remove an embedded secret before publishing: ${file.path}`);
        size += bytes.length;
        if (bytes.length > 32 * 1024 * 1024 || size > 100 * 1024 * 1024) throw new Error('Release exceeds the upload size limit.');
        return { path: file.path, bytes, sha256: sha256(bytes) };
    }).sort((a, b) => a.path.localeCompare(b.path));
    const pkg = files.find((file) => file.path === 'package.json');
    if (!pkg) throw new Error('Release requires a Next.js project.');
    const manifest = JSON.parse(pkg.bytes.toString('utf8'));
    const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
    if (!dependencies.next || !dependencies.tailwindcss) throw new Error('This release supports Next.js with Tailwind.');
    if (!files.some((file) => ['bun.lock', 'bun.lockb', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'].includes(file.path))) {
        throw new Error('A dependency lockfile is required before publishing.');
    }
    const configuration = files.find((file) => file.path === 'vercel.json');
    if (configuration) {
        const config = JSON.parse(configuration.bytes.toString('utf8'));
        // These can override the reviewed environment, domains or Next.js build contract.
        for (const key of ['alias', 'env', 'build', 'builds', 'buildCommand', 'installCommand', 'ignoreCommand', 'outputDirectory']) {
            if (key in config) throw new Error(`Unsupported publication option in vercel.json: ${key}`);
        }
        if ('framework' in config && config.framework !== 'nextjs') throw new Error('Unsupported publication option in vercel.json: framework');
    }
    return { files, size, contentSources: contentSources(files), hash: sha256(Buffer.from(JSON.stringify(files.map(({ path, sha256 }) => [path, sha256])))) };
}

module.exports = { releasePathAllowed, freezeFiles, assertSourceOnlyRelease, sha256 };
