'use client';

import { useState } from 'react';
import { api } from '@convex/_generated/api';
import { useMutation } from 'convex/react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import type { Project } from '@weblab/models';
import { Tags } from '@weblab/constants';
import { DropdownMenuItem } from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';

import type { Id } from '@convex/_generated/dataModel';
import { transKeys } from '@/i18n/keys';

export function CreateTemplate({ project, refetch }: { project: Project; refetch: () => void }) {
    const t = useTranslations();
    const addTag = useMutation(api.projects.addTag);
    const removeTag = useMutation(api.projects.removeTag);
    const isTemplate = project.metadata.tags.includes(Tags.TEMPLATE);
    const [isPending, setIsPending] = useState(false);

    const handleTemplateToggle = async () => {
        if (isPending) return;
        setIsPending(true);
        try {
            if (isTemplate) {
                await removeTag({ projectId: project.id as Id<'projects'>, tag: Tags.TEMPLATE });
                toast.success(t(transKeys.projects.dialogs.template.toastRemoved));
            } else {
                await addTag({ projectId: project.id as Id<'projects'>, tag: Tags.TEMPLATE });
                toast.success(t(transKeys.projects.dialogs.template.toastAdded));
            }

            refetch();
        } catch (error) {
            console.error('Failed to update template tag:', error);
            toast.error(t(transKeys.projects.dialogs.template.toastFailed));
        } finally {
            setIsPending(false);
        }
    };

    return (
        <DropdownMenuItem
            onSelect={handleTemplateToggle}
            disabled={isPending}
            className="text-foreground-active hover:!bg-background-weblab hover:!text-foreground-active gap-2"
        >
            {isTemplate ? (
                <Icons.CrossL className="text-foreground-skill h-4 w-4" />
            ) : (
                <Icons.FilePlus className="h-4 w-4" />
            )}
            {isTemplate
                ? t(transKeys.projects.actions.unmarkAsTemplate)
                : t(transKeys.projects.actions.convertToTemplate)}
        </DropdownMenuItem>
    );
}
