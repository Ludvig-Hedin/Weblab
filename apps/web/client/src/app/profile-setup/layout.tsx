import { redirect } from 'next/navigation';

import { getCurrentUser, getSignInUrl } from '@/utils/auth/current-user';

// Server-side gate so anonymous visitors don't see the profile form (which
// would no-op on submit because `api.users.updateProfile` rejects with
// UNAUTHORIZED). Catalog tag `#auth-gated` matches the page's intent — the
// previous client-only check let the form render but then silently failed.
//
// The forwarded `returnUrl` is `/profile-setup` so users come back here after
// signing in.

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
    const user = await getCurrentUser();
    if (!user) {
        redirect(getSignInUrl('/profile-setup'));
    }
    return <>{children}</>;
}
