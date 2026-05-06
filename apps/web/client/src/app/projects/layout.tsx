import { type Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { APP_NAME } from '@weblab/constants';

import { Routes } from '@/utils/constants';
import { createClient } from '@/utils/supabase/server';
import { getReturnUrlQueryParam } from '@/utils/url';

export const metadata: Metadata = {
    title: APP_NAME,
    description: `${APP_NAME} – Projects`,
};

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
    const supabase = await createClient();
    const {
        data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
        const headersList = await headers();
        const pathname = headersList.get('x-pathname') || Routes.PROJECTS;
        redirect(`${Routes.LOGIN}?${getReturnUrlQueryParam(pathname)}`);
    }

    return <>{children}</>;
}
