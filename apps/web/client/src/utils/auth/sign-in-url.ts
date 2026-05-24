import { sanitizeReturnUrl } from '@/utils/auth/sanitize-return-url';

// Client-safe sign-in URL helper. Post-migration: always `/sign-in` (Clerk).
// Mirrors the server-side `getSignInUrl` from `./current-user.ts`. Both
// sanitize `returnUrl` to prevent open-redirect attacks via the
// `?returnUrl=` query parameter.

export function getSignInUrlClient(returnUrl?: string | null): string {
    const safeReturnUrl = sanitizeReturnUrl(returnUrl);
    if (!safeReturnUrl) return '/sign-in';
    const params = new URLSearchParams({ returnUrl: safeReturnUrl });
    return `/sign-in?${params.toString()}`;
}
