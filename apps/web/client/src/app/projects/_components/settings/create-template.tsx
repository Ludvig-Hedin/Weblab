'use client';

import { useMutation } from 'convex/react';
import { toast } from 'sonner';

import type { Project } from '@weblab/models';
import { Tags } from '@weblab/constants';
import { DropdownMenuItem } from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';

import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';

export function CreateTemplate({ project, refetch }: { project: Project; refetch: () => void }) {
    const addTag = useMutation(api.projects.addTag);
    const removeTag = useMutation(api.projects.removeTag);
    const isTemplate = project.metadata.tags.includes(Tags.TEMPLATE) || false;

    const handleTemplateToggle = async () => {
        try {
            if (isTemplate) {
                await removeTag({ projectId: project.id as Id<'projects'>, tag: Tags.TEMPLATE });
                toast.success('Removed from templates');
            } else {
                await addTag({ projectId: project.id as Id<'projects'>, tag: Tags.TEMPLATE });
                toast.success('Added to templates');
            }

            refetch();
        } catch (error) {
            toast.error('Failed to update template tag');
        }
    };

    return (
        <DropdownMenuItem
            onSelect={handleTemplateToggle}
            className="text-foreground-active hover:!bg-background-weblab hover:!text-foreground-active gap-2"
        >
            {isTemplate ? (
                <Icons.CrossL className="text-foreground-skill h-4 w-4" />
            ) : (
                <Icons.FilePlus className="h-4 w-4" />
            )}
            {isTemplate ? 'Unmark as template' : 'Convert to template'}
        </DropdownMenuItem>
    );
}
