import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { env } from '@/env';
import { transKeys } from '@/i18n/keys';
import { getSignInUrl } from '@/utils/auth/current-user';
import { LocalForageKeys } from '@/utils/constants';
import { LoginPageClient } from './_components/login-page-client';

interface LoginPageProps {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// Server-side Clerk redirect: when the deployment is on Clerk, bookmarks /
// stale OAuth links into `/login` previously rendered the Supabase form for
// a frame before a client-side `useEffect` bounced to `/sign-in`. Doing the
// redirect server-side eliminates that flash (and the unnecessary client JS
// boot just to immediately redirect).
export default async function LoginPage({ searchParams }: LoginPageProps) {
    const params = await searchParams;
    const rawReturnUrl = params[LocalForageKeys.RETURN_URL];
    const returnUrl =
        typeof rawReturnUrl === 'string'
            ? rawReturnUrl
            : Array.isArray(rawReturnUrl)
              ? (rawReturnUrl[0] ?? null)
              : null;

    if (env.WEBLAB_AUTH_PROVIDER === 'clerk') {
        redirect(getSignInUrl(returnUrl));
    }

    const t = await getTranslations();
    const missingEmail = params.missing === 'email';
    const initialEmailError = missingEmail ? t(transKeys.loginPage.verificationExpired) : null;

    return <LoginPageClient returnUrl={returnUrl} initialEmailError={initialEmailError} />;
}
