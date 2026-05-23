'use client';

import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons/index';

import { useHasAuthCookie } from '@/hooks/use-has-auth-cookie';
import { Routes } from '@/utils/constants';
import { useAuthContext } from '../../auth/auth-context';

export function CloneWebsite() {
    const router = useRouter();
    const hasAuthCookie = useHasAuthCookie();
    const user = useQuery(api.users.me, hasAuthCookie === true ? {} : 'skip');
    const { setIsAuthModalOpen } = useAuthContext();
    const t = useTranslations('landing.hero');

    const handleClick = () => {
        if (!user?._id) {
            setIsAuthModalOpen(true);
            return;
        }
        router.push(Routes.NEW_PROJECT);
    };

    return (
        <button
            onClick={handleClick}
            className="text-foreground-secondary hover:text-foreground flex items-center gap-2 text-sm transition-colors duration-200"
        >
            <Icons.MagicWand className="h-4 w-4" />
            {t('cloneWebsite')}
        </button>
    );
}
