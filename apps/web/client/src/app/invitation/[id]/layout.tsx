import { type Metadata } from 'next';

import { APP_NAME } from '@weblab/constants';

import { getCurrentUser } from '@/utils/auth/current-user';
import { HandleAuth } from './_components/auth';

export const metadata: Metadata = {
    title: APP_NAME,
    description: `${APP_NAME} – Invitation`,
};

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
    const user = await getCurrentUser();

    if (!user) {
        return <HandleAuth />;
    }
    return (
        <div className="flex h-screen w-screen flex-col items-center justify-center">
            {children}
        </div>
    );
}
