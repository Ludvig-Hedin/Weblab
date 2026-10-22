import { describe, expect, it } from 'bun:test';

import { ScopedProjectLifetime } from './scoped-project-lifetime';

describe('scoped project session lifetime', () => {
    it('holds same-user session B until its own fresh entry has returned', () => {
        const lifetime = new ScopedProjectLifetime();
        lifetime.observe({ userId: 'user', sessionId: 'A' });
        const a = lifetime.capture();
        expect(lifetime.admit(a)).toBe(true);
        lifetime.observe({ userId: 'user', sessionId: 'B' });
        const b = lifetime.capture();
        // An unchanged cached entry from A cannot admit B.
        expect(lifetime.admitted(a)).toBe(false);
        expect(lifetime.admitted(b)).toBe(false);
        expect(lifetime.admit(a)).toBe(false);
        expect(lifetime.admitted(b)).toBe(false);
        expect(lifetime.admit(b)).toBe(true);
        expect(lifetime.admitted(b)).toBe(true);
    });
    it('never revives A after an observed A to B to A transition', () => {
        const lifetime = new ScopedProjectLifetime();
        lifetime.observe({ userId: 'user', sessionId: 'A' });
        const original = lifetime.capture();
        lifetime.admit(original);
        lifetime.observe({ userId: 'user', sessionId: 'B' });
        lifetime.observe({ userId: 'user', sessionId: 'A' });
        expect(lifetime.current(original)).toBe(false);
        expect(lifetime.admit(original)).toBe(false);
        const returned = lifetime.capture();
        expect(lifetime.admitted(returned)).toBe(false);
        expect(lifetime.admit(returned)).toBe(true);
        expect(lifetime.admitted(original)).toBe(false);
    });
    it('preserves token refresh but invalidates unmount and signed-out captures', () => {
        const lifetime = new ScopedProjectLifetime();
        expect(lifetime.admit(lifetime.capture())).toBe(false);
        lifetime.observe({ userId: 'user', sessionId: 'A' });
        const a = lifetime.capture();
        lifetime.admit(a);
        lifetime.observe({ userId: 'user', sessionId: 'A' });
        expect(lifetime.admitted(a)).toBe(true);
        lifetime.invalidate();
        expect(lifetime.admitted(a)).toBe(false);
        lifetime.observe({ userId: null, sessionId: null });
        expect(lifetime.admit(lifetime.capture())).toBe(false);
    });
});
