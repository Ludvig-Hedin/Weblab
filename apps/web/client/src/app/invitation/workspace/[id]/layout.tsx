import { type Metadata } from 'next';

import { APP_NAME } from '@weblab/constants';

import { HandleAuth } from '@/app/invitation/[id]/_components/auth';
import { createClient } from '@/utils/supabase/server';

export const metadata: Metadata = {
    title: APP_NAME,
    description: `${APP_NAME} – Workspace Invitation`,
};

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

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
