import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { APP_NAME } from '@weblab/constants';
import { Badge } from '@weblab/ui/badge';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';

import { CreateManagerProvider } from '@/components/store/create';
import { Routes } from '@/utils/constants';
import { isNonEmbeddable } from '../../_components/select/project-preview-utils';
import { ExternalTemplateActions } from '../../_components/templates/external-template-actions';
import { ExternalTemplates } from '../../_components/templates/external-templates';
import {
    EXTERNAL_TEMPLATES,
    getExternalTemplate,
    getRelatedExternalTemplates,
} from '../../_components/templates/template-data';
import { TopBar } from '../../_components/top-bar';

interface TemplatePageProps {
    params: Promise<{
        id: string;
    }>;
}

export function generateStaticParams() {
    return EXTERNAL_TEMPLATES.map((template) => ({ id: template.id }));
}

export async function generateMetadata({ params }: TemplatePageProps): Promise<Metadata> {
    const { id } = await params;
    const template = getExternalTemplate(id);

    if (!template) {
        return {
            title: `Template not found - ${APP_NAME}`,
        };
    }

    return {
        title: `${template.name} template - ${APP_NAME}`,
        description: template.shortDescription,
    };
}

export default async function TemplatePage({ params }: TemplatePageProps) {
    const { id } = await params;
    const template = getExternalTemplate(id);

    if (!template) {
        notFound();
    }

    const relatedTemplates = getRelatedExternalTemplates(template);

    return (
        <CreateManagerProvider>
            <TopBar />
            <main className="h-[calc(100vh-64px)] w-full overflow-y-auto px-6 py-8">
                <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
                    <Button asChild variant="ghost" className="w-fit">
                        <Link href={Routes.NEW_PROJECT}>
                            <Icons.ArrowLeft className="h-4 w-4" />
                            Back to new project
                        </Link>
                    </Button>

                    <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
                        <div className="border-foreground/8 bg-background/80 flex flex-col justify-between rounded-3xl border p-7 backdrop-blur-xl">
                            <div className="flex flex-col gap-5">
                                <div
                                    className={`rounded-[26px] bg-gradient-to-br ${template.gradientClassName} p-6`}
                                >
                                    <div className="mb-16 flex flex-wrap gap-2">
                                        {template.tags.map((tag) => (
                                            <span
                                                key={tag}
                                                className="text-mini rounded-full bg-white/10 px-3 py-1 text-white/80"
                                            >
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                    <p
                                        className={`text-sm font-medium ${template.accentClassName}`}
                                    >
                                        {template.category}
                                    </p>
                                    <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white">
                                        {template.name}
                                    </h1>
                                </div>

                                <div>
                                    <p className="text-foreground-secondary text-base leading-7">
                                        {template.description}
                                    </p>
                                    <p className="text-foreground-tertiary mt-4 text-sm leading-6">
                                        <span className="text-foreground-secondary">
                                            Best for:{' '}
                                        </span>
                                        {template.bestFor}
                                    </p>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {template.tags.map((tag) => (
                                        <Badge key={tag} variant="secondary">
                                            {tag}
                                        </Badge>
                                    ))}
                                </div>
                            </div>

                            <ExternalTemplateActions
                                template={template}
                                size="lg"
                                className="mt-8 flex flex-wrap items-center gap-2"
                            />
                        </div>

                        <div className="border-foreground/8 bg-background/80 overflow-hidden rounded-3xl border backdrop-blur-xl">
                            <div className="border-foreground/8 flex items-center justify-between border-b px-5 py-3">
                                <div>
                                    <p className="text-foreground text-sm font-medium">
                                        Live preview
                                    </p>
                                    <p className="text-foreground-tertiary text-xs">
                                        {isNonEmbeddable(template.previewUrl)
                                            ? "This template's preview can't be embedded — open it in a new tab."
                                            : 'If the embed is blocked, open the preview in a new tab.'}
                                    </p>
                                </div>
                                <Button asChild variant="outline" size="sm">
                                    <a href={template.previewUrl} target="_blank" rel="noreferrer">
                                        Open preview
                                        <Icons.ExternalLink className="h-4 w-4" />
                                    </a>
                                </Button>
                            </div>
                            {isNonEmbeddable(template.previewUrl) ? (
                                // Skip the iframe entirely for hosts that
                                // refuse to be embedded (e.g. vercel.com
                                // marketing pages). Embedding them would
                                // produce a chrome-error page in the
                                // iframe and a noisy console error every
                                // time this template is opened.
                                <div className="bg-background flex h-[320px] w-full flex-col items-center justify-center gap-3 px-6 text-center">
                                    <Icons.ExternalLink className="text-foreground-tertiary h-5 w-5" />
                                    <p className="text-foreground-tertiary max-w-sm text-xs leading-relaxed">
                                        Live preview unavailable for this template. Use{' '}
                                        <span className="text-foreground">Open preview</span> to
                                        view it in a new tab.
                                    </p>
                                </div>
                            ) : (
                                <iframe
                                    title={`${template.name} preview`}
                                    src={template.previewUrl}
                                    className="bg-background h-[620px] w-full"
                                    loading="lazy"
                                    referrerPolicy="no-referrer"
                                    sandbox="allow-scripts allow-same-origin allow-forms"
                                />
                            )}
                        </div>
                    </section>

                    <section className="grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
                        <div className="border-foreground/8 bg-background/70 rounded-3xl border p-6 backdrop-blur-xl">
                            <h2 className="text-foreground text-xl font-medium">
                                What this includes
                            </h2>
                            <ul className="mt-4 space-y-3">
                                {template.highlights.map((highlight) => (
                                    <li
                                        key={highlight}
                                        className="text-foreground-secondary flex gap-3 text-sm leading-6"
                                    >
                                        <Icons.CheckCircled className="text-foreground-success mt-0.5 h-4 w-4 flex-shrink-0" />
                                        {highlight}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="border-foreground/8 bg-background/70 rounded-3xl border p-6 backdrop-blur-xl">
                            <h2 className="text-foreground text-xl font-medium">Source</h2>
                            <div className="mt-4 flex flex-col gap-3 text-sm">
                                <a
                                    href={template.sourceUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-foreground-secondary hover:text-foreground border-foreground/8 bg-foreground/4 flex items-center justify-between rounded-2xl border px-4 py-3 transition-colors"
                                >
                                    Template page or source
                                    <Icons.ExternalLink className="h-4 w-4" />
                                </a>
                                <a
                                    href={template.repoUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-foreground-secondary hover:text-foreground border-foreground/8 bg-foreground/4 flex items-center justify-between rounded-2xl border px-4 py-3 transition-colors"
                                >
                                    Repository
                                    <Icons.ExternalLink className="h-4 w-4" />
                                </a>
                            </div>
                        </div>
                    </section>

                    <ExternalTemplates
                        templates={relatedTemplates}
                        title="Related templates"
                        description="Templates with similar use cases or overlapping Next.js patterns."
                    />
                </div>
            </main>
        </CreateManagerProvider>
    );
}
