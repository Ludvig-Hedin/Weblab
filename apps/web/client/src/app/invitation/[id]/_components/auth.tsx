'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons/index';

import { Routes } from '@/utils/constants';
import { getReturnUrlQueryParam } from '@/utils/url';

export const HandleAuth = () => {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const handleLogin = () => {
        const currentUrl = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
        router.push(`${Routes.LOGIN}?${getReturnUrlQueryParam(currentUrl)}`);
    };

    return (
        <div className="flex h-screen items-center justify-center">
            <div className="flex max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
                <h1 className="text-foreground text-2xl font-medium">Invitation</h1>
                <p className="text-foreground-secondary">
                    You must be logged in to accept this invitation.
                </p>
                <Button variant="outline" onClick={handleLogin}>
                    <Icons.WeblabLogo className="size-4" />
                    Log in or sign up
                </Button>
            </div>
        </div>
    );
};
