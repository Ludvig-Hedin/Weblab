'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import type { CmsCollection } from '@weblab/db';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import { toast } from '@weblab/ui/sonner';

import { transKeys } from '@/i18n/keys';
import { api } from '@/trpc/react';

interface Props {
    projectId: string;
    collection: CmsCollection;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/**
 * Register the page that hosts a collection's detail view, e.g. mark
 * `/blog/[slug]` as the detail page for the Blog collection. The dynamic
 * segment maps onto `matchFieldKey`. v4 uses an editor-picked "current
 * item" at preview time; URL-segment matching is deferred to v4.1.
 */
export const RoutingDialog = ({ projectId, collection, open, onOpenChange }: Props) => {
    const t = useTranslations();

    const fieldsQuery = api.cms.field.listByCollection.useQuery(
        { projectId, collectionId: collection.id },
        { enabled: open },
    );
    const pagesQuery = api.cms.collectionPage.list.useQuery({ projectId }, { enabled: open });

    const existing = pagesQuery.data?.find((p) => p.collectionId === collection.id) ?? null;

    const [pagePath, setPagePath] = useState('');
    const [matchFieldKey, setMatchFieldKey] = useState('');

    const utils = api.useUtils();
    const upsertMutation = api.cms.collectionPage.upsert.useMutation();
    const deleteMutation = api.cms.collectionPage.delete.useMutation();

    useEffect(() => {
        if (!open) return;
        if (existing) {
            setPagePath(existing.pagePath);
            setMatchFieldKey(existing.matchFieldKey);
            return;
        }
        // Defaults: /<slug>/[slug] is the most common pattern.
        setPagePath(`/${collection.slug}/[slug]`);
        // Prefer a `slug` field when present.
        const fields = fieldsQuery.data ?? [];
        const slugField =
            fields.find((f) => f.key === 'slug') ?? fields.find((f) => f.type === 'slug');
        setMatchFieldKey(slugField?.key ?? fields[0]?.key ?? '');
    }, [open, existing, fieldsQuery.data, collection.slug]);

    const fields = fieldsQuery.data ?? [];

    const handleSave = async () => {
        if (!matchFieldKey) {
            toast.error(t(transKeys.cms.routing.pickFieldFirst));
            return;
        }
        try {
            await upsertMutation.mutateAsync({
                projectId,
                collectionId: collection.id,
                pagePath: pagePath.trim(),
                matchFieldKey,
            });
            await utils.cms.collectionPage.list.invalidate({ projectId });
            toast.success(t(transKeys.cms.routing.saved));
            onOpenChange(false);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t(transKeys.cms.routing.saveFailed));
        }
    };

    const handleRemove = async () => {
        if (!existing) return;
        try {
            const result = await deleteMutation.mutateAsync({ projectId, id: existing.id });
            await utils.cms.collectionPage.list.invalidate({ projectId });
            await utils.cms.binding.snapshot.invalidate({ projectId });
            toast.success(t(transKeys.cms.routing.removed));
            // Warn about now-orphaned PAGE_ITEM_FIELD bindings (BUG #8 from review).
            if (result?.orphanedBindingCount && result.orphanedBindingCount > 0) {
                toast.warning(
                    `${result.orphanedBindingCount} binding(s) point to a page that no longer exists.`,
                );
            }
            onOpenChange(false);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t(transKeys.cms.routing.removeFailed));
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t(transKeys.cms.routing.title)}</DialogTitle>
                    <DialogDescription>
                        {existing
                            ? // We avoid ICU placeholder interpolation here because
                              // adding new placeholder keys requires a project build
                              // to refresh next-intl's TypeScript declarations.
                              `${collection.name} → ${existing.pagePath} · ${existing.matchFieldKey}`
                            : t(transKeys.cms.routing.noneBody)}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="routing-path">
                            {t(transKeys.cms.routing.pagePathLabel)}
                        </Label>
                        <Input
                            id="routing-path"
                            value={pagePath}
                            onChange={(e) => setPagePath(e.target.value)}
                            placeholder={t(transKeys.cms.routing.pagePathPlaceholder)}
                        />
                        <p className="text-foreground-tertiary text-mini">
                            {t(transKeys.cms.routing.pagePathHelp)}
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="routing-field">
                            {t(transKeys.cms.routing.matchFieldLabel)}
                        </Label>
                        <Select
                            value={matchFieldKey}
                            onValueChange={setMatchFieldKey}
                            disabled={fields.length === 0}
                        >
                            <SelectTrigger id="routing-field">
                                <SelectValue
                                    placeholder={t(transKeys.cms.routing.pickFieldFirst)}
                                />
                            </SelectTrigger>
                            <SelectContent>
                                {fields.map((f) => (
                                    <SelectItem key={f.id} value={f.key}>
                                        {f.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-foreground-tertiary text-mini">
                            {t(transKeys.cms.routing.matchFieldHelp)}
                        </p>
                    </div>
                </div>

                <DialogFooter className="flex-row justify-between sm:justify-between">
                    <div>
                        {existing ? (
                            <Button
                                variant="ghost"
                                className="text-red"
                                onClick={() => void handleRemove()}
                                disabled={deleteMutation.isPending}
                            >
                                {t(transKeys.cms.routing.remove)}
                            </Button>
                        ) : null}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={() => onOpenChange(false)}>
                            {t(transKeys.cms.bind.cancel)}
                        </Button>
                        <Button
                            onClick={() => void handleSave()}
                            disabled={upsertMutation.isPending || !pagePath.trim()}
                        >
                            {t(transKeys.cms.routing.save)}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
