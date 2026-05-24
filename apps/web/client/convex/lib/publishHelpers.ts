'use node';

import type { FreestyleFile } from 'freestyle-sandboxes';

import type { Provider } from '@weblab/code-provider';
import type { DeploymentType } from '@weblab/models';
import { HOSTING_PROVIDER_LABELS, HostingProvider } from '@weblab/models';

import type { Doc } from '../_generated/dataModel';
import { FreestyleAdapter } from './freestyle';
import { HostingProviderFactory } from './hostingFactory';
import { decryptProviderToken } from './providerTokens';

// Convex port of src/server/api/routers/publish/helpers/{deploy,fork,helpers,env,
// unpublish,access-middleware,publish}.ts. Each helper takes plain values
// (urls, deployment object, etc.) and runs entirely in Node — DB I/O is
// done by callers via `ctx.runQuery/Mutation`.

// ─── Project URLs (computed by caller, but exported for reuse) ───────────────

export function getProjectUrlsFromRows(args: {
    type: DeploymentType;
    preview: Array<{ fullDomain: string }>;
    custom: Array<{ fullDomain: string }>;
}): string[] {
    const { type, preview, custom } = args;
    if (type === 'preview' || type === 'unpublish_preview') {
        if (preview.length === 0) throw new Error('BAD_REQUEST: No preview domain found');
        return preview.map((d) => d.fullDomain);
    }
    if (type === 'custom' || type === 'unpublish_custom') {
        if (custom.length === 0) throw new Error('BAD_REQUEST: No custom domain found');
        return custom.map((d) => d.fullDomain);
    }
    const exhaustive: never = type;
    throw new Error(`Unhandled deployment type: ${String(exhaustive)}`);
}

// ─── Sandbox fork ────────────────────────────────────────────────────────────

/**
 * Historically forked the source CodeSandbox into a build-only sandbox so
 * publish couldn't race with active user edits. CodeSandbox was archived
 * 2026-05-24. A native Vercel Sandbox equivalent (snapshot source → resume
 * into a build sandbox) is not yet implemented — this throws so publish
 * fails loudly instead of building an empty VM.
 *
 * Tracked as TODO(publish-vercel) — see
 * docs/notes/2026-05-13-vercel-sandbox-provider.md.
 */
export async function forkBuildSandbox(
    _sandboxId: string,
    _userId: string,
    _deploymentId: string,
): Promise<{ provider: Provider; sandboxId: string }> {
    throw new Error(
        'Publish is temporarily unavailable on the Vercel runtime. ' +
            'CodeSandbox was archived 2026-05-24; the Vercel snapshot-based ' +
            'build fork is not yet implemented. See ' +
            'docs/notes/2026-05-13-vercel-sandbox-provider.md (TODO(publish-vercel)).',
    );
}

// ─── Env extraction ──────────────────────────────────────────────────────────

export function parseEnvContent(content: string): Record<string, string> {
    const envVars: Record<string, string> = {};
    const lines = content.split('\n');
    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith('#')) continue;
        const equalIndex = trimmedLine.indexOf('=');
        if (equalIndex === -1) continue;
        const key = trimmedLine.slice(0, equalIndex).trim();
        let value = trimmedLine.slice(equalIndex + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        if (key) envVars[key] = value;
    }
    return envVars;
}

export async function extractEnvVarsFromSandbox(
    provider: Provider,
): Promise<Record<string, string>> {
    try {
        const envVars: Record<string, string> = {};
        const ENV_FILE_PATTERNS = ['.env', '.env.production'];
        for (const fileName of ENV_FILE_PATTERNS) {
            try {
                const { file } = await provider.readFile({ args: { path: fileName } });
                Object.assign(envVars, parseEnvContent(file.toString()));
            } catch (error) {
                console.warn(`Could not read ${fileName}:`, error);
            }
        }
        return envVars;
    } catch (error) {
        console.error('Error extracting env vars from sandbox:', error);
        return {};
    }
}

// ─── Freestyle deploy ────────────────────────────────────────────────────────

export async function deployFreestyle({
    files,
    urls,
    envVars,
}: {
    files: Record<string, FreestyleFile>;
    urls: string[];
    envVars?: Record<string, string>;
}): Promise<{ success: boolean; message?: string }> {
    const entrypoint = 'server.js';
    const adapter = new FreestyleAdapter();
    const deploymentFiles: Record<string, { content: string; encoding?: 'utf-8' | 'base64' }> = {};
    for (const [path, file] of Object.entries(files)) {
        deploymentFiles[path] = {
            content: file.content,
            encoding: file.encoding === 'base64' ? 'base64' : 'utf-8',
        };
    }
    const result = await adapter.deploy({
        files: deploymentFiles,
        config: { domains: urls, entrypoint, envVars },
    });
    if (!result.success) throw new Error(result.message ?? 'Failed to deploy project');
    return result;
}

export async function deployExternal({
    provider,
    tokenEncrypted,
    files,
    urls,
    envVars,
}: {
    provider: HostingProvider;
    tokenEncrypted: string;
    files: Record<string, FreestyleFile>;
    urls: string[];
    envVars?: Record<string, string>;
}): Promise<{ success: boolean; message?: string }> {
    const token = decryptProviderToken(tokenEncrypted);
    const adapter = HostingProviderFactory.create(provider, { token });
    const externalFiles: Record<string, { content: string; encoding?: 'utf-8' | 'base64' }> = {};
    for (const [path, file] of Object.entries(files)) {
        externalFiles[path] = {
            content: file.content,
            encoding: file.encoding === 'base64' ? 'base64' : 'utf-8',
        };
    }
    const result = await adapter.deploy({
        files: externalFiles,
        config: { domains: urls, entrypoint: 'server.js', envVars },
    });
    if (!result.success) {
        throw new Error(
            result.message ?? `Failed to deploy to ${HOSTING_PROVIDER_LABELS[provider]}.`,
        );
    }
    return result;
}

// ─── Access middleware (per-page password) ───────────────────────────────────

export const ACCESS_MIDDLEWARE_MARKER = '@weblab-access-middleware';

export interface ProtectedPage {
    pagePath: string;
    passwordHash: string;
}

const escapeForString = (value: string): string => JSON.stringify(value);

export const generateAccessMiddleware = (pages: ProtectedPage[]): string | null => {
    if (pages.length === 0) return null;
    const seen = new Map<string, string>();
    for (const page of pages) {
        if (page.pagePath && page.passwordHash) {
            seen.set(page.pagePath, page.passwordHash);
        }
    }
    if (seen.size === 0) return null;
    const entries = [...seen.entries()].sort(([a], [b]) => a.localeCompare(b));
    const protectedLines = entries
        .map(([path, hash]) => `    ${escapeForString(path)}: ${escapeForString(hash)},`)
        .join('\n');
    const matcherLines = entries.map(([path]) => `    ${escapeForString(path)},`).join('\n');
    return `/* ${ACCESS_MIDDLEWARE_MARKER} */
// Auto-generated by Weblab on publish. Do not edit manually — your changes
// will be overwritten the next time this site is published.

import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED: Record<string, string> = {
${protectedLines}
};

async function verify(password: string, stored: string): Promise<boolean> {
    const parts = stored.split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
    const iterations = Number.parseInt(parts[1] ?? '', 10);
    if (!Number.isFinite(iterations) || iterations <= 0) return false;
    const salt = Uint8Array.from(atob(parts[2] ?? ''), (c) => c.charCodeAt(0));
    const expected = Uint8Array.from(atob(parts[3] ?? ''), (c) => c.charCodeAt(0));
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveBits'],
    );
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
        keyMaterial,
        expected.length * 8,
    );
    const actual = new Uint8Array(bits);
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i += 1) {
        diff |= (actual[i] ?? 0) ^ (expected[i] ?? 0);
    }
    return diff === 0;
}

export async function middleware(request: NextRequest) {
    const stored = PROTECTED[request.nextUrl.pathname];
    if (!stored) return NextResponse.next();
    const auth = request.headers.get('authorization');
    if (!auth?.startsWith('Basic ')) {
        return new Response('Password required', {
            status: 401,
            headers: { 'WWW-Authenticate': 'Basic realm="Protected"' },
        });
    }
    try {
        const decoded = atob(auth.slice(6));
        const colonIdx = decoded.indexOf(':');
        const password = colonIdx >= 0 ? decoded.slice(colonIdx + 1) : decoded;
        const ok = await verify(password, stored);
        if (!ok) {
            return new Response('Invalid password', {
                status: 401,
                headers: { 'WWW-Authenticate': 'Basic realm="Protected"' },
            });
        }
        return NextResponse.next();
    } catch {
        return new Response('Invalid authorization header', { status: 400 });
    }
}

export const config = {
    matcher: [
${matcherLines}
    ],
};
`;
};

export const isWeblabGeneratedMiddleware = (source: string): boolean => {
    return source.includes(ACCESS_MIDDLEWARE_MARKER);
};

export async function applyAccessMiddleware(
    provider: Provider,
    protectedPages: ProtectedPage[],
): Promise<void> {
    const usesSrcLayout = await provider
        .statFile({ args: { path: 'src/app' } })
        .then((s) => s.type === 'directory')
        .catch(() => false);
    const middlewarePath = usesSrcLayout ? 'src/middleware.ts' : 'middleware.ts';

    const existing = await provider
        .readFile({ args: { path: middlewarePath } })
        .then((res) => res.file.toString())
        .catch(() => null);

    const source = generateAccessMiddleware(protectedPages);

    if (existing && !isWeblabGeneratedMiddleware(existing)) {
        if (source) {
            console.warn(
                `[publish] User-authored ${middlewarePath} detected; skipping access middleware generation. ` +
                    'Password-protected pages will not be gated until the user-authored middleware is removed.',
            );
        }
        return;
    }

    if (!source) {
        if (existing) {
            try {
                await provider.deleteFiles({ args: { path: middlewarePath } });
            } catch (error) {
                console.warn(
                    `[publish] Failed to delete generated ${middlewarePath}: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                );
            }
        }
        return;
    }
    await provider.writeFile({
        args: { path: middlewarePath, content: source, overwrite: true },
    });
}

// ─── Deployment row helpers ──────────────────────────────────────────────────

export type DeploymentRow = Doc<'deployments'>;
