import { redirect } from 'next/navigation';

import { getCurrentUser, getSignInUrl } from '@/utils/auth/current-user';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function NewWorkspaceLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    const user = await getCurrentUser();
    if (!user) {
        redirect(getSignInUrl('/w/new'));
    }

    return children;
}
