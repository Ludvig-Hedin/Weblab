import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { getCurrentUser, getSignInUrl } from '@/utils/auth/current-user';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
    const pathname = (await headers()).get('x-pathname') ?? '';
    // Only the editor root delegates to the child layout's exact project check.
    // Settings, wireframes and legacy preview routes keep ordinary admission.
    if (/^\/project\/[a-z0-9]{16,64}(?:\?[^#]*)?$/.test(pathname)) return <>{children}</>;
    const user = await getCurrentUser();
    if (!user) {
        // Preserve the originally-requested path so the sign-in flow can
        // return the user where they tried to go. The deeper
        // `/project/[id]/layout.tsx` redirect runs only after this one
        // returns, so dropping the path here used to send every anon
        // deep-link to a context-free `/sign-in` (no returnUrl).
        redirect(getSignInUrl(pathname));
    }

    return <>{children}</>;
}
