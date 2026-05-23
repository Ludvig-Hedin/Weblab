'use client';

import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import localforage from 'localforage';
import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons/index';

import { useHasAuthCookie } from '@/hooks/use-has-auth-cookie';
import { LocalForageKeys, Routes } from '@/utils/constants';
import { useAuthContext } from '../../auth/auth-context';

export function ImportGitHub() {
    const router = useRouter();
    const hasAuthCookie = useHasAuthCookie();
    const user = useQuery(api.users.me, hasAuthCookie === true ? {} : 'skip');
    const { setIsAuthModalOpen } = useAuthContext();
    const t = useTranslations('landing.hero');

    const handleClick = async () => {
        if (!user?._id) {
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
            {t('importGithub')}
        </button>
    );
}
