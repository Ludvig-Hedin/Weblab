import { describe, expect, test } from 'bun:test';
import { desktopAuthProtocol, desktopHandoffUrl } from './desktop-handoff';

const state = 'a'.repeat(64);
describe('trusted desktop authentication protocol', () => {
    test('beta tickets address only the beta handler and preserve opaque ticket bytes', () => {
        const url = new URL(desktopHandoffUrl({ protocol: 'weblab-beta', ticket: 'opaque+/=&ticket=other', state }));
        expect(url.protocol).toBe('weblab-beta:');
        expect(url.host + url.pathname).toBe('auth/handoff');
        expect(url.searchParams.getAll('ticket')).toEqual(['opaque+/=&ticket=other']);
        expect(url.searchParams.get('state')).toBe(state);
    });
    test('stable deployment retains its existing handler', () => {
        expect(desktopHandoffUrl({ protocol: desktopAuthProtocol('weblab'), ticket: 'one-use', state }).startsWith('weblab://')).toBe(true);
    });
    test.each(['https', 'javascript', 'weblab-beta:', 'Weblab', '', 'weblab://auth'])('refuses arbitrary scheme %s', protocol => {
        expect(() => desktopAuthProtocol(protocol)).toThrow();
    });
    test('refuses missing, oversized or unbound handoff credentials', () => {
        expect(() => desktopHandoffUrl({ protocol: 'weblab-beta', ticket: '', state })).toThrow();
        expect(() => desktopHandoffUrl({ protocol: 'weblab-beta', ticket: 'x'.repeat(16_385), state })).toThrow();
        expect(() => desktopHandoffUrl({ protocol: 'weblab-beta', ticket: 'ticket', state: 'unbound' })).toThrow();
    });
});
