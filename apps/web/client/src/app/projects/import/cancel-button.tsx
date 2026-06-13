'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';

import { Routes } from '@/utils/constants';

interface CancelButtonProps {
    /**
     * Optional callback invoked before navigating to the home route.
     * Use this to abort in-flight imports and clean up orphan sandbox/project state.
     */
    onCancel?: () => void | Promise<void>;
}

export const CancelButton = ({ onCancel }: CancelButtonProps = {}) => {
    const t = useTranslations('projects.importLocal');
    const router = useRouter();

    if (onCancel) {
        return (
            <Button
                type="button"
                variant="outline"
                className="!border-border cursor-pointer rounded-lg border-[0.5px] px-3 py-2"
                onClick={async () => {
                    try {
                        await onCancel();
                    } catch (error) {
                        console.error('Cancel cleanup failed:', error);
                    } finally {
                        router.push(Routes.HOME);
                    }
                }}
            >
                <Icons.CrossL className="h-4 w-4" /> {t('cancel')}
            </Button>
        );
    }

    return (
        <Button
            variant="outline"
            asChild
            className="!border-border cursor-pointer rounded-lg border-[0.5px] px-3 py-2"
        >
            <Link href={Routes.HOME}>
                <Icons.CrossL className="h-4 w-4" /> {t('cancel')}
            </Link>
        </Button>
    );
};
