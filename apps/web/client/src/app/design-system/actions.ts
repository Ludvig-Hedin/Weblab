'use server';

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { cookies, headers } from 'next/headers';

import { env } from '@/env';

export async function isLocalhost(): Promise<boolean> {
    const headersList = await headers();
    const host = headersList.get('host') ?? '';
    return host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('::1');
}

export async function isLocalhostClient(): Promise<boolean> {
    return isLocalhost();
}

interface ApplyPayload {
    overrides: Record<string, string>;
    radiusScale: number;
    transitionSpeed: number;
}

type ApplyResult = { ok: true; tokenCount: number } | { ok: false; error: string };

const OVERRIDE_START = '/* === design-system overrides (managed) === */';
const OVERRIDE_END = '/* === end overrides === */';

export async function writeOverridesToSource(payload: ApplyPayload): Promise<ApplyResult> {
    if (!(await isLocalhost())) {
        return { ok: false, error: 'Only allowed on localhost.' };
    }

    const safeKey = /^--[a-zA-Z0-9-]+$/;
    for (const k of Object.keys(payload.overrides)) {
        if (!safeKey.test(k)) {
            return { ok: false, error: `Invalid CSS variable name: ${k}` };
        }
    }
    for (const v of Object.values(payload.overrides)) {
        if (/[;{}]/.test(v)) {
            return { ok: false, error: `Invalid CSS value contains ; { or }` };
        }
    }
    if (!Number.isFinite(payload.radiusScale) || !Number.isFinite(payload.transitionSpeed)) {
        return { ok: false, error: 'Invalid scalar.' };
    }

    const lines: string[] = [];
    if (payload.radiusScale !== 1) lines.push(`    --radius: ${payload.radiusScale}rem;`);
    if (payload.transitionSpeed !== 1)
        lines.push(`    --ds-anim-duration: ${Math.round(payload.transitionSpeed * 200)}ms;`);
    Object.entries(payload.overrides).forEach(([k, v]) => lines.push(`    ${k}: ${v};`));

    const block =
        lines.length === 0
            ? ''
            : [OVERRIDE_START, ':root {', ...lines, '}', OVERRIDE_END, ''].join('\n');

    const targetPath = path.resolve(process.cwd(), '../../..', 'packages/ui/src/globals.css');

    let current: string;
    try {
        current = await fs.readFile(targetPath, 'utf8');
    } catch (err) {
        return { ok: false, error: `Could not read ${targetPath}: ${(err as Error).message}` };
    }

    const startIdx = current.indexOf(OVERRIDE_START);
    const endIdx = current.indexOf(OVERRIDE_END);
    let next: string;
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        const before = current.slice(0, startIdx).replace(/\s+$/, '');
        const after = current.slice(endIdx + OVERRIDE_END.length).replace(/^\s+/, '\n');
        next = block
            ? `${before}\n\n${block}${after.startsWith('\n') ? '' : '\n'}${after}`
            : `${before}\n${after}`;
    } else {
        next = block ? `${current.replace(/\s+$/, '')}\n\n${block}\n` : current;
    }

    try {
        const tmp = `${targetPath}.tmp-${Date.now()}`;
        await fs.writeFile(tmp, next, 'utf8');
        await fs.rename(tmp, targetPath);
    } catch (err) {
        return { ok: false, error: `Write failed: ${(err as Error).message}` };
    }

    return { ok: true, tokenCount: lines.length };
}

export async function verifyDesignPassword(password: string): Promise<boolean> {
    const expected = env.DESIGN_SYSTEM_PASSWORD;
    if (!expected) return false;
    const match = password === expected;
    if (match) {
        const cookieStore = await cookies();
        cookieStore.set('ds_unlocked', '1', {
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7,
            path: '/design-system',
        });
    }
    return match;
}

export async function isDesignUnlocked(): Promise<boolean> {
    const cookieStore = await cookies();
    return cookieStore.get('ds_unlocked')?.value === '1';
}
