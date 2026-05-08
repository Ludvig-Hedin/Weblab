'use server';

import { cookies, headers } from 'next/headers';

import { env } from '@/env';

export async function isLocalhost(): Promise<boolean> {
    const headersList = await headers();
    const host = headersList.get('host') ?? '';
    return host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('::1');
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
