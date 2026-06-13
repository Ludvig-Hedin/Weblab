'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import localforage from 'localforage';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';

import type { ExternalTemplate } from './template-data';
import { useAuthContext } from '@/app/auth/auth-context';
import { LocalForageKeys, Routes } from '@/utils/constants';
import { ProjectPreviewSurface } from '../select/project-preview-surface';

type TemplateUser = { _id: string } | null;

interface ExternalTemplatesProps {
    templates: ExternalTemplate[];
    title?: string;
    description?: string;
}

export function ExternalTemplates({
    templates,
    title,
    description,
}: ExternalTemplatesProps) {
    const t = useTranslations('projects.templates');
    // Fetched once here so each card doesn't instantiate its own hook subscription.
    const user = useQuery(api.users.me, {});

    const resolvedTitle = title ?? t('starterTemplates');
    const resolvedDescription = description ?? t('starterTemplatesDesc');

    if (templates.length === 0) {
        return null;
    }

    return (
        <section className="w-full">
            <div className="mb-6 flex flex-col gap-1">
                <h2 className="text-foreground text-lg font-medium tracking-tight">{resolvedTitle}</h2>
                <p className="text-foreground-tertiary max-w-xl text-xs leading-relaxed">
                    {resolvedDescription}
                </p>
            </div>
            <div className="grid grid-cols-1 gap-x-5 gap-y-8 md:grid-cols-2 xl:grid-cols-3">
                {templates.map((template, index) => (
                    <ExternalTemplateCard
                        key={template.id}
                        template={template}
                        index={index}
                        user={user ?? null}
                    />
                ))}
            </div>
        </section>
    );
}

interface ExternalTemplateCardProps {
    template: ExternalTemplate;
    index: number;
    user: TemplateUser;
}

function ExternalTemplateCard({ template, index, user }: ExternalTemplateCardProps) {
    const t = useTranslations('projects.templates');
    const { redirectToSignIn } = useAuthContext();
    const router = useRouter();

    const detailsHref = `${Routes.PROJECT_TEMPLATES}/${template.id}`;
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
        <motion.article
            initial={{ opacity: 0, y: 8 }}
            animate={{
                opacity: 1,
                y: 0,
                transition: { delay: index * 0.04, duration: 0.28, ease: 'easeOut' },
            }}
            className="group/card w-full"
        >
            <div className="relative">
                <Link
                    href={detailsHref}
                    aria-label={`Open ${template.name} template`}
                    className="block overflow-hidden rounded-xl"
                >
                    <ProjectPreviewSurface
                        projectName={template.name}
                        imageUrl={null}
                        siteUrl={template.previewUrl}
                        className="aspect-[4/2.75] rounded-[inherit] transition-transform duration-300 ease-out group-hover/card:scale-[1.02]"
                    />
                </Link>

                <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center gap-2 bg-black/20 opacity-0 backdrop-blur-[1px] transition-opacity duration-200 group-hover/card:pointer-events-auto group-hover/card:opacity-100">
                    <Button
                        size="default"
                        onClick={() => void handleUseTemplate()}
                        className="bg-background text-foreground hover:bg-background-secondary border-border gap-2 border"
                    >
                        <Icons.FilePlus className="h-4 w-4" />
                        {t('useTemplate')}
                    </Button>
                    {template.previewUrl && (
                        <Button
                            asChild
                            size="default"
                            variant="ghost"
                            className="text-foreground bg-background/40 hover:bg-background/70 gap-2 backdrop-blur-md"
                        >
                            <a
                                href={template.previewUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <Icons.EyeOpen className="h-4 w-4" />
                                {t('preview')}
                            </a>
                        </Button>
                    )}
                </div>
            </div>

            <div className="mt-3 flex items-start justify-between gap-3 px-1">
                <div className="min-w-0">
                    <Link
                        href={detailsHref}
                        className="text-foreground block truncate text-sm font-medium underline decoration-transparent underline-offset-3 transition-colors duration-200 group-hover/card:decoration-current"
                    >
                        {template.name}
                    </Link>
                    <p className="text-foreground-tertiary mt-1 line-clamp-1 text-xs leading-relaxed">
                        {template.shortDescription}
                    </p>
                </div>
                <span className="text-foreground-tertiary mt-0.5 flex-shrink-0 text-[11px] capitalize">
                    {template.category}
                </span>
            </div>
        </motion.article>
    );
}
