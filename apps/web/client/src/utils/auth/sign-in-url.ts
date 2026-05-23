import { env } from '@/env';

// Client-safe sign-in URL helper. Mirrors the server-side `getSignInUrl` from
// `./current-user.ts` but reads `NEXT_PUBLIC_AUTH_PROVIDER` so it can run in
// the browser bundle. The two helpers must stay in lockstep — both branch on
// `'clerk'` vs anything else.

export function getSignInUrlClient(returnUrl?: string | null): string {
    const base = env.NEXT_PUBLIC_AUTH_PROVIDER === 'clerk' ? '/sign-in' : '/login';
    if (!returnUrl) return base;
    const params = new URLSearchParams({ returnUrl });
    return `${base}?${params.toString()}`;
}
