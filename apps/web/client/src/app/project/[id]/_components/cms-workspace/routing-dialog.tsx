'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
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

import type { Id } from '@convex/_generated/dataModel';
import { transKeys } from '@/i18n/keys';

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

    const fieldsData = useQuery(
        api.cmsFields.listByCollection,
        open
            ? {
                  projectId: projectId as Id<'projects'>,
                  collectionId: collection.id as Id<'cmsCollections'>,
              }
            : 'skip',
    );
    const pagesData = useQuery(
        api.cmsCollectionPages.list,
        open ? { projectId: projectId as Id<'projects'> } : 'skip',
    );

    const existing = pagesData?.find((p) => p.collectionId === collection.id) ?? null;

    const [pagePath, setPagePath] = useState('');
    const [matchFieldKey, setMatchFieldKey] = useState('');

    // Convex live queries auto-revalidate — no useUtils equivalent needed.
    const upsertMutation = useMutation(api.cmsCollectionPages.upsert);
    const deleteMutation = useMutation(api.cmsCollectionPages.remove);
    const [isUpserting, setIsUpserting] = useState(false);
    const [isRemoving, setIsRemoving] = useState(false);

    // Pre-fill once per (open × collection), but only after the first data
    // arrival — otherwise we'd lock in empty defaults before the queries
    // resolve and permanently ignore the existing record. After init, a
    // background refetch must not overwrite the user's in-progress edits.
    // Re-arm if the parent retargets the dialog at a different collection
    // without closing first.
    const initializedRef = useRef(false);
    const lastCollectionIdRef = useRef<string | null>(null);
    useEffect(() => {
        if (!open) {
            initializedRef.current = false;
            lastCollectionIdRef.current = null;
            return;
        }
        if (lastCollectionIdRef.current !== collection.id) {
            initializedRef.current = false;
            lastCollectionIdRef.current = collection.id;
        }
        if (initializedRef.current) return;
        // Wait for both queries to actually have data — Convex returns `undefined`
        // while loading; using stale cache here would freeze in stale defaults.
        if (pagesData === undefined || fieldsData === undefined) return;
        initializedRef.current = true;
        if (existing) {
            setPagePath(existing.pagePath);
            setMatchFieldKey(existing.matchFieldKey);
            return;
        }
        // Defaults: /<slug>/[slug] is the most common pattern.
        setPagePath(`/${collection.slug}/[slug]`);
        // Prefer a `slug` field when present.
        const fields = fieldsData ?? [];
        const slugField =
            fields.find((f) => f.key === 'slug') ?? fields.find((f) => f.type === 'slug');
        setMatchFieldKey(slugField?.key ?? fields[0]?.key ?? '');
    }, [open, existing, fieldsData, pagesData, collection.id, collection.slug]);

    const fields = fieldsData ?? [];

    const handleSave = async () => {
        if (!pagePath.trim()) {
            // No dedicated i18n key yet; matches the hardcoded-string pattern
            // used elsewhere in the CMS surface (tracked for an i18n batch).
            toast.error('Page path is required');
            return;
        }
        if (!matchFieldKey) {
            toast.error(t(transKeys.cms.routing.pickFieldFirst));
            return;
        }
        // TODO(bug-hunt): convex/cmsCollectionPages.ts upsert() only
        // validates matchFieldKey length (1-64), not that the key
        // actually exists in the collection's fields. cmsFields.remove
        // doesn't touch cmsCollectionPages either, so deleting a field
        // that's referenced as matchFieldKey leaves a stale page
        // registration where URL → item resolution silently fails (no
        // item ever matches the missing key). Either validate
        // existence server-side at upsert, OR cascade-clear matchFieldKey
        // (to '' or the first remaining field) when fields.remove drops
        // the key it points at.
        setIsUpserting(true);
        try {
            await upsertMutation({
                projectId: projectId as Id<'projects'>,
                collectionId: collection.id as Id<'cmsCollections'>,
                pagePath: pagePath.trim(),
                matchFieldKey,
            });
            // Convex live queries auto-revalidate — no manual invalidate needed.
            toast.success(t(transKeys.cms.routing.saved));
            onOpenChange(false);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t(transKeys.cms.routing.saveFailed));
        } finally {
            setIsUpserting(false);
        }
    };

    const handleRemove = async () => {
        if (!existing) return;
        setIsRemoving(true);
        try {
            const result = await deleteMutation({
                projectId: projectId as Id<'projects'>,
                id: existing._id,
            });
            // Convex live queries auto-revalidate — no manual invalidate needed.
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
        } finally {
            setIsRemoving(false);
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
                                    <SelectItem key={f._id} value={f.key}>
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
                                disabled={isRemoving || isUpserting}
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
                            disabled={
                                isUpserting || isRemoving || !pagePath.trim() || !matchFieldKey
                            }
                        >
                            {t(transKeys.cms.routing.save)}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
