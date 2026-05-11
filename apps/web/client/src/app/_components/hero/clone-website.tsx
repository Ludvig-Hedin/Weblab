'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { Icons } from '@weblab/ui/icons/index';

import { api } from '@/trpc/react';
import { Routes } from '@/utils/constants';
import { useAuthContext } from '../../auth/auth-context';

export function CloneWebsite() {
    const router = useRouter();
    const { data: user } = api.user.get.useQuery();
    const { setIsAuthModalOpen } = useAuthContext();
    const t = useTranslations('landing.hero');

    const handleClick = () => {
        if (!user?.id) {
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
