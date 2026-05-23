import { type Metadata } from 'next';

import { APP_NAME } from '@weblab/constants';

import { HandleAuth } from '@/app/invitation/[id]/_components/auth';
import { getCurrentUser } from '@/utils/auth/current-user';

export const metadata: Metadata = {
    title: APP_NAME,
    description: `${APP_NAME} – Workspace Invitation`,
};

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
    const user = await getCurrentUser();

    // Mirror /invitation/[id]/layout: render the login prompt instead of
    // letting the protectedProcedure 401 silently behind a "Loading…" spinner.
    if (!user) {
        return <HandleAuth />;
    }
    return (
        <div className="flex h-screen w-screen flex-col items-center justify-center">
            {children}
        </div>
    );
}
