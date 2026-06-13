'use client';

import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';

export type StaticTemplateId =
    | 'portfolio'
    | 'saas'
    | 'blog'
    | 'dashboard'
    | 'ecommerce'
    | 'agency'
    | 'docs'
    | 'app';

export interface StaticTemplate {
    id: StaticTemplateId;
    name: string;
    description: string;
    /** Tailwind background class for the thumbnail */
    bg: string;
    /** Tailwind text-color class for the name accent */
    accent: string;
}

const TEMPLATES: StaticTemplate[] = [
    {
        id: 'portfolio',
        name: 'Portfolio',
        description: 'Personal showcase site',
        bg: 'bg-violet-950',
        accent: 'text-violet-300',
    },
    {
        id: 'saas',
        name: 'SaaS Landing',
        description: 'Product marketing page',
        bg: 'bg-blue-950',
        accent: 'text-blue-300',
    },
    {
        id: 'blog',
        name: 'Blog',
        description: 'Writing & content',
        bg: 'bg-amber-950',
        accent: 'text-amber-300',
    },
    {
        id: 'dashboard',
        name: 'Dashboard',
        description: 'Analytics & metrics',
        bg: 'bg-emerald-950',
        accent: 'text-emerald-300',
    },
    {
        id: 'ecommerce',
        name: 'E-commerce',
        description: 'Online storefront',
        bg: 'bg-rose-950',
        accent: 'text-rose-300',
    },
    {
        id: 'agency',
        name: 'Agency',
        description: 'Creative studio site',
        bg: 'bg-orange-950',
        accent: 'text-orange-300',
    },
    {
        id: 'docs',
        name: 'Docs Site',
        description: 'Product documentation',
        bg: 'bg-sky-950',
        accent: 'text-sky-300',
    },
    {
        id: 'app',
        name: 'Web App',
        description: 'Full web application',
        bg: 'bg-neutral-800',
        accent: 'text-neutral-300',
    },
];

interface StaticTemplatesProps {
    onUseTemplate: (template: StaticTemplate) => void;
    isCreating?: boolean;
    availableTemplateIds?: ReadonlySet<string>;
}

export function StaticTemplates({
    onUseTemplate,
    isCreating = false,
    availableTemplateIds,
}: StaticTemplatesProps) {
    const t = useTranslations('projects.templates');
    const templates = availableTemplateIds
        ? TEMPLATES.filter((template) => availableTemplateIds.has(template.id))
        : TEMPLATES;

    if (templates.length === 0) {
        return null;
    }

    return (
        <div className="mt-14">
            <h2 className="text-foreground mb-4 text-2xl font-normal">{t('sectionTitle')}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {templates.map((template, index) => (
                    <motion.div
                        key={template.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{
                            opacity: 1,
                            y: 0,
                            transition: { delay: index * 0.04, duration: 0.3 },
                        }}
                        className="group cursor-pointer"
                        onClick={() => {
                            if (isCreating) return;
                            onUseTemplate(template);
                        }}
                        role="button"
                        tabIndex={isCreating ? -1 : 0}
                        onKeyDown={(e) => {
                            if (isCreating) return;
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onUseTemplate(template);
                            }
                        }}
                        aria-disabled={isCreating}
                        aria-label={`Start from ${template.name} template`}
                    >
                        {/* Thumbnail */}
                        <div
                            className={`relative aspect-[4/2.6] overflow-hidden rounded-xl transition-opacity duration-200 group-hover:opacity-75 ${template.bg}`}
                        >
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
                                <span className={`text-sm font-semibold ${template.accent}`}>
                                    {template.name}
                                </span>
                                <span className="text-[11px] text-white/35">
                                    {template.description}
                                </span>
                            </div>

                            {/* "Use template" pill on hover */}
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={isCreating}
                                    className="pointer-events-none h-7 px-3 text-[11px]"
                                    tabIndex={-1}
                                >
                                    {isCreating ? (
                                        <Icons.LoadingSpinner className="h-3 w-3 animate-spin" />
                                    ) : (
                                        t('useTemplate')
                                    )}
                                </Button>
                            </div>
                        </div>

                        {/* Label below */}
                        <div className="mt-2 px-0.5">
                            <span className="text-foreground text-sm font-medium">
                                {template.name}
                            </span>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}
