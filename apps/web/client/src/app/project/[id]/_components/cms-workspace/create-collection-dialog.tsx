'use client';

import { useEffect, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useMutation } from 'convex/react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { CmsTabValue } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@weblab/ui/dialog';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { toast } from '@weblab/ui/sonner';
import { Textarea } from '@weblab/ui/textarea';

import type { Id } from '@convex/_generated/dataModel';
import { useEditorEngine } from '@/components/store/editor';
import { transKeys } from '@/i18n/keys';

export const CreateCollectionDialog = observer(() => {
    const editorEngine = useEditorEngine();
    const projectId = editorEngine.projectId;
    const open = editorEngine.state.cmsCreateCollectionOpen;
    const t = useTranslations();

    const [name, setName] = useState('');
    const [slug, setSlug] = useState('');
    const [description, setDescription] = useState('');

    // Convex live queries auto-revalidate — no useUtils equivalent needed.
    const createMutation = useMutation(api.cmsCollections.create);
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        if (!open) {
            setName('');
            setSlug('');
            setDescription('');
        }
    }, [open]);

    const slugFromName = (n: string): string =>
        // Cap at 64 to match convex/cmsCollections.ts validateSlug (1-64
        // chars). Trim trailing dash after slice so the server regex
        // (must end with [a-z0-9]) still accepts the truncated value.
        n
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9-]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 64)
            .replace(/-+$/g, '');

    const handleCreate = async () => {
        if (!projectId) return;
        // User-typed slug also gets trimmed and length-capped so we surface
        // a friendly error instead of relying on the generic server toast.
        const trimmedTypedSlug = slug.trim();
        if (trimmedTypedSlug.length > 64) {
            toast.error('Slug must be 64 characters or fewer');
            return;
        }
        const finalSlug = trimmedTypedSlug || slugFromName(name);
        if (!name.trim() || !finalSlug) {
            toast.error(t(transKeys.cms.collections.create.nameRequired));
            return;
        }
        setIsCreating(true);
        try {
            const created = await createMutation({
                projectId: projectId as Id<'projects'>,
                name: name.trim(),
                slug: finalSlug,
                description: description.trim() || undefined,
            });
            // Convex live queries auto-revalidate — no manual invalidate needed.
            toast.success(t(transKeys.cms.collections.create.success));
            editorEngine.state.setCmsCreateCollectionOpen(false);
            editorEngine.state.setCmsSelectedCollectionId(created._id);
            // Land them in Fields so they can define the schema next.
            editorEngine.state.setCmsTab(CmsTabValue.FIELDS);
        } catch (err) {
            toast.error(
                err instanceof Error ? err.message : t(transKeys.cms.collections.create.failed),
            );
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => editorEngine.state.setCmsCreateCollectionOpen(o)}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t(transKeys.cms.collections.create.title)}</DialogTitle>
                    <DialogDescription>
                        {t(transKeys.cms.collections.create.description)}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="collection-name">
                            {t(transKeys.cms.collections.create.name)}
                        </Label>
                        <Input
                            id="collection-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={t(transKeys.cms.collections.create.namePlaceholder)}
                            autoFocus
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="collection-slug">
                            {t(transKeys.cms.collections.create.slug)}
                        </Label>
                        <Input
                            id="collection-slug"
                            value={slug}
                            onChange={(e) => setSlug(e.target.value)}
                            placeholder={
                                slugFromName(name) ||
                                t(transKeys.cms.collections.create.slugPlaceholder)
                            }
                        />
                        <p className="text-foreground-tertiary text-mini">
                            {t(transKeys.cms.collections.create.slugHelp)}
                        </p>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="collection-desc">
                            {t(transKeys.cms.collections.create.descriptionLabel)}
                        </Label>
                        <Textarea
                            id="collection-desc"
                            rows={2}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button
                        variant="ghost"
                        onClick={() => editorEngine.state.setCmsCreateCollectionOpen(false)}
                    >
                        {t(transKeys.cms.collections.create.cancel)}
                    </Button>
                    <Button onClick={handleCreate} disabled={isCreating}>
                        {t(transKeys.cms.collections.create.create)}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
});
