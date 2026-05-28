'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import localforage from 'localforage';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';

import type { ExternalTemplate } from './template-data';
import { useAuthContext } from '@/app/auth/auth-context';
import { LocalForageKeys, Routes } from '@/utils/constants';

interface ExternalTemplateActionsProps {
    template: ExternalTemplate;
    size?: 'default' | 'lg';
    className?: string;
}

export function ExternalTemplateActions({
    template,
    size = 'default',
    className,
}: ExternalTemplateActionsProps) {
    const user = useQuery(api.users.me, {});
    const { redirectToSignIn } = useAuthContext();
    const router = useRouter();

    const creatingHref = `${Routes.PROJECT_CREATING}?templateId=${template.id}`;

    const handleUseTemplate = async () => {
        if (!user?._id) {
            await localforage.setItem(LocalForageKeys.RETURN_URL, creatingHref);
            redirectToSignIn();
            return;
        }
        // Navigate immediately — progress is shown on the creating page.
        router.push(creatingHref);
    };

    return (
        <div className={className ?? 'flex flex-wrap items-center gap-2'}>
            <Button onClick={() => void handleUseTemplate()} size={size}>
                <Icons.FilePlus className="h-4 w-4" />
                Use template
            </Button>
            <Button asChild variant="outline" size={size}>
                <a href={template.previewUrl} target="_blank" rel="noreferrer">
                    <Icons.EyeOpen className="h-4 w-4" />
                    Preview
                </a>
            </Button>
            <Button asChild variant="ghost" size={size}>
                <Link href={`${Routes.PROJECT_TEMPLATES}/${template.id}`}>
                    Details
                    <Icons.ArrowRight className="h-4 w-4" />
                </Link>
            </Button>
        </div>
    );
}
