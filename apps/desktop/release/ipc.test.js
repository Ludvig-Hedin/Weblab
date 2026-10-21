import { expect, test } from 'bun:test';
import { publishingInput, registerPublishingIpc } from './ipc';
import { REQUEST_ACTIVE } from './authorize';
import { EventEmitter } from 'node:events';

const input = { projectId: 'project1', branchId: 'branch1', jwt: 'session-token' };

test('renderer cannot supply a root, account identity, arbitrary method or unbounded changes', () => {
    expect(() => publishingInput('status', { ...input, root: '/original' })).toThrow('Unexpected');
    expect(() => publishingInput('constructor', input)).toThrow();
    expect(() => publishingInput('review', { ...input, planToken: 'a'.repeat(64), cleanedFiles: [{ path: 'app/page.tsx', updated: 'a'.repeat(11 * 1024 * 1024) }] })).toThrow('too large');
    expect(() => publishingInput('startBuild', { ...input, releaseId: 'a'.repeat(36), production: 'true' })).toThrow();
});

test('content preparation accepts only bounded identity and exact revision pins', () => {
    const selected = { ...input, connectionId: 'connection1', connectionRevision: 1,
        selections: [{ draftId: 'draft1', expectedRevision: 2, providerRevision: 'provider1', archived: false }] };
    expect(publishingInput('prepareContent', selected)).toBe(selected);
    expect(publishingInput('resumeContent', selected)).toBe(selected);
    expect(publishingInput('resumeContent', { ...selected, recovery: true }).recovery).toBe(true);
    expect(() => publishingInput('resumeContent', { ...selected, recovery: 'true' })).toThrow();
    expect(() => publishingInput('prepareContent', { ...selected, recovery: true })).toThrow('Unexpected');
    for (const extra of [{ rootPath: '/customer' }, { sourceFiles: [] }, { handle: 'forged' }, { documentJson: '{}' }, { userId: 'other' }]) {
        expect(() => publishingInput('prepareContent', { ...selected, ...extra })).toThrow('Unexpected');
    }
    expect(() => publishingInput('prepareContent', { ...selected, selections: [...selected.selections, ...selected.selections] })).toThrow();
    expect(() => publishingInput('prepareContent', { ...selected, connectionRevision: 1.2 })).toThrow();
    expect(() => publishingInput('prepareContent', { ...selected, selections: [{ ...selected.selections[0], originalJson: '{}' }] })).toThrow();
    expect(() => publishingInput('contentStatus', { ...input, connectionId: 'connection1' })).toThrow();
});

test('content operations share current project authorization and expose only content status', async () => {
    const handlers = new Map();
    const frame = { url: 'https://weblab.build/project/one' };
    const window = Object.assign(new EventEmitter(), { mainFrame: frame });
    let authorized = 0; let refreshed = 0; let received;
    registerPublishingIpc({ ipcMain: { handle: (name, callback) => handlers.set(name, callback) },
        service: { withProject: async (verified, operation) => {
            authorized++; received = verified;
            return { ...await operation({ binding: { userId: 'actor' }, refreshAccess: async () => { refreshed++; } }), productionSwitchEnabled: false };
        } },
        content: { status: async (verified, context) => {
            expect(verified[REQUEST_ACTIVE]()).toBe(true);
            expect(context.binding.userId).toBe('actor');
            return { status: 'absent' };
        } }, getWebContents: () => window, allowedOrigins: new Set(['https://weblab.build']) });
    expect(await handlers.get('weblab:publishing')({ sender: window, senderFrame: frame }, { method: 'contentStatus', input })).toEqual({ success: true, result: { status: 'absent' } });
    expect(authorized).toBe(1); expect(refreshed).toBe(1);
    expect(received.projectId).toBe(input.projectId);
    expect(window.listenerCount('did-start-navigation')).toBe(0);
});

test('only the current owned main frame can reach publishing authorization', async () => {
    let handler;
    let calls = 0;
    const frame = { url: 'https://weblab.build/project/one' };
    const window = { mainFrame: frame };
    registerPublishingIpc({ ipcMain: { handle: (_, callback) => { handler = callback; } },
        service: { status: async () => { calls++; return {}; } },
        getWebContents: () => window, allowedOrigins: new Set(['https://weblab.build']) });
    for (const event of [{ sender: window, senderFrame: { ...frame } },
        { sender: { mainFrame: frame }, senderFrame: frame }, { sender: window }]) {
        expect((await handler(event, { method: 'status', input })).success).toBe(false);
    }
    expect(calls).toBe(0);
    expect((await handler({ sender: window, senderFrame: frame }, { method: 'status', input })).success).toBe(true);
    expect(calls).toBe(1);
});


test('closing the publishing window cancels an unsent operation without waiting for its lock', async () => {
    const handlers = new Map();
    const frame = { url: 'https://weblab.build/project/one' };
    const window = Object.assign(new EventEmitter(), { mainFrame: frame });
    let release;
    const barrier = new Promise((resolve) => { release = resolve; });
    let posted = false;
    registerPublishingIpc({ ipcMain: { handle: (name, callback) => handlers.set(name, callback) },
        service: { startBuild: async (verified) => { await barrier; if (!verified[REQUEST_ACTIVE]()) throw new Error('canceled'); posted = true; } },
        getWebContents: () => window, allowedOrigins: new Set(['https://weblab.build']) });
    const event = { sender: window, senderFrame: frame };
    const pending = handlers.get('weblab:publishing')(event, { method: 'startBuild', input: { ...input, releaseId: 'a'.repeat(36), production: false } });
    expect((await handlers.get('weblab:publishing-cancel')({ sender: window, senderFrame: { ...frame } })).success).toBe(false);
    expect((await handlers.get('weblab:publishing-cancel')(event)).success).toBe(true);
    release();
    expect((await pending).success).toBe(false);
    expect(posted).toBe(false);
    expect(window.listenerCount('did-start-navigation')).toBe(0);
});

test('main-frame navigation invalidates an operation even after returning to the same URL', async () => {
    const handlers = new Map();
    const frame = { url: 'https://weblab.build/project/one' };
    const window = Object.assign(new EventEmitter(), { mainFrame: frame });
    let release;
    const barrier = new Promise((resolve) => { release = resolve; });
    let active;
    registerPublishingIpc({ ipcMain: { handle: (name, callback) => handlers.set(name, callback) },
        service: { status: async (verified) => { active = verified[REQUEST_ACTIVE]; await barrier; return {}; } },
        getWebContents: () => window, allowedOrigins: new Set(['https://weblab.build']) });
    const pending = handlers.get('weblab:publishing')({ sender: window, senderFrame: frame }, { method: 'status', input });
    window.emit('did-start-navigation', {}, 'https://preview.example', false, false);
    expect(active()).toBe(true);
    window.emit('did-navigate-in-page', {}, 'https://weblab.build/project/two', true);
    expect(active()).toBe(false);
    release(); expect((await pending).success).toBe(false);
});
