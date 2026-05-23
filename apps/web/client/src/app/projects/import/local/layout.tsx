import { type Metadata } from 'next';
import { redirect } from 'next/navigation';

import { APP_NAME } from '@weblab/constants';

import { getCurrentUser, getSignInUrl } from '@/utils/auth/current-user';
import { ProjectCreationProvider } from './_context';

export const metadata: Metadata = {
    title: APP_NAME,
    description: `${APP_NAME} – Import Local Project`,
};

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
    const user = await getCurrentUser();
    if (!user) {
        redirect(getSignInUrl());
    }
    return <ProjectCreationProvider totalSteps={2}>{children} </ProjectCreationProvider>;
}
