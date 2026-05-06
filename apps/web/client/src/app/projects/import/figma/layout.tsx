import { type Metadata } from 'next';
import { redirect } from 'next/navigation';

import { APP_NAME } from '@weblab/constants';

import { Routes } from '@/utils/constants';
import { createClient } from '@/utils/supabase/server';
import { FigmaImportProvider } from './_context';

export const metadata: Metadata = {
    title: APP_NAME,
    description: `${APP_NAME} – Import from Figma`,
};

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        redirect(Routes.LOGIN);
    }
    return <FigmaImportProvider>{children}</FigmaImportProvider>;
}
