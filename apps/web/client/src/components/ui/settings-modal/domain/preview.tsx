import { useState } from 'react';
import Link from 'next/link';
import { api } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { toast } from '@weblab/ui/sonner';
import { getValidUrl } from '@weblab/utility';

import type { Id } from '@convex/_generated/dataModel';
import { useEditorEngine } from '@/components/store/editor';

export const PreviewDomain = observer(() => {
    const t = useTranslations();
    const editorEngine = useEditorEngine();
    const projectId = editorEngine.projectId as Id<'projects'>;

    const data = useQuery(api.domains.previewSlugGet, { projectId });
    const setPreviewSlug = useMutation(api.domains.setPreviewSlug);

    const [draft, setDraft] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const savedSlug = data?.slug ?? '';
    const hostingDomain = data?.hostingDomain ?? 'weblab.app';
    const publishedDomain = data?.publishedDomain ?? null;

    // `draft` overrides the saved value only once the user starts typing
    // (empty string is intentional input, so check for null, not falsiness).
    const value = draft ?? savedSlug;
    const isDirty = value.trim() !== savedSlug;
    const canSave = isDirty && value.trim().length > 0 && !isSaving;

    const handleSave = async () => {
        if (!canSave) return;
        setIsSaving(true);
        try {
            const res = await setPreviewSlug({ projectId, slug: value.trim() });
            setDraft(null);
            toast.success(t('settings.domain.base.saved', { domain: res.fullDomain }));
        } catch (error) {
            // Mutation throws `Error('BAD_REQUEST: <message>')`; surface the
            // human-readable part, falling back to a generic message.
            const raw = error instanceof Error ? error.message : '';
            const message = /BAD_REQUEST:\s*([^\n]+)/.exec(raw)?.[1]?.trim();
            toast.error(
                message && message.length > 0 ? message : t('settings.domain.base.saveError'),
            );
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex flex-col space-y-4">
            <h2 className="text-largePlus">{t('settings.domain.base.title')}</h2>
            <div className="flex items-start justify-between gap-2">
                <div className="w-1/3">
                    <p className="text-regularPlus text-muted-foreground">
                        {t('settings.domain.base.label')}
                    </p>
                    <p className="text-small text-muted-foreground">
                        {t('settings.domain.base.helper')}
                    </p>
                </div>
                <div className="flex flex-1 flex-col gap-3">
                    <div className="flex items-center gap-2">
                        <div className="flex flex-1 items-center gap-1.5">
                            <Input
                                value={value}
                                onChange={(e) => setDraft(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') void handleSave();
                                }}
                                placeholder={t('settings.domain.base.placeholder')}
                                className="bg-background flex-1"
                                spellCheck={false}
                                autoCapitalize="off"
                                autoCorrect="off"
                            />
                            <span className="text-small text-muted-foreground whitespace-nowrap">
                                .{hostingDomain}
                            </span>
                        </div>
                        <Button
                            variant="secondary"
                            size="sm"
                            className="h-9"
                            onClick={() => void handleSave()}
                            disabled={!canSave}
                        >
                            {isSaving && (
                                <Icons.LoadingSpinner className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            {t('settings.domain.base.save')}
                        </Button>
                    </div>

                    {publishedDomain ? (
                        <div className="text-small text-muted-foreground flex items-center gap-2">
                            <span>{t('settings.domain.base.liveAt')}</span>
                            <Link
                                href={getValidUrl(publishedDomain)}
                                target="_blank"
                                className="text-foreground inline-flex items-center gap-1 hover:underline"
                            >
                                {publishedDomain}
                                <Icons.ExternalLink className="h-3 w-3" />
                            </Link>
                        </div>
                    ) : (
                        <p className="text-small text-muted-foreground">
                            {t('settings.domain.base.notPublished')}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
});
