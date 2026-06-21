import { type Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { APP_NAME } from '@weblab/constants';

import { getCurrentUser, getSignInUrl } from '@/utils/auth/current-user';

export const metadata: Metadata = {
    title: APP_NAME,
    description: `${APP_NAME} – Start a new project with AI`,
};

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
    const user = await getCurrentUser();
    if (!user) {
        // Preserve the deep-link intent: send the user back here after sign-in
        // instead of dropping them on /projects. `x-pathname` (set by middleware,
        // includes the query string) mirrors the sibling projects/layout.tsx.
        const pathname = (await headers()).get('x-pathname') ?? '/projects/new';
        redirect(getSignInUrl(pathname));
    }
    return <>{children}</>;
}
