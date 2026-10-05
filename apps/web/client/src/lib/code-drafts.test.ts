import { describe, expect, test } from 'bun:test';
import { Annotation, EditorState, Transaction, type Extension, type TransactionSpec } from '@codemirror/state';
import { history, undo } from '@codemirror/commands';
import { CodeDraftSession, codeDraftKey, installCodeDraftDispatch, listCodeDrafts, MAX_DRAFT_FILE_BYTES, parseCodeDraft, type CodeDraftStorage } from './code-drafts';
const scope = { userId: 'user-a', projectId: 'project-a', branchId: 'branch-a' };
const hash = 'a'.repeat(64);
const file = { path: '/app/page.tsx', content: 'draft', originalHash: hash, sourceConflict: null } as const;
function storage() {
    const values = new Map<string, string>();
    let fail = false;
    const store: CodeDraftStorage = { get length() { return values.size; }, key: (i) => [...values.keys()][i] ?? null,
        getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { if (fail) throw new Error('Quota'); values.set(key, value); } };
    return { store, values, fail: (value: boolean) => { fail = value; } };
}
describe('protected code draft sessions', () => {
    test('two mounted writers preserve different versions of the same file', () => {
        const { store } = storage();
        new CodeDraftSession(store, scope, 'writer-a').checkpoint(scope.userId, file);
        new CodeDraftSession(store, scope, 'writer-b').checkpoint(scope.userId, { ...file, content: 'other' });
        expect(listCodeDrafts(store, scope).records.map((record) => record.files[0]?.content).sort()).toEqual(['draft', 'other']);
    });
    test('recovery copies into a new key without changing the recovered session', () => {
        const { store, values } = storage();
        const original = new CodeDraftSession(store, scope, 'old');
        original.checkpoint(scope.userId, file);
        const oldBytes = values.get(original.key);
        const current = new CodeDraftSession(store, scope, 'new');
        const source = listCodeDrafts(store, scope).records[0]!;
        expect(current.recover(scope.userId, source, file.path).sourceConflict).toBe('unknown');
        current.checkpoint(scope.userId, { ...file, content: 'new version' });
        expect(values.get(original.key)).toBe(oldBytes);
    });
    test('scope keys and recovery never fall back across users or branches', () => {
        const { store } = storage();
        new CodeDraftSession(store, scope, 'one').checkpoint(scope.userId, file);
        const other = { ...scope, userId: 'user-b' };
        expect(listCodeDrafts(store, other).records).toEqual([]);
        expect(listCodeDrafts(store, { ...scope, branchId: 'branch-b' }).records).toEqual([]);
        const next = new CodeDraftSession(store, other, 'two');
        expect(() => next.recover('user-b', listCodeDrafts(store, scope).records[0]!, file.path)).toThrow('Recovery scope changed');
        expect(codeDraftKey({ ...scope, userId: 'a/b' }, 'id')).not.toBe(codeDraftKey({ ...scope, userId: 'a%2Fb' }, 'id'));
    });
    test('old-owner callbacks cannot checkpoint, save or discard', () => {
        const { store, values } = storage();
        const session = new CodeDraftSession(store, scope, 'one');
        const snapshot = session.checkpoint(scope.userId, file);
        const before = values.get(session.key);
        expect(() => session.checkpoint('user-b', file)).toThrow('Draft owner changed');
        expect(() => session.confirmSave(null, snapshot, hash)).toThrow('Draft owner changed');
        expect(() => session.discard('user-b', file.path, snapshot.revision)).toThrow('Draft owner changed');
        expect(values.get(session.key)).toBe(before);
    });
    test('a late save rebases newer text onto only the hash of the captured saved bytes', () => {
        const { store } = storage();
        const session = new CodeDraftSession(store, scope, 'one');
        const saved = session.checkpoint(scope.userId, file);
        session.checkpoint(scope.userId, { ...file, content: 'typed during save' });
        const next = session.confirmSave(scope.userId, saved, 'b'.repeat(64));
        expect(next?.content).toBe('typed during save');
        expect(next?.originalHash).toBe('b'.repeat(64));
        expect(session.file(file.path)).toEqual(next);
    });
    test('only an unchanged exact draft revision may be retired', () => {
        const { store } = storage();
        const session = new CodeDraftSession(store, scope, 'one');
        const old = session.checkpoint(scope.userId, file);
        const newer = session.checkpoint(scope.userId, { ...file, content: 'new' });
        expect(session.discard(scope.userId, file.path, old.revision)).toBe(false);
        expect(session.file(file.path)?.content).toBe('new');
        expect(session.discard(scope.userId, file.path, newer.revision)).toBe(true);
    });
    test('a quota refusal keeps stored bytes and the accepted draft unchanged', () => {
        const s = storage();
        const session = new CodeDraftSession(s.store, scope, 'one');
        const old = session.checkpoint(scope.userId, file);
        const before = s.values.get(session.key);
        s.fail(true);
        expect(() => session.checkpoint(scope.userId, { ...file, content: 'rejected' })).toThrow('Quota');
        expect(session.file(file.path)).toEqual(old);
        expect(s.values.get(session.key)).toBe(before);
        expect(() => session.confirmSave(scope.userId, old, hash)).toThrow('Quota');
        expect(session.file(file.path)).toEqual(old);
    });
    test('corrupt or unknown records are retained and cannot replace good sessions', () => {
        const { store, values } = storage();
        const key = codeDraftKey(scope, 'bad');
        values.set(key, '{not json');
        new CodeDraftSession(store, scope, 'good').checkpoint(scope.userId, file);
        const result = listCodeDrafts(store, scope);
        expect(result.unreadable).toBe(true);
        expect(result.records).toHaveLength(1);
        expect(values.get(key)).toBe('{not json');
        expect(() => new CodeDraftSession(store, scope, 'bad')).toThrow('already exists');
        expect(parseCodeDraft('{"version":2}')).toBeNull();
    });
    test('bounds encoded UTF8 bytes rather than just character count', () => {
        const { store } = storage();
        const session = new CodeDraftSession(store, scope, 'one');
        const old = session.checkpoint(scope.userId, file);
        expect(() => session.checkpoint(scope.userId, { ...file, content: '💙'.repeat(MAX_DRAFT_FILE_BYTES / 4 + 1) })).toThrow('size limit');
        expect(session.file(file.path)).toEqual(old);
    });
    test('source conflict and missing-file drafts retain all recovery text', () => {
        const { store } = storage();
        const session = new CodeDraftSession(store, scope, 'one');
        session.checkpoint(scope.userId, { ...file, sourceConflict: 'changed' });
        session.checkpoint(scope.userId, { ...file, sourceConflict: 'missing' });
        expect(listCodeDrafts(store, scope).records[0]?.files[0]).toMatchObject({ content: 'draft', originalHash: hash, sourceConflict: 'missing' });
    });
    test('external mutation of a session record refuses further edits', () => {
        const { store, values } = storage();
        const session = new CodeDraftSession(store, scope, 'one');
        session.checkpoint(scope.userId, file);
        values.set(session.key, 'changed externally');
        expect(session.verified(scope.userId)).toBe(false);
        expect(() => session.checkpoint(scope.userId, file)).toThrow('changed outside');
        expect(values.get(session.key)).toBe('changed externally');
    });
    test('dispatch failure and permanent rollback quota preserve the accepted prior beside the candidate', () => {
        const s = storage();
        const session = new CodeDraftSession(s.store, scope, 'one');
        session.checkpoint(scope.userId, file);
        expect(() => session.applyDocument(scope.userId, { ...file, content: 'candidate' }, 'draft', () => {
            s.fail(true);
            throw new Error('Forward refused');
        }, () => false)).toThrow('Forward refused');
        expect(session.file(file.path)?.content).toBe('draft');
        const stored = listCodeDrafts(s.store, scope).records[0]!.files[0]!;
        expect(stored.content).toBe('candidate');
        expect(stored.previous?.content).toBe('draft');
        s.fail(false);
        const recovery = new CodeDraftSession(s.store, scope, 'recovery');
        expect(recovery.recover(scope.userId, listCodeDrafts(s.store, scope).records[0]!, file.path, true).content).toBe('draft');
    });
    test('a forward error after application never rolls back the accepted newer receipt', () => {
        const { store } = storage();
        const session = new CodeDraftSession(store, scope, 'one');
        expect(() => session.applyDocument(scope.userId, file, 'before', () => { throw new Error('Plugin failed after application'); }, () => true)).toThrow();
        expect(session.file(file.path)?.content).toBe('draft');
        expect(session.file(file.path)?.previous?.content).toBe('before');
    });
});

const external = Annotation.define<boolean>();
function dispatchFixture(extensions: Extension = []) {
    const s = storage();
    const session = new CodeDraftSession(s.store, scope, crypto.randomUUID());
    let state = EditorState.create({ doc: 'base', extensions });
    let accepted = 'base';
    let owner: string | null = scope.userId;
    let failed = 0;
    const view = {
        get state() { return state; },
        dispatch(...input: (Transaction | readonly Transaction[] | TransactionSpec)[]) {
            const transactions = input.length === 1 && input[0] instanceof Transaction ? [input[0]]
                : input.length === 1 && Array.isArray(input[0]) ? input[0] as readonly Transaction[] : [state.update(...input as TransactionSpec[])];
            for (const transaction of transactions) state = transaction.state;
        },
    };
    const options = {
        isCurrent: () => true,
        isExternal: (transaction: Transaction) => transaction.annotation(external) === true,
        preflight: (_path: string, content: string, isExternal: boolean, previous: string, apply: () => void, applied: () => boolean) => {
            if (owner !== scope.userId) return false;
            if (isExternal) { if (content !== accepted) return false; apply(); return true; }
            return session.applyDocument(owner, { ...file, content }, previous, apply, applied);
        },
        accepted: (content: string) => { accepted = content; },
        failed: () => { failed++; },
    };
    installCodeDraftDispatch(view, file.path, options);
    return { ...s, session, view, options, accepted: () => accepted, failed: () => failed, owner: (next: string | null) => { owner = next; } };
}
describe('final code dispatch receipts', () => {
    test('actual Undo filter:false checkpoints the resulting accepted document', () => {
        const f = dispatchFixture([history()]);
        f.view.dispatch({ changes: { from: 4, insert: ' edit' } });
        expect(f.session.file(file.path)?.content).toBe('base edit');
        expect(undo(f.view)).toBe(true);
        expect(f.view.state.doc.toString()).toBe('base');
        expect(f.session.file(file.path)?.content).toBe('base');
        expect(f.accepted()).toBe('base');
    });
    test('checkpoints only the final transformed filter result', () => {
        const f = dispatchFixture([EditorState.transactionFilter.of((transaction) => transaction.docChanged
            ? { changes: { from: 0, to: transaction.startState.doc.length, insert: 'transformed' } } : transaction)]);
        f.view.dispatch({ changes: { from: 0, to: 4, insert: 'proposal' } });
        expect(f.view.state.doc.toString()).toBe('transformed');
        expect(f.session.file(file.path)?.content).toBe('transformed');
        expect(f.session.file(file.path)?.revision).toBe(1);
    });
    test('a stale ExternalChange cannot replace a newer accepted doc or checkpoint', () => {
        const f = dispatchFixture();
        f.view.dispatch({ changes: { from: 0, to: 4, insert: 'newer' } });
        const before = f.values.get(f.session.key);
        f.view.dispatch({ changes: { from: 0, to: 5, insert: 'base' }, annotations: external.of(true) });
        expect(f.view.state.doc.toString()).toBe('newer');
        expect(f.accepted()).toBe('newer');
        expect(f.values.get(f.session.key)).toBe(before);
    });
    test('quota refusal keeps editor, accepted ref and stored receipt unchanged', () => {
        const f = dispatchFixture();
        f.view.dispatch({ changes: { from: 0, to: 4, insert: 'protected' } });
        const before = f.values.get(f.session.key);
        f.fail(true);
        f.view.dispatch({ changes: { from: 0, to: 9, insert: 'refused' }, filter: false });
        expect(f.view.state.doc.toString()).toBe('protected');
        expect(f.accepted()).toBe('protected');
        expect(f.values.get(f.session.key)).toBe(before);
        expect(f.failed()).toBe(1);
    });
    test('old-owner callbacks cannot mutate the accepted document', () => {
        const f = dispatchFixture();
        f.owner('another-user');
        f.view.dispatch({ changes: { from: 4, insert: ' forbidden' } });
        expect(f.view.state.doc.toString()).toBe('base');
        expect(f.values.size).toBe(0);
    });
    test('a coherent final transaction batch checkpoints once and rejects mixed origins before mutation', () => {
        const f = dispatchFixture();
        const first = f.view.state.update({ changes: { from: 4, insert: ' first' } });
        const second = first.state.update({ changes: { from: first.newDoc.length, insert: ' final' } });
        f.view.dispatch([first, second]);
        expect(f.view.state.doc.toString()).toBe('base first final');
        expect(f.session.file(file.path)?.revision).toBe(1);
        expect(f.session.file(file.path)?.previous?.content).toBe('base');
        const before = f.values.get(f.session.key);
        const externalFirst = f.view.state.update({ changes: { from: 0, insert: 'external' }, annotations: external.of(true) });
        const normalLast = externalFirst.state.update({ changes: { from: 0, insert: 'user' } });
        f.view.dispatch([externalFirst, normalLast]);
        expect(f.values.get(f.session.key)).toBe(before);
        expect(f.view.state.doc.toString()).toBe('base first final');
    });
});
