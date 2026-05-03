'use client';

import Link from 'next/link';
import { motion } from 'motion/react';

import { Badge } from '@weblab/ui/badge';

import type { ExternalTemplate } from './template-data';
import { Routes } from '@/utils/constants';
import { ExternalTemplateActions } from './external-template-actions';

interface ExternalTemplatesProps {
    templates: ExternalTemplate[];
    title?: string;
    description?: string;
}

export function ExternalTemplates({
    templates,
    title = 'Starter templates',
    description = 'Start from proven Next.js templates, preview them first, or open the details page for source and related options.',
}: ExternalTemplatesProps) {
    if (templates.length === 0) {
        return null;
    }

    return (
        <section className="w-full">
            <div className="mb-5 flex flex-col gap-2">
                <h2 className="text-foreground text-2xl font-normal">{title}</h2>
                <p className="text-foreground-tertiary max-w-2xl text-sm">{description}</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {templates.map((template, index) => (
                    <motion.article
                        key={template.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{
                            opacity: 1,
                            y: 0,
                            transition: { delay: index * 0.04, duration: 0.28 },
                        }}
                        className="group border-foreground/8 bg-background/70 hover:border-foreground/16 overflow-hidden rounded-[24px] border shadow-sm backdrop-blur-xl transition-colors"
                    >
                        <Link
                            href={`${Routes.PROJECT_TEMPLATES}/${template.id}`}
                            className={`block h-32 bg-gradient-to-br ${template.gradientClassName}`}
                        >
                            <div className="flex h-full flex-col justify-between p-5">
                                <div className="flex flex-wrap gap-1.5">
                                    {template.tags.slice(0, 2).map((tag) => (
                                        <span
                                            key={tag}
                                            className="rounded-full bg-white/10 px-2 py-1 text-[11px] text-white/80"
                                        >
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                                <div>
                                    <p
                                        className={`text-sm font-medium ${template.accentClassName}`}
                                    >
                                        {template.category}
                                    </p>
                                    <h3 className="text-xl font-semibold text-white">
                                        {template.name}
                                    </h3>
                                </div>
                            </div>
                        </Link>
                        <div className="flex min-h-52 flex-col gap-4 p-5">
                            <div className="flex flex-wrap gap-1.5">
                                {template.tags.map((tag) => (
                                    <Badge key={tag} variant="secondary" className="text-[11px]">
                                        {tag}
                                    </Badge>
                                ))}
                            </div>
                            <div className="flex-1">
                                <p className="text-foreground-secondary text-sm leading-6">
                                    {template.shortDescription}
                                </p>
                            </div>
                            <ExternalTemplateActions template={template} />
                        </div>
                    </motion.article>
                ))}
            </div>
        </section>
    );
}
