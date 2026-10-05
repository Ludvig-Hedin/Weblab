import type { Infer } from 'convex/values';
import type { JournalItem } from '@convex/lib/cloudStudioContent';
import type { journalOperation } from '@convex/cloudEditorStudioSchema';
type JournalOperation = Infer<typeof journalOperation>;

export interface CloudJournalDraft {
    version: 1; projectId: string; branchId: string; actorId: string; generation: number;
    writerId: string; changeId: string; updatedAt: number;
    ancestors: Array<{ writerId: string; changeId: string }>;
    item: JournalItem; original: JournalItem;
}
type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;
const MAX_DRAFT_COPIES = 20;
export function journalDraftKey(scope: { projectId: string; branchId: string }, actorId: string, writerId?: string): string {
    const prefix = `weblab.cloud-journal-draft.v1:${JSON.stringify([scope.projectId, scope.branchId, actorId])}`;
    return writerId ? `${prefix}:${writerId}` : prefix;
}
function isJournalDraftItem(value: unknown): value is JournalItem {
    if (!value || typeof value !== 'object') return false;
    const item = value as Partial<JournalItem>;
    const values = item.values;
    return typeof item.key === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(item.key)
        && typeof item.slug === 'string' && item.slug.length <= 64
        && typeof item.revision === 'number' && Number.isSafeInteger(item.revision) && item.revision >= 0
        && (item.status === 'draft' || item.status === 'ready') && typeof item.archived === 'boolean'
        && !!values && typeof values.title === 'string' && values.title.length <= 160
        && typeof values.excerpt === 'string' && values.excerpt.length <= 500
        && typeof values.body === 'string' && values.body.length <= 30_000
        && (!values.cover || (typeof values.cover.path === 'string' && values.cover.path.length <= 240
            && typeof values.cover.alt === 'string' && values.cover.alt.length <= 500));
}
function recoveryId(value: unknown): value is string { return typeof value === 'string' && /^[a-zA-Z0-9_-]{16,80}$/.test(value); }
function parseJournalDraft(raw: string, scope: { projectId: string; branchId: string }, actorId: string): CloudJournalDraft {
    if (raw.length > 150_000) throw new Error('CLOUD_STUDIO_DRAFT_INVALID');
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') throw new Error('CLOUD_STUDIO_DRAFT_INVALID');
    const draft = value as Partial<CloudJournalDraft>;
    if (draft.version !== 1 || draft.projectId !== scope.projectId || draft.branchId !== scope.branchId || draft.actorId !== actorId
        || typeof draft.generation !== 'number' || !Number.isSafeInteger(draft.generation) || draft.generation < 1
        || !recoveryId(draft.writerId) || !recoveryId(draft.changeId) || typeof draft.updatedAt !== 'number' || !Number.isFinite(draft.updatedAt)
        || !Array.isArray(draft.ancestors) || draft.ancestors.length > MAX_DRAFT_COPIES
        || draft.ancestors.some(ancestor => !ancestor || !recoveryId(ancestor.writerId) || !recoveryId(ancestor.changeId))
        || !isJournalDraftItem(draft.item) || !isJournalDraftItem(draft.original) || draft.item.key !== draft.original.key
        || draft.item.revision !== draft.original.revision) throw new Error('CLOUD_STUDIO_DRAFT_INVALID');
    return draft as CloudJournalDraft;
}
function immutableKey(scope: { projectId: string; branchId: string }, actorId: string, writerId: string, changeId: string): string {
    return `${journalDraftKey(scope, actorId)}:change:${writerId}:${changeId}`;
}
function acknowledgedKey(scope: { projectId: string; branchId: string }, actorId: string, writerId: string, changeId: string): string {
    return `${journalDraftKey(scope, actorId)}:ack:${writerId}:${changeId}`;
}
function pointer(raw: string | null): { changeId: string } | null {
    if (!raw || raw.length > 200) return null;
    try {
        const value: unknown = JSON.parse(raw);
        if (value && typeof value === 'object' && 'version' in value && value.version === 2
            && 'changeId' in value && recoveryId(value.changeId)) return { changeId: value.changeId };
    } catch { /* Earlier mutable drafts and malformed records remain recoverable. */ }
    return null;
}
/** Logical current copies only. Lightweight indices and acknowledgment markers do not use the active-copy allowance. */
export function journalDraftEntries(storage: DraftStorage, scope: { projectId: string; branchId: string }, actorId: string): Array<{ key: string; raw: string }> {
    const prefix = journalDraftKey(scope, actorId), entries: Array<{ key: string; raw: string }> = [];
    for (let index = 0; index < storage.length; index++) {
        const writerKey = storage.key(index);
        if (!writerKey || (writerKey !== prefix && (!writerKey.startsWith(prefix + ':') || !recoveryId(writerKey.slice(prefix.length + 1))))) continue;
        let raw = storage.getItem(writerKey);
        if (!raw || storage.getItem(writerKey + ':ignored') === raw) continue;
        const current = pointer(raw);
        let key = writerKey;
        if (current) {
            const writerId = writerKey.slice(prefix.length + 1);
            if (storage.getItem(acknowledgedKey(scope, actorId, writerId, current.changeId))) continue;
            key = immutableKey(scope, actorId, writerId, current.changeId);
            raw = storage.getItem(key);
            if (!raw) continue;
        } else {
            try {
                const legacy = parseJournalDraft(raw, scope, actorId);
                if (storage.getItem(acknowledgedKey(scope, actorId, legacy.writerId, legacy.changeId))) continue;
            } catch { /* Return unknown data for download or explicit dismissal. */ }
        }
        if (storage.getItem(key + ':ignored') === raw) continue;
        entries.push({ key, raw });
        if (entries.length > MAX_DRAFT_COPIES) return entries;
    }
    return entries;
}
/** Enumerate all writers; never silently replace one tab's draft with another's. */
export function listJournalDrafts(storage: DraftStorage, scope: { projectId: string; branchId: string }, actorId: string): CloudJournalDraft[] {
    const entries = journalDraftEntries(storage, scope, actorId);
    if (entries.length > MAX_DRAFT_COPIES) throw new Error('CLOUD_STUDIO_DRAFT_LIMIT');
    return entries.map(entry => {
        const draft = parseJournalDraft(entry.raw, scope, actorId);
        if (entry.key !== journalDraftKey(scope, actorId, draft.writerId)
            && entry.key !== immutableKey(scope, actorId, draft.writerId, draft.changeId)) throw new Error('CLOUD_STUDIO_DRAFT_INVALID');
        return draft;
    }).sort((a, b) => b.updatedAt - a.updatedAt);
}
/** Only this opening writes its random writer ID. New text gets an immutable change key before the pointer moves. */
export function writeJournalDraft(storage: DraftStorage, draft: CloudJournalDraft): void {
    if (draft.ancestors.length > MAX_DRAFT_COPIES) throw new Error('CLOUD_STUDIO_DRAFT_LIMIT');
    const writerKey = journalDraftKey(draft, draft.actorId, draft.writerId);
    const changeKey = immutableKey(draft, draft.actorId, draft.writerId, draft.changeId);
    const raw = JSON.stringify(draft), existing = storage.getItem(changeKey);
    if ((existing !== null && existing !== raw) || storage.getItem(acknowledgedKey(draft, draft.actorId, draft.writerId, draft.changeId)))
        throw new Error('CLOUD_STUDIO_DRAFT_CHANGE_REUSED');
    const active = journalDraftEntries(storage, draft, draft.actorId);
    if (!active.some(entry => entry.key === writerKey || entry.key.startsWith(`${journalDraftKey(draft, draft.actorId)}:change:${draft.writerId}:`))
        && active.length >= MAX_DRAFT_COPIES) throw new Error('CLOUD_STUDIO_DRAFT_LIMIT');
    const previous = pointer(storage.getItem(writerKey));
    storage.setItem(changeKey, raw);
    try { storage.setItem(writerKey, JSON.stringify({ version: 2, changeId: draft.changeId })); }
    catch (error) {
        // The new immutable record was not admitted. Never touch the old pointer or old recovery.
        if (existing === null) { try { storage.removeItem(changeKey); } catch { /* Preserve the original storage refusal. */ } }
        throw error;
    }
    // Keep one payload per active writer. These keys are immutable, so cleanup cannot erase a newer change.
    if (previous && previous.changeId !== draft.changeId) {
        try { storage.removeItem(immutableKey(draft, draft.actorId, draft.writerId, previous.changeId)); }
        catch { /* A cleanup failure cannot undo an admitted durable edit. */ }
    }
}
/** Unknown mutable records are dismissed by exact bytes, never deleted after a racy read. */
export function dismissJournalDraftEntry(storage: DraftStorage, entry: { key: string; raw: string }): void {
    storage.setItem(entry.key + ':ignored', entry.raw);
}
function sameJournalValues(left: JournalItem['values'], right: JournalItem['values']): boolean {
    return left.title === right.title && left.excerpt === right.excerpt && left.body === right.body
        && left.cover?.path === right.cover?.path && left.cover?.alt === right.cover?.alt;
}
/** Acknowledgments address exact changes. Never remove a mutable writer index, including a legacy writer's slot. */
export function clearJournalDraft(storage: DraftStorage, draft: CloudJournalDraft): void {
    for (const change of [{ writerId: draft.writerId, changeId: draft.changeId }, ...draft.ancestors]) {
        storage.removeItem(immutableKey(draft, draft.actorId, change.writerId, change.changeId));
        storage.setItem(acknowledgedKey(draft, draft.actorId, change.writerId, change.changeId), '1');
    }
}
/** Root calls this only after a matching semantic receipt, including recovered operations. */
export function clearAcknowledgedJournalDraft(storage: DraftStorage, scope: { projectId: string; branchId: string }, actorId: string, operation: JournalOperation): void {
    for (const draft of listJournalDrafts(storage, scope, actorId)) {
        if (draft.item.key !== operation.key || draft.original.revision !== operation.expectedItemRevision) continue;
        if (operation.kind === 'save' && (draft.item.slug !== operation.slug || !sameJournalValues(draft.item.values, operation.values))) continue;
        if (operation.kind === 'restore' && operation.values && !sameJournalValues(draft.item.values, operation.values)) continue;
        if (operation.kind === 'archive' && JSON.stringify(draft.item) !== JSON.stringify(draft.original)) continue;
        clearJournalDraft(storage, draft);
    }
}
