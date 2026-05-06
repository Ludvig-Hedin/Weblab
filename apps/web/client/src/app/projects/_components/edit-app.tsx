import type { ComponentProps } from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { observer } from 'mobx-react-lite';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { usePostHog } from 'posthog-js/react';

import type { Project } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import { transKeys } from '@/i18n/keys';
import { Routes } from '@/utils/constants';

const ButtonMotion = motion.create(Button);

interface EditAppButtonProps extends ComponentProps<typeof ButtonMotion> {
    project: Project;
}

export const EditAppButton = observer(({ project, onClick, ...props }: EditAppButtonProps) => {
    const t = useTranslations();
    const posthog = usePostHog();
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);

    const selectProject = (project: Project) => {
        setIsLoading(true);
        posthog.capture('open_project', { id: project.id });
        try {
            router.push(`${Routes.PROJECT}/${project.id}`);
        } catch {
            setIsLoading(false);
        }
    };

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        if (onClick) {
            onClick(e);
        }
        selectProject(project);
    };

    return (
        <ButtonMotion
            size="default"
            className={cn(
                'border-border w-auto cursor-pointer gap-2 border',
                isLoading
                    ? 'bg-background-secondary text-foreground-secondary'
                    : 'bg-background text-foreground hover:bg-background-secondary',
            )}
            {...props}
            // Prevent consumer from overriding these props
            onClick={handleClick}
            disabled={isLoading}
        >
            {isLoading ? (
                <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
            ) : (
                <Icons.PencilPaper />
            )}
            <p>{t(transKeys.projects.actions.editApp)}</p>
        </ButtonMotion>
    );
});
