'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';

import { CurrentUserAvatar } from '@/components/ui/avatar-dropdown';
import { useHasAuthCookie } from '@/hooks/use-has-auth-cookie';
import { api } from '@/trpc/react';
import { Routes } from '@/utils/constants';

export const AuthButton = () => {
    const hasAuthCookie = useHasAuthCookie();
    // Anonymous visitors don't need a `user.get` round-trip — the absence
    // of the auth cookie is enough to render the signed-out CTA.
    const { data: user } = api.user.get.useQuery(undefined, {
        enabled: hasAuthCookie === true,
    });
    const t = useTranslations('nav.user');
    return (
        <div className="mt-0 flex items-center gap-3">
            <Link
                href={Routes.DOWNLOAD}
                className="text-foreground-secondary hover:text-foreground hidden items-center gap-1.5 text-sm transition-colors duration-150 lg:inline-flex"
            >
                <Icons.Download className="h-4 w-4" />
                {t('download')}
            </Link>
            {user ? (
                <>
                    <Button variant="secondary" size="sm" asChild className="cursor-pointer">
                        <Link href={Routes.PROJECTS}>{t('projects')}</Link>
                    </Button>
                    <CurrentUserAvatar className="cursor-pointer hover:opacity-80" />
                </>
            ) : (
                <Button variant="secondary" size="sm" asChild className="cursor-pointer">
                    <Link href={Routes.LOGIN}>{t('signIn')}</Link>
                </Button>
            )}
        </div>
    );
};
