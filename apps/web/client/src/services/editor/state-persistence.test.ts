import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import {
    clearEditorState,
    loadEditorState,
    patchEditorState,
    saveEditorState,
} from './state-persistence';

// Minimal in-memory localStorage shim. Bun's runtime doesn't provide a DOM
// `window`, so we install one for the duration of each test and restore it
// after. Keeping the shim narrow (just Storage's interface) catches drift
// between the production code and what we're actually exercising.
type MockStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & {
    readonly _store: Map<string, string>;
};

function createMockStorage(): MockStorage {
    const store = new Map<string, string>();
    return {
        _store: store,
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
            store.set(key, String(value));
        },
        removeItem: (key: string) => {
            store.delete(key);
        },
    };
}

// Cast globalThis through `unknown` because the ambient `Window` type from
// lib.dom.d.ts is wider than our shim — direct casts collide with the global
// `localStorage: Storage` declaration.
const globalRef = globalThis as unknown as { window?: { localStorage: MockStorage } };

let mockStorage: MockStorage;
let originalWindow: { localStorage: MockStorage } | undefined;

beforeEach(() => {
    mockStorage = createMockStorage();
    originalWindow = globalRef.window;
    globalRef.window = { localStorage: mockStorage };
});

afterEach(() => {
    if (originalWindow === undefined) {
        delete globalRef.window;
    } else {
        globalRef.window = originalWindow;
    }
});

describe('state-persistence', () => {
    const projectId = 'proj-123';

    describe('loadEditorState', () => {
        it('returns null when nothing stored', () => {
            expect(loadEditorState(projectId)).toBeNull();
        });

        it('returns parsed state when stored', () => {
            mockStorage.setItem(
                `weblab:editor-state:${projectId}`,
                JSON.stringify({ selectedFrameId: 'f1' }),
            );
            expect(loadEditorState(projectId)).toEqual({ selectedFrameId: 'f1' });
        });

        it('returns null on malformed JSON', () => {
            mockStorage.setItem(`weblab:editor-state:${projectId}`, '{not json');
            expect(loadEditorState(projectId)).toBeNull();
        });

        it('returns null when stored value is a primitive', () => {
            mockStorage.setItem(`weblab:editor-state:${projectId}`, JSON.stringify('oops'));
            expect(loadEditorState(projectId)).toBeNull();
        });

        it('returns null when stored value is JSON null', () => {
            mockStorage.setItem(`weblab:editor-state:${projectId}`, 'null');
            expect(loadEditorState(projectId)).toBeNull();
        });
    });

    describe('saveEditorState', () => {
        it('writes JSON under the namespaced key', () => {
            saveEditorState(projectId, { selectedFrameId: 'f1' });
            expect(mockStorage._store.get(`weblab:editor-state:${projectId}`)).toBe(
                JSON.stringify({ selectedFrameId: 'f1' }),
            );
        });

        it('overwrites prior state', () => {
            saveEditorState(projectId, { selectedFrameId: 'f1' });
            saveEditorState(projectId, { selectedFrameId: 'f2' });
            expect(loadEditorState(projectId)).toEqual({ selectedFrameId: 'f2' });
        });

        it('isolates state per projectId', () => {
            saveEditorState('proj-a', { selectedFrameId: 'fa' });
            saveEditorState('proj-b', { selectedFrameId: 'fb' });
            expect(loadEditorState('proj-a')).toEqual({ selectedFrameId: 'fa' });
            expect(loadEditorState('proj-b')).toEqual({ selectedFrameId: 'fb' });
        });
    });

    describe('clearEditorState', () => {
        it('removes the key', () => {
            saveEditorState(projectId, { selectedFrameId: 'f1' });
            clearEditorState(projectId);
            expect(loadEditorState(projectId)).toBeNull();
        });

        it('is a no-op when nothing stored', () => {
            expect(() => clearEditorState(projectId)).not.toThrow();
        });
    });

    describe('patchEditorState', () => {
        it('writes patch when nothing stored', () => {
            patchEditorState(projectId, { activeBreakpointId: 'tablet' });
            expect(loadEditorState(projectId)).toEqual({ activeBreakpointId: 'tablet' });
        });

        it('merges patch over existing state', () => {
            saveEditorState(projectId, {
                selectedFrameId: 'f1',
                activeBreakpointId: 'desktop',
            });
            patchEditorState(projectId, { activeBreakpointId: 'tablet' });
            expect(loadEditorState(projectId)).toEqual({
                selectedFrameId: 'f1',
                activeBreakpointId: 'tablet',
            });
        });

        it('clears existing values when patch sets keys to undefined', () => {
            // Spread semantics: { ...existing, ...patch } — undefined in patch
            // does override the existing key. JSON.stringify then drops
            // undefined-valued keys, so on reload the keys are absent. Pinning
            // this end-to-end because the hook relies on it to clear element
            // selection when the user deselects.
            saveEditorState(projectId, {
                selectedFrameId: 'f1',
                selectedElementOid: 'oid-1',
                selectedElementFrameId: 'f1',
            });
            patchEditorState(projectId, {
                selectedElementOid: undefined,
                selectedElementFrameId: undefined,
            });
            const result = loadEditorState(projectId);
            expect(result).toEqual({ selectedFrameId: 'f1' });
            expect(result).not.toHaveProperty('selectedElementOid');
            expect(result).not.toHaveProperty('selectedElementFrameId');
        });
    });
});
