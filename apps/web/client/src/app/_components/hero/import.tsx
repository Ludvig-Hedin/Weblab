'use client';

import { useRouter } from 'next/navigation';
import localforage from 'localforage';

import { Icons } from '@weblab/ui/icons/index';

import { api } from '@/trpc/react';
import { LocalForageKeys, Routes } from '@/utils/constants';
import { useAuthContext } from '../../auth/auth-context';

export function ImportGitHub() {
    const router = useRouter();
    const { data: user } = api.user.get.useQuery();
    const { setIsAuthModalOpen } = useAuthContext();

    const handleClick = async () => {
        if (!user?.id) {
            // Await the write so the auth modal isn't shown before the
            // returnUrl lands — otherwise the post-login redirect can race
            // and miss the value entirely.
            await localforage.setItem(LocalForageKeys.RETURN_URL, Routes.IMPORT_GITHUB);
            setIsAuthModalOpen(true);
            return;
        }
        router.push(Routes.IMPORT_GITHUB);
    };

    return (
        <button
            onClick={() => void handleClick()}
            className="text-foreground-secondary hover:text-foreground flex items-center gap-2 text-sm transition-colors duration-200"
        >
            <Icons.GitHubLogo className="h-4 w-4" />
            Import from GitHub
        </button>
    );
}
