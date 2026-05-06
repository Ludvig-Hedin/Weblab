'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import localforage from 'localforage';
import { toast } from 'sonner';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';

import type { ExternalTemplate } from './template-data';
import { useAuthContext } from '@/app/auth/auth-context';
import { useCreateManager } from '@/components/store/create';
import { api } from '@/trpc/react';
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
    const { data: user } = api.user.get.useQuery();
    const { setIsAuthModalOpen } = useAuthContext();
    const createManager = useCreateManager();
    const router = useRouter();
    const [isCreating, setIsCreating] = useState(false);

    const handleUseTemplate = async () => {
        if (!user?.id) {
            await localforage.setItem(LocalForageKeys.RETURN_URL, window.location.pathname);
            setIsAuthModalOpen(true);
            return;
        }

        setIsCreating(true);
        try {
            const project = await createManager.startPublicGitHubTemplate({
                userId: user.id,
                name: template.name,
                description: template.shortDescription,
                repoUrl: template.repoUrl,
                branch: template.branch,
                subpath: template.subpath,
            });

            if (!project) {
                throw new Error(createManager.error ?? 'No project was returned');
            }

            toast.success(`Created project from ${template.name}`);
            router.push(`${Routes.PROJECT}/${project.id}`);
        } catch (error) {
            console.error('Error creating project from external template:', error);
            toast.error('Failed to create project from template', {
                description: error instanceof Error ? error.message : String(error),
            });
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className={className ?? 'flex flex-wrap items-center gap-2'}>
            <Button onClick={() => void handleUseTemplate()} disabled={isCreating} size={size}>
                {isCreating ? (
                    <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                ) : (
                    <Icons.FilePlus className="h-4 w-4" />
                )}
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
