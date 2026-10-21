import { makeFunctionReference } from 'convex/server';
import { z } from 'zod';
import type { BlogConnectionScope } from './sanity-blog-api';
import { nativeContentSelectionSchema, type NativeContentRequest } from './native-content-export';

export type ContentSelection = NativeContentRequest['selections'][number];
export interface PublicationDraft {
    id: string;
    documentId: string;
    title: string;
    slug: string;
    revision: number;
    providerRevision: string | null;
    archived: boolean;
}
export const publicationDrafts = makeFunctionReference<'query', BlogConnectionScope & { cursor?: string }, {
    items: PublicationDraft[]; cursor: string | null;
}>('cmsSanityBlog:publicationDrafts');

const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const contentStatusSchema = z.discriminatedUnion('status', [
    z.object({ status: z.literal('absent') }).strict(),
    z.object({
        status: z.enum(['prepared', 'pending', 'complete', 'needsPreparation']),
        manifestHash: hash, captureId: z.string().uuid(), contentHash: hash, draftHash: hash,
        selectedCount: z.number().int().min(0).max(8),
        connectionId: z.string().min(1).max(160), connectionRevision: z.number().int().positive().safe(),
        selections: z.array(nativeContentSelectionSchema).max(8), quoteFormUnavailable: z.literal(true),
    }).strict(),
]).refine(value => value.status === 'absent' || (value.selectedCount === value.selections.length &&
    new Set(value.selections.map(pin => pin.draftId)).size === value.selections.length), 'Invalid retained selection.');
export type ContentStatus = z.infer<typeof contentStatusSchema>;

export function publicationPin(row: PublicationDraft): ContentSelection {
    return nativeContentSelectionSchema.parse({ draftId: row.id, expectedRevision: row.revision,
        providerRevision: row.providerRevision, archived: row.archived });
}

export function matchesPublicationPin(row: PublicationDraft, pin: ContentSelection): boolean {
    return row.id === pin.draftId && row.revision === pin.expectedRevision &&
        row.providerRevision === pin.providerRevision && row.archived === pin.archived;
}

/** A selected revision survives paging and refresh. Replacing it needs a new choice. */
export function togglePublicationSelection(current: ContentSelection[], row: PublicationDraft, selected: boolean): ContentSelection[] {
    const next = current.filter(pin => pin.draftId !== row.id);
    if (!selected) return next;
    if (current.some(pin => pin.draftId === row.id)) return current;
    if (next.length >= 8) throw new Error('Select at most eight content changes.');
    return [...next, publicationPin(row)];
}
