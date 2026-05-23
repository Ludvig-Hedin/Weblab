import { type Metadata } from 'next';
import { redirect } from 'next/navigation';

import { APP_NAME } from '@weblab/constants';

import { getCurrentUser, getSignInUrl } from '@/utils/auth/current-user';
import { FigmaImportProvider } from './_context';

export const metadata: Metadata = {
    title: APP_NAME,
    description: `${APP_NAME} – Import from Figma`,
};

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
    const user = await getCurrentUser();
    if (!user) {
        redirect(getSignInUrl());
    }
    return <FigmaImportProvider>{children}</FigmaImportProvider>;
}
