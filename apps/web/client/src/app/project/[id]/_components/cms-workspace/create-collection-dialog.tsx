'use client';

import { useEffect, useState } from 'react';
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

import { useEditorEngine } from '@/components/store/editor';
import { transKeys } from '@/i18n/keys';
import { api } from '@/trpc/react';

export const CreateCollectionDialog = observer(() => {
    const editorEngine = useEditorEngine();
    const projectId = editorEngine.projectId;
    const open = editorEngine.state.cmsCreateCollectionOpen;
    const t = useTranslations();

    const [name, setName] = useState('');
    const [slug, setSlug] = useState('');
    const [description, setDescription] = useState('');

    const utils = api.useUtils();
    const createMutation = api.cms.collection.create.useMutation();

    useEffect(() => {
        if (!open) {
            setName('');
            setSlug('');
            setDescription('');
        }
    }, [open]);

    const slugFromName = (n: string): string =>
        n
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9-]+/g, '-')
            .replace(/^-+|-+$/g, '');

    const handleCreate = async () => {
        if (!projectId) return;
        const finalSlug = slug.trim() || slugFromName(name);
        if (!name.trim() || !finalSlug) {
            toast.error(t(transKeys.cms.collections.create.nameRequired));
            return;
        }
        try {
            const created = await createMutation.mutateAsync({
                projectId,
                name: name.trim(),
                slug: finalSlug,
                description: description.trim() || undefined,
            });
            await utils.cms.collection.list.invalidate({ projectId });
            await utils.cms.source.list.invalidate({ projectId });
            toast.success(t(transKeys.cms.collections.create.success));
            editorEngine.state.setCmsCreateCollectionOpen(false);
            editorEngine.state.setCmsSelectedCollectionId(created.id);
            // Land them in Fields so they can define the schema next.
            editorEngine.state.setCmsTab(CmsTabValue.FIELDS);
        } catch (err) {
            toast.error(
                err instanceof Error ? err.message : t(transKeys.cms.collections.create.failed),
            );
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
                    <Button onClick={handleCreate} disabled={createMutation.isPending}>
                        {t(transKeys.cms.collections.create.create)}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
});
