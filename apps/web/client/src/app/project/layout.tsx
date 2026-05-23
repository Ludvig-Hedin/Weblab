import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { getCurrentUser, getSignInUrl } from '@/utils/auth/current-user';

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
    const user = await getCurrentUser();
    if (!user) {
        // Preserve the originally-requested path so the sign-in flow can
        // return the user where they tried to go. The deeper
        // `/project/[id]/layout.tsx` redirect runs only after this one
        // returns, so dropping the path here used to send every anon
        // deep-link to a context-free `/sign-in` (no returnUrl).
        const headersList = await headers();
        const pathname = headersList.get('x-pathname') ?? null;
        redirect(getSignInUrl(pathname));
    }

    return <>{children}</>;
}
