import { type Metadata } from 'next';

import { APP_NAME } from '@weblab/constants';

import { createClient } from '@/utils/supabase/server';
import { HandleAuth } from './_components/auth';

export const metadata: Metadata = {
    title: APP_NAME,
    description: `${APP_NAME} – Invitation`,
};

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
    const supabase = await createClient();
    const {
        data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
        return <HandleAuth />;
    }
    return (
        <div className="flex h-screen w-screen flex-col items-center justify-center">
            {children}
        </div>
    );
}
