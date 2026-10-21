import { describe, expect, it } from 'bun:test';
import { runInNewContext } from 'node:vm';
import { INITIAL_CHUNK_RECOVERY_SCRIPT } from './chunk-bootstrap';

type Listener = (event: Record<string, unknown>) => void;
function fixture(options: { stored?: string; storageThrows?: boolean; disabled?: boolean } = {}) {
    const listeners = new Map<string, Set<Listener>>();
    const storage = new Map<string, string>();
    if (options.stored !== undefined) storage.set('weblab:chunk-reload-at', options.stored);
    let reloads = 0;
    class Script { constructor(public src: string) {} }
    class Link { constructor(public href: string, public rel = 'stylesheet') {} }
    const host = {
        __weblabChunkRecoveryDisabled: options.disabled,
        __weblabInitialChunkRecovery: undefined as { disarm(): void } | undefined,
        location: { origin: 'https://editor.test', href: 'https://editor.test/sign-in', reload: () => { reloads++; } },
        sessionStorage: {
            getItem: (key: string) => { if (options.storageThrows) throw new Error('Storage unavailable'); return storage.get(key) ?? null; },
            setItem: (key: string, value: string) => { if (options.storageThrows) throw new Error('Storage unavailable'); storage.set(key, value); },
        },
        addEventListener: (name: string, listener: Listener) => {
            let set = listeners.get(name); if (!set) { set = new Set(); listeners.set(name, set); } set.add(listener);
        },
        removeEventListener: (name: string, listener: Listener) => { listeners.get(name)?.delete(listener); },
    };
    const install = () => runInNewContext(INITIAL_CHUNK_RECOVERY_SCRIPT, {
        window: host, URL, Date: { now: () => 100_000 }, HTMLScriptElement: Script, HTMLLinkElement: Link,
    });
    const dispatch = (name: string, event: Record<string, unknown> = {}) => {
        for (const listener of [...(listeners.get(name) ?? [])]) listener(event);
    };
    install();
    return { host, storage, Script, Link, install, dispatch, reloads: () => reloads,
        count: () => [...listeners.values()].reduce((total, set) => total + set.size, 0) };
}

describe('raw startup chunk recovery script', () => {
    it('runs without React or Next and reloads once for an initial same-origin chunk failure', () => {
        const f = fixture();
        f.dispatch('error', { target: new f.Script('https://editor.test/_next/static/chunks/stale.js') });
        expect(f.reloads()).toBe(1);
        expect(f.storage.get('weblab:chunk-reload-at')).toBe('100000');
        expect(f.count()).toBe(0);
        f.install();
        f.dispatch('error', { target: new f.Script('/_next/static/chunks/another.js') });
        expect(f.reloads()).toBe(1);
    });

    it('accepts initial stylesheet failures and known chunk rejection messages with an explicit same-origin URL', () => {
        const css = fixture();
        css.dispatch('error', { target: new css.Link('/_next/static/chunks/styles.css') });
        expect(css.reloads()).toBe(1);
        const js = fixture();
        js.dispatch('unhandledrejection', { reason: new Error('Failed to load chunk /_next/static/chunks/stale.js from module 12') });
        expect(js.reloads()).toBe(1);
    });

    it('ignores foreign URLs, unrelated errors, generic import failures and non-chunk resources', () => {
        const f = fixture();
        for (const src of ['https://foreign.test/_next/static/chunks/stale.js', '//foreign.test/_next/static/chunks/stale.js', '/app.js', '/_next/static/media/font.woff2']) {
            f.dispatch('error', { target: new f.Script(src) });
        }
        for (const message of [
            'Failed to load chunk https://foreign.test/_next/static/chunks/stale.js',
            'Failed to load chunk //foreign.test/_next/static/chunks/stale.js',
            'Importing a module script failed.', 'TypeError: unrelated', 'Loading chunk 1 failed',
        ]) f.dispatch('unhandledrejection', { reason: new Error(message) });
        expect(f.reloads()).toBe(0);
        expect(f.storage.size).toBe(0);
    });

    it('honors the shared recent-reload guard and fails closed if storage is unavailable or corrupt', () => {
        for (const options of [{ stored: '95000' }, { stored: 'invalid' }, { storageThrows: true }]) {
            const f = fixture(options);
            f.dispatch('error', { target: new f.Script('/_next/static/chunks/stale.js') });
            expect(f.reloads()).toBe(0);
        }
        const old = fixture({ stored: '80000' });
        old.dispatch('error', { target: new old.Script('/_next/static/chunks/stale.js') });
        expect(old.reloads()).toBe(1);
    });

    it('permanently disarms on every supported first interaction, including later script evaluation', () => {
        for (const name of ['pointerdown', 'keydown', 'input', 'change']) {
            const f = fixture();
            f.dispatch(name);
            expect(f.count()).toBe(0);
            f.install();
            f.dispatch('error', { target: new f.Script('/_next/static/chunks/stale.js') });
            expect(f.reloads()).toBe(0);
            expect(f.storage.size).toBe(0);
        }
    });

    it('permanently disarms when hydration signals readiness and does not install after that signal', () => {
        const f = fixture();
        f.host.__weblabInitialChunkRecovery!.disarm();
        f.install();
        f.dispatch('unhandledrejection', { reason: new Error('Failed to load chunk /_next/static/chunks/stale.js') });
        expect(f.count()).toBe(0);
        expect(f.reloads()).toBe(0);
        const hydrated = fixture({ disabled: true });
        expect(hydrated.count()).toBe(0);
    });

    it('does not suppress the normal error event or its reporting', () => {
        const f = fixture();
        let suppressed = false;
        const event = { target: new f.Script('/_next/static/chunks/stale.js'),
            preventDefault: () => { suppressed = true; }, stopImmediatePropagation: () => { suppressed = true; } };
        f.dispatch('error', event);
        expect(f.reloads()).toBe(1);
        expect(suppressed).toBe(false);
    });
});
