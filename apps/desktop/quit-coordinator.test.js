import { describe, expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import { createQuitCoordinator } from './quit-coordinator.js';

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const deferred = () => {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
};
const event = () => ({ defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } });

class FakeWindow extends EventEmitter {
    constructor(name, behavior = 'accept') {
        super();
        this.name = name;
        this.behavior = behavior;
        this.webContents = new EventEmitter();
        this.destroyed = false;
        this.closeCalls = 0;
    }
    isDestroyed() { return this.destroyed; }
    close() {
        this.closeCalls++;
        if (this.behavior === 'throw') throw new Error('close failed');
        this.closeEvent = event();
        this.emit('close', this.closeEvent);
        if (this.behavior === 'prevent-after-listeners') this.closeEvent.preventDefault();
        if (this.closeEvent.defaultPrevented) return;
        if (this.behavior === 'veto') {
            this.unloadEvent = event();
            this.webContents.emit('will-prevent-unload', this.unloadEvent);
        } else if (this.behavior === 'accept') this.finishClose();
    }
    finishClose() {
        this.destroyed = true;
        this.emit('closed');
    }
}

function fixture(windows = [], options = {}) {
    const app = new EventEmitter();
    const calls = [];
    const notifications = [];
    const timers = new Set();
    let quits = 0;
    let allowedQuits = 0;
    app.quit = () => {
        quits++;
        const quitEvent = event();
        app.emit('before-quit', quitEvent);
        if (!quitEvent.defaultPrevented) allowedQuits++;
    };
    const coordinator = createQuitCoordinator({
        app, getWindows: () => windows,
        getMainWindow: () => windows[0],
        disposeCli: async () => { calls.push('cli'); },
        disposeLocal: async () => { calls.push('local'); },
        showCleanupError: (error) => { calls.push(['error', error.message]); },
        showCloseCancelled: (reason, window) => { notifications.push([reason, window]); },
        setTimer: (callback) => { timers.add(callback); return callback; },
        clearTimer: (timer) => { timers.delete(timer); },
        ...options,
    });
    return {
        app, coordinator, calls, notifications, timers, windows,
        get quits() { return quits; }, get allowedQuits() { return allowedQuits; },
        expire: () => { for (const callback of [...timers]) callback(); },
    };
}

function expectDetached(window) {
    expect(window.listenerCount('close')).toBe(0);
    expect(window.listenerCount('closed')).toBe(0);
    expect(window.webContents.listenerCount('will-prevent-unload')).toBe(0);
}

describe('native Quit closes windows before disposing services', () => {
    test('renderer refusal preserves both native services without overriding beforeunload', async () => {
        const window = new FakeWindow('editor', 'veto');
        const f = fixture([window]);
        const quitEvent = event();
        f.app.emit('before-quit', quitEvent);
        expect(quitEvent.defaultPrevented).toBe(true);
        const result = await f.coordinator.requestQuit();
        expect(result).toEqual({ status: 'cancelled', reason: 'beforeunload' });
        expect(window.unloadEvent.defaultPrevented).toBe(false);
        expect(f.calls).toEqual([]);
        expect(f.quits).toBe(0);
        expect(f.coordinator.blocksWindows).toBe(false);
        expect(f.notifications).toEqual([['beforeunload', window]]);
        expectDetached(window);
        expect(f.timers.size).toBe(0);
    });

    test('cancellation notifies once after unblocking and allows an immediate fresh Quit', async () => {
        const window = new FakeWindow('editor', 'veto');
        const notifications = [];
        let retry;
        const f = fixture([window], {
            showCloseCancelled: (reason, target) => {
                notifications.push([reason, target]);
                expect(f.coordinator.state).toBe('idle');
                expect(f.coordinator.blocksWindows).toBe(false);
                expect(f.calls).toEqual([]);
                expectDetached(window);
                window.behavior = 'wait';
                retry = f.coordinator.requestQuit();
                expect(retry).not.toBe(first);
                expect(f.coordinator.requestQuit()).toBe(retry);
            },
        });
        const first = f.coordinator.requestQuit();
        expect(f.coordinator.requestQuit()).toBe(first);
        expect((await first).status).toBe('cancelled');
        await flush();
        // The old attempt cannot clear the retry after its callback returns.
        expect(f.coordinator.state).toBe('closing');
        expect(f.coordinator.blocksWindows).toBe(true);
        expect(f.coordinator.requestQuit()).toBe(retry);
        expect(window.closeCalls).toBe(2);
        expect(f.calls).toEqual([]);
        expect(notifications).toEqual([['beforeunload', window]]);
        window.finishClose();
        expect((await retry).status).toBe('quit');
        expect(f.calls).toEqual(['cli', 'local']);
        expect(notifications.length).toBe(1);
    });

    test('a failed notification leaves cancellation resolved and Quit retryable', async () => {
        const window = new FakeWindow('editor', 'veto');
        let notified = 0;
        const f = fixture([window], {
            showCloseCancelled: () => { notified++; throw new Error('dialog unavailable'); },
        });
        expect((await f.coordinator.requestQuit()).status).toBe('cancelled');
        expect(notified).toBe(1);
        expect(f.coordinator.state).toBe('idle');
        expect(f.coordinator.blocksWindows).toBe(false);
        expect(f.calls).toEqual([]);
        window.behavior = 'accept';
        expect((await f.coordinator.requestQuit()).status).toBe('quit');
        expect(f.calls).toEqual(['cli', 'local']);
    });

    test('a close event alone never permits cleanup; genuine closed is required', async () => {
        const window = new FakeWindow('editor', 'wait');
        const f = fixture([window]);
        const pending = f.coordinator.requestQuit();
        await flush();
        expect(window.closeCalls).toBe(1);
        expect(f.calls).toEqual([]);
        expect(f.coordinator.state).toBe('closing');
        window.finishClose();
        expect(await pending).toEqual({ status: 'quit' });
        expect(f.calls).toEqual(['cli', 'local']);
        expect(f.quits).toBe(1);
        expect(f.allowedQuits).toBe(1);
        expectDetached(window);
    });

    test('duplicate Quit and window-all-closed join one in-flight attempt', async () => {
        const window = new FakeWindow('editor', 'wait');
        const f = fixture([window], { quitOnWindowAllClosed: true });
        const first = f.coordinator.requestQuit();
        expect(f.coordinator.requestQuit()).toBe(first);
        const duplicate = event();
        f.app.emit('before-quit', duplicate);
        expect(duplicate.defaultPrevented).toBe(true);
        await flush();
        window.finishClose();
        f.app.emit('window-all-closed');
        expect(f.coordinator.requestQuit()).toBe(first);
        await first;
        expect(window.closeCalls).toBe(1);
        expect(f.calls).toEqual(['cli', 'local']);
        expect(f.quits).toBe(1);
        expect(f.allowedQuits).toBe(1);
        const extra = event();
        f.app.emit('before-quit', extra);
        expect(extra.defaultPrevented).toBe(true);
        expect(f.quits).toBe(1);
    });

    test('main window closes first, then a popup may veto without any disposal', async () => {
        const popup = new FakeWindow('popup', 'veto');
        const main = new FakeWindow('editor', 'wait');
        const f = fixture([popup, main], { getMainWindow: () => main });
        const pending = f.coordinator.requestQuit();
        await flush();
        expect(main.closeCalls).toBe(1);
        expect(popup.closeCalls).toBe(0);
        main.finishClose();
        expect(await pending).toEqual({ status: 'cancelled', reason: 'beforeunload' });
        expect(main.isDestroyed()).toBe(true);
        expect(popup.isDestroyed()).toBe(false);
        expect(f.calls).toEqual([]);
        expect(f.notifications).toEqual([['beforeunload', popup]]);
        expectDetached(main);
        expectDetached(popup);
    });

    test('every popup, including a popup of a popup, must really close', async () => {
        const main = new FakeWindow('editor');
        const popup = new FakeWindow('popup');
        const nested = new FakeWindow('nested-popup', 'wait');
        const f = fixture([main, popup, nested]);
        const pending = f.coordinator.requestQuit();
        await flush();
        expect(main.closeCalls).toBe(1);
        expect(popup.closeCalls).toBe(1);
        expect(nested.closeCalls).toBe(1);
        expect(f.calls).toEqual([]);
        nested.finishClose();
        await pending;
        expect(f.calls).toEqual(['cli', 'local']);
    });

    for (const behavior of ['prevent-after-listeners', 'throw']) {
        test(`${behavior} cancels closing without stopping services`, async () => {
            const window = new FakeWindow('editor', behavior);
            const f = fixture([window]);
            expect((await f.coordinator.requestQuit()).status).toBe('cancelled');
            expect(f.calls).toEqual([]);
            expect(f.quits).toBe(0);
            expect(f.coordinator.blocksWindows).toBe(false);
            expect(f.notifications).toEqual([[
                behavior === 'throw' ? 'close-error' : 'close-prevented', window,
            ]]);
            expectDetached(window);
        });
    }

    test('a close veto from a listener registered after the coordinator is detected', async () => {
        const window = new FakeWindow('editor', 'wait');
        const f = fixture([window]);
        const pending = f.coordinator.requestQuit();
        await flush();
        const veto = (closeEvent) => closeEvent.preventDefault();
        window.on('close', veto);
        window.emit('close', event());
        expect((await pending).reason).toBe('close-prevented');
        expect(f.calls).toEqual([]);
        window.removeListener('close', veto);
        expectDetached(window);
    });

    test('timeout removes listeners; late callbacks cannot dispose or corrupt a retry', async () => {
        const window = new FakeWindow('editor', 'wait');
        const f = fixture([window]);
        const pending = f.coordinator.requestQuit();
        await flush();
        const lateClosed = window.listeners('closed')[0];
        const lateRefusal = window.webContents.listeners('will-prevent-unload')[0];
        const lateTimeout = [...f.timers][0];
        f.expire();
        expect((await pending).reason).toBe('close-timeout');
        expect(f.notifications).toEqual([['close-timeout', window]]);
        expectDetached(window);
        expect(f.calls).toEqual([]);
        const retry = f.coordinator.requestQuit();
        await flush();
        lateClosed();
        lateRefusal(event());
        lateTimeout();
        await flush();
        expect(f.coordinator.state).toBe('closing');
        expect(f.calls).toEqual([]);
        window.finishClose();
        expect((await retry).status).toBe('quit');
        expect(f.calls).toEqual(['cli', 'local']);
    });

    test('an unexpected new window cancels an attempt and preserves services', async () => {
        const main = new FakeWindow('editor', 'wait');
        const f = fixture([main]);
        const pending = f.coordinator.requestQuit();
        await flush();
        const popup = new FakeWindow('unexpected');
        f.windows.push(popup);
        f.app.emit('browser-window-created', event(), popup);
        expect((await pending).reason).toBe('new-window');
        expect(f.notifications).toEqual([['new-window', main]]);
        expect(f.calls).toEqual([]);
        expectDetached(main);
        expect(f.coordinator.blocksWindows).toBe(false);
    });

    test('a window created after the last closed event also cancels before cleanup', async () => {
        const main = new FakeWindow('editor', 'wait');
        const f = fixture([main]);
        const pending = f.coordinator.requestQuit();
        await flush();
        main.finishClose();
        f.windows.push(new FakeWindow('unannounced'));
        expect((await pending).reason).toBe('live-windows');
        expect(f.calls).toEqual([]);
    });

    test('no-window Quit waits for CLI, then local cleanup, then one native Quit', async () => {
        const cli = deferred();
        const local = deferred();
        const calls = [];
        const f = fixture([], {
            disposeCli: () => { calls.push('cli'); return cli.promise; },
            disposeLocal: () => { calls.push('local'); return local.promise; },
        });
        const pending = f.coordinator.requestQuit();
        expect(f.coordinator.blocksWindows).toBe(true);
        await flush();
        expect(calls).toEqual(['cli']);
        expect(f.quits).toBe(0);
        cli.resolve();
        await flush();
        expect(calls).toEqual(['cli', 'local']);
        expect(f.quits).toBe(0);
        local.resolve();
        await pending;
        expect(f.quits).toBe(1);
        expect(f.allowedQuits).toBe(1);
        expect(f.coordinator.blocksWindows).toBe(true);
    });

    test('window-all-closed initiates cleanup on Windows/Linux, keeps macOS open otherwise', async () => {
        const mac = fixture();
        mac.app.emit('window-all-closed');
        await flush();
        expect(mac.calls).toEqual([]);
        expect(mac.coordinator.blocksWindows).toBe(false);
        const win = fixture([], { quitOnWindowAllClosed: true });
        win.app.emit('window-all-closed');
        await win.coordinator.requestQuit();
        expect(win.calls).toEqual(['cli', 'local']);
        expect(win.quits).toBe(1);
    });

    for (const failing of ['cli', 'local']) {
        test(`${failing} cleanup failure keeps reopening blocked and can retry Quit`, async () => {
            const calls = [];
            let failed = false;
            const dispose = async (name) => {
                calls.push(name);
                if (name === failing && !failed) {
                    failed = true;
                    throw new Error(`${name} still pending`);
                }
            };
            const f = fixture([], {
                disposeCli: () => dispose('cli'), disposeLocal: () => dispose('local'),
            });
            expect((await f.coordinator.requestQuit()).status).toBe('cleanup-failed');
            expect(f.coordinator.state).toBe('cleanup-failed');
            expect(f.coordinator.blocksWindows).toBe(true);
            expect(f.quits).toBe(0);
            expect(f.calls).toEqual([['error', `${failing} still pending`]]);
            expect((await f.coordinator.requestQuit()).status).toBe('quit');
            expect(calls).toEqual(failing === 'cli' ? ['cli', 'cli', 'local'] : ['cli', 'local', 'local']);
            expect(f.quits).toBe(1);
            expect(f.allowedQuits).toBe(1);
        });
    }

    test('unexpected reopening during cleanup fails closed before local disposal', async () => {
        const cli = deferred();
        const f = fixture([], { disposeCli: () => cli.promise });
        const pending = f.coordinator.requestQuit();
        await flush();
        const window = new FakeWindow('unexpected');
        f.windows.push(window);
        f.app.emit('browser-window-created', event(), window);
        cli.resolve();
        expect((await pending).status).toBe('cleanup-failed');
        expect(f.coordinator.blocksWindows).toBe(true);
        expect(f.quits).toBe(0);
        expect(f.calls).toEqual([['error', 'A window reopened during cleanup.']]);
        // Retry may not stop services while that unapproved window stays open.
        expect((await f.coordinator.requestQuit()).status).toBe('cleanup-failed');
        expect(f.calls.length).toBe(2);
        window.finishClose();
        expect((await f.coordinator.requestQuit()).status).toBe('quit');
        expect(f.calls.at(-1)).toBe('local');
    });
});
