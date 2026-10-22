import { expect, test } from 'bun:test';
import { createEditorBeforeUnloadHandler, type EditorUnloadState } from './before-unload';

function fixture() {
    const state: EditorUnloadState = {
        pendingWrites: false, pendingRebases: false, pendingStylePreflights: false,
        text: { pending: false, branchId: null },
        branches: [{ id: 'local', runtime: 'local', historyOpen: false },
            { id: 'cloud', runtime: 'cloud', historyOpen: false }],
    };
    let prevented = false;
    const event = { preventDefault: () => { prevented = true; }, returnValue: 'unchanged' };
    const leave = (flush = () => {}) => {
        prevented = false;
        event.returnValue = 'unchanged';
        createEditorBeforeUnloadHandler(flush, () => state)(event as unknown as BeforeUnloadEvent);
        return prevented;
    };
    return { state, event, leave };
}

test('a settled editor leaves without a warning', () => {
    const f = fixture();
    expect(f.leave()).toBe(false);
    expect(f.event.returnValue).toBe('unchanged');
});

test('pending local text blocks silent exit before any source write is queued', () => {
    const f = fixture();
    f.state.text = { pending: true, branchId: 'local' };
    expect(f.leave()).toBe(true);
    expect(f.event.returnValue).toBe('');
});

test('closing text does not clear the warning until its local history also settles', () => {
    const f = fixture();
    f.state.text = { pending: true, branchId: 'local' };
    expect(f.leave()).toBe(true);
    f.state.text.pending = false;
    f.state.branches = f.state.branches.map((branch) => ({ ...branch, historyOpen: branch.id === 'local' }));
    expect(f.leave()).toBe(true);
    f.state.branches = f.state.branches.map((branch) => ({ ...branch, historyOpen: false }));
    expect(f.leave()).toBe(false);
});

test('retaining an old text owner after work settles does not trap the editor', () => {
    const f = fixture();
    f.state.text = { pending: false, branchId: 'local' };
    expect(f.leave()).toBe(false);
});

test('text belongs to its captured branch even when another branch is listed first', () => {
    const f = fixture();
    f.state.branches = [...f.state.branches].reverse();
    f.state.text = { pending: true, branchId: 'local' };
    expect(f.leave()).toBe(true);
});

test('cloud-only rejected text and retained history keep their existing reload contract', () => {
    const f = fixture();
    f.state.text = { pending: true, branchId: 'cloud' };
    f.state.branches = f.state.branches.map((branch) => ({ ...branch, historyOpen: branch.id === 'cloud' }));
    expect(f.leave()).toBe(false);
});

test('cloud reload cannot discard an unfinished local history transaction', () => {
    const f = fixture();
    f.state.text = { pending: true, branchId: 'cloud' };
    f.state.branches = f.state.branches.map((branch) => ({ ...branch, historyOpen: branch.id === 'local' }));
    expect(f.leave()).toBe(true);
});

test('work enqueued by the final rebase flush is checked before leaving', () => {
    const f = fixture();
    expect(f.leave(() => { f.state.pendingWrites = true; })).toBe(true);
});

for (const field of ['pendingWrites', 'pendingRebases', 'pendingStylePreflights'] as const) {
    test(`${field} remains protected independently of text ownership`, () => {
        const f = fixture();
        f.state[field] = true;
        expect(f.leave()).toBe(true);
    });
}
