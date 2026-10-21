import { Transaction, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

export type CodeDraftPreflight = (path: string, content: string, external: boolean, previous: string, apply: () => void, applied: () => boolean) => boolean;

/** Guard the public final dispatch, including commands that disable filters. */
export function installCodeDraftDispatch(view: Pick<EditorView, 'state' | 'dispatch'>, path: string, options: {
    isCurrent: () => boolean;
    isExternal: (transaction: Transaction) => boolean;
    preflight: CodeDraftPreflight;
    accepted: (content: string) => void;
    failed: () => void;
}): void {
    const forward = view.dispatch.bind(view);
    let forwarding = false;
    view.dispatch = (...input: (Transaction | readonly Transaction[] | TransactionSpec)[]) => {
        const start = view.state;
        let finalContent = start.doc.toString();
        try {
            if (forwarding || !options.isCurrent()) throw new Error('Stale editor dispatch');
            const transactions: readonly Transaction[] = input.length === 1 && input[0] instanceof Transaction
                ? [input[0]] : input.length === 1 && Array.isArray(input[0]) ? input[0] as readonly Transaction[]
                    : [start.update(...input as TransactionSpec[])];
            let expected = start;
            for (const transaction of transactions) {
                if (transaction.startState !== expected) throw new Error('Stale transaction');
                expected = transaction.state;
            }
            const changed = transactions.filter((transaction) => transaction.docChanged);
            const final = transactions[transactions.length - 1];
            const apply = () => { forwarding = true; try { forward(transactions); } finally { forwarding = false; } };
            if (!changed.length || !final) { apply(); return; }
            const external = changed.some(options.isExternal);
            if (external && changed.some((transaction) => !options.isExternal(transaction))) throw new Error('Mixed document origins');
            finalContent = final.newDoc.toString();
            const applied = () => view.state !== start && view.state.doc.toString() === finalContent;
            if (options.preflight(path, finalContent, external, start.doc.toString(), apply, applied) && applied()) options.accepted(finalContent);
        } catch {
            if (view.state !== start && view.state.doc.toString() === finalContent) options.accepted(finalContent);
            options.failed();
        }
    };
}

export interface CodeDraftScope { userId: string; projectId: string; branchId: string }
export type DraftSourceConflict = 'unknown' | 'changed' | 'missing' | null;
export interface CodeDraftPrevious { content: string; originalHash: string; sourceConflict: DraftSourceConflict }
export interface CodeDraftFile { path: string; content: string; originalHash: string; revision: number; sourceConflict: DraftSourceConflict; previous?: CodeDraftPrevious }
export interface CodeDraftRecord { version: 1; scope: CodeDraftScope; writerId: string; revision: number; updatedAt: number; files: CodeDraftFile[] }
export interface CodeDraftStorage {
    readonly length: number;
    key(index: number): string | null;
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}
export const MAX_DRAFT_FILE_BYTES = 256 * 1024;
export const MAX_DRAFT_RECORD_BYTES = 1024 * 1024;
export const MAX_DRAFT_FILES = 16;
const PREFIX = 'weblab:code-drafts:v1:';
const bytes = (value: string) => new TextEncoder().encode(value).byteLength;
const validId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256;
export const sameDraftScope = (a: CodeDraftScope, b: CodeDraftScope) => a.userId === b.userId && a.projectId === b.projectId && a.branchId === b.branchId;
export function codeDraftKey(scope: CodeDraftScope, writerId: string): string {
    if (![scope.userId, scope.projectId, scope.branchId, writerId].every(validId)) throw new Error('Invalid draft scope');
    return PREFIX + JSON.stringify([scope.userId, scope.projectId, scope.branchId, writerId]);
}
function validPath(path: unknown): path is string {
    return typeof path === 'string' && path.length > 0 && path.length <= 2048 && !/[\u0000-\u001f\\]/.test(path)
        && !path.split('/').includes('..');
}
export function parseCodeDraft(raw: string | null): CodeDraftRecord | null {
    if (!raw || bytes(raw) > MAX_DRAFT_RECORD_BYTES) return null;
    try {
        const value = JSON.parse(raw) as CodeDraftRecord;
        if (value.version !== 1 || !value.scope || ![value.scope.userId, value.scope.projectId, value.scope.branchId, value.writerId].every(validId)
            || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Number.isFinite(value.updatedAt)
            || !Array.isArray(value.files) || value.files.length > MAX_DRAFT_FILES) return null;
        const paths = new Set<string>();
        for (const file of value.files) {
            if (!file || !validPath(file.path) || paths.has(file.path) || typeof file.content !== 'string' || bytes(file.content) > MAX_DRAFT_FILE_BYTES
                || !/^[a-f0-9]{64}$/.test(file.originalHash) || !Number.isSafeInteger(file.revision) || file.revision < 1 || file.revision > value.revision
                || ![null, 'unknown', 'changed', 'missing'].includes(file.sourceConflict)) return null;
            paths.add(file.path);
            if (file.previous !== undefined) {
                const previous = file.previous;
                if (!previous || Object.keys(previous).some((key) => !['content', 'originalHash', 'sourceConflict'].includes(key))
                    || typeof previous.content !== 'string' || bytes(previous.content) > MAX_DRAFT_FILE_BYTES || !/^[a-f0-9]{64}$/.test(previous.originalHash)
                    || ![null, 'unknown', 'changed', 'missing'].includes(previous.sourceConflict)) return null;
            }
        }
        return value;
    } catch { return null; }
}
export function listCodeDrafts(storage: CodeDraftStorage, scope: CodeDraftScope): { records: CodeDraftRecord[]; unreadable: boolean } {
    const records: CodeDraftRecord[] = [];
    let unreadable = false;
    const scopePrefix = PREFIX + JSON.stringify([scope.userId, scope.projectId, scope.branchId]).slice(0, -1) + ',';
    for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key?.startsWith(scopePrefix)) continue;
        const record = parseCodeDraft(storage.getItem(key));
        if (!record || !sameDraftScope(record.scope, scope) || codeDraftKey(record.scope, record.writerId) !== key) { unreadable = true; continue; }
        if (record.files.length) records.push(record);
    }
    records.sort((a, b) => b.updatedAt - a.updatedAt);
    return { records, unreadable };
}

/** Each mounted editor writes only its random session's atomic record. */
export class CodeDraftSession {
    private record: CodeDraftRecord;
    private raw: string | null = null;
    readonly key: string;
    constructor(private storage: CodeDraftStorage, readonly scope: CodeDraftScope, writerId: string) {
        this.key = codeDraftKey(scope, writerId);
        if (storage.getItem(this.key) !== null) throw new Error('Draft session already exists');
        this.record = { version: 1, scope: { ...scope }, writerId, revision: 0, updatedAt: Date.now(), files: [] };
    }
    private assertOwner(owner: string | null) {
        if (owner !== this.scope.userId) throw new Error('Draft owner changed');
    }
    private commit(owner: string | null, files: CodeDraftFile[], revision: number): void {
        this.assertOwner(owner);
        const next: CodeDraftRecord = { ...this.record, revision, updatedAt: Date.now(), files };
        const raw = JSON.stringify(next);
        if (!parseCodeDraft(raw)) throw new Error('Draft exceeds the protected size limit');
        if (this.storage.getItem(this.key) !== this.raw) throw new Error('Draft session changed outside this editor');
        this.storage.setItem(this.key, raw);
        this.record = next;
        this.raw = raw;
    }
    file(path: string): CodeDraftFile | undefined {
        const file = this.record.files.find((file) => file.path === path);
        return file ? { ...file, ...(file.previous ? { previous: { ...file.previous } } : {}) } : undefined;
    }
    checkpoint(owner: string | null, file: Omit<CodeDraftFile, 'revision'>): CodeDraftFile {
        const next = { ...file, revision: this.record.revision + 1 };
        this.commit(owner, [...this.record.files.filter((old) => old.path !== file.path), next], next.revision);
        return next;
    }
    recover(owner: string | null, source: CodeDraftRecord, path: string, previous = false): CodeDraftFile {
        this.assertOwner(owner);
        if (!sameDraftScope(source.scope, this.scope)) throw new Error('Recovery scope changed');
        const file = source.files.find((file) => file.path === path);
        if (!file) throw new Error('Recovery file missing');
        if (this.file(path)) throw new Error('Save or discard the current draft before recovering another version');
        if (previous && !file.previous) throw new Error('Previous accepted version missing');
        return this.checkpoint(owner, { ...file, ...(previous ? file.previous : {}), previous: undefined, sourceConflict: 'unknown' });
    }
    applyDocument(owner: string | null, file: Omit<CodeDraftFile, 'revision'>, previousContent: string, apply: () => void, applied: () => boolean): boolean {
        const before = this.record;
        this.checkpoint(owner, { ...file, previous: { content: previousContent, originalHash: file.originalHash, sourceConflict: file.sourceConflict } });
        try { apply(); return true; }
        catch (error) {
            // A view update can throw after application. Its accepted new doc
            // already has a durable checkpoint and must not be rolled back.
            if (applied()) throw error;
            try { this.commit(owner, before.files, this.record.revision + 1); }
            catch {
                // The stored candidate still includes the exact accepted prior.
                // Preserve the in-memory accepted receipt for a safe retry.
                this.record = { ...before, revision: this.record.revision };
            }
            throw error;
        }
    }
    discard(owner: string | null, path: string, revision: number): boolean {
        this.assertOwner(owner);
        if (this.file(path)?.revision !== revision) return false;
        this.commit(owner, this.record.files.filter((file) => file.path !== path), this.record.revision + 1);
        return true;
    }
    confirmSave(owner: string | null, saved: CodeDraftFile, savedHash: string): CodeDraftFile | undefined {
        this.assertOwner(owner);
        const current = this.file(saved.path);
        if (!current) return undefined;
        if (current.revision === saved.revision && current.content === saved.content) {
            this.discard(owner, saved.path, saved.revision);
            return undefined;
        }
        return this.checkpoint(owner, { ...current, originalHash: savedHash, sourceConflict: null });
    }
    verified(owner: string | null): boolean {
        this.assertOwner(owner);
        return this.raw === null ? this.record.files.length === 0 : this.storage.getItem(this.key) === this.raw;
    }
}
