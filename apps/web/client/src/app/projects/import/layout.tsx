import { type Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { APP_NAME } from '@weblab/constants';

import { getCurrentUser, getSignInUrl } from '@/utils/auth/current-user';

export const metadata: Metadata = {
    title: APP_NAME,
    description: `${APP_NAME} – Create Project`,
};

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
    const user = await getCurrentUser();
    if (!user) {
        const pathname = (await headers()).get('x-pathname') ?? '/projects/import';
        redirect(getSignInUrl(pathname));
    }
    return <>{children}</>;
}
