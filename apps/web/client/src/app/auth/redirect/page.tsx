import { redirect } from 'next/navigation';

import { Routes } from '@/utils/constants';
import { sanitizeReturnUrl } from '@/utils/url';

interface AuthRedirectProps {
    searchParams: Promise<{ returnUrl?: string }>;
}

export default async function AuthRedirect({ searchParams }: AuthRedirectProps) {
    const { returnUrl } = await searchParams;
    const sanitized = sanitizeReturnUrl(returnUrl ?? null);
    // Always redirect on the server — no client roundtrip, no spinner, no
    // localforage drain. returnUrl arrives via URL query (set by the OAuth
    // callback); when missing, fall through to /projects.
    redirect(sanitized === Routes.HOME ? Routes.PROJECTS : sanitized);
}
