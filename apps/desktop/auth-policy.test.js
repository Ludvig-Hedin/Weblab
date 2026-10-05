import { describe, expect, test } from 'bun:test';
import { createLoginHandoff, externalHttpUrl, isTrustedSender } from './auth-policy.js';

const origin = 'https://weblab.build';
const state = 'a'.repeat(64);
function fixture() {
    let time = 1000;
    let sequence = 0;
    const policy = createLoginHandoff({ origin, now: () => time,
        randomState: () => (++sequence === 1 ? 'a' : 'b').repeat(64) });
    return { policy, advance: (ms) => { time += ms; } };
}

describe('desktop login authorization', () => {
    test('binds the ticket to a pending login, exact origin/path and one claim', () => {
        const { policy } = fixture();
        const started = policy.begin(origin + '/sign-in/desktop-handoff?state=attacker');
        expect(new URL(started.url).searchParams.get('state')).toBe(state);
        const target = policy.accept('ticket', state);
        expect(policy.claim('other-ticket', state, target)).toBe(false);
        expect(policy.claim('ticket', state, target.replace(origin, 'https://evil.example'))).toBe(false);
        expect(policy.claim('ticket', state, target.replace('/redeem', '/other'))).toBe(false);
        expect(policy.claim('ticket', state, target)).toBe(true);
        expect(policy.claim('ticket', state, target)).toBe(false);
        expect(policy.accept('ticket', state)).toBeNull();
    });

    test('unsolicited, malformed, expired and replaced callbacks cannot authorize sign-out', () => {
        const { policy, advance } = fixture();
        expect(policy.accept('ticket', state)).toBeNull();
        policy.begin(origin + '/sign-in/desktop-handoff');
        expect(policy.accept('ticket', 'bad')).toBeNull();
        expect(policy.accept('', state)).toBeNull();
        policy.begin(origin + '/sign-in/desktop-handoff');
        expect(policy.accept('ticket', state)).toBeNull();
        advance(10 * 60_000);
        expect(policy.accept('ticket', 'b'.repeat(64))).toBeNull();
    });

    test('expired redemption and failed browser launch retain the existing account', () => {
        const { policy, advance } = fixture();
        policy.begin(origin + '/sign-in/desktop-handoff');
        const target = policy.accept('ticket', state);
        advance(60_000);
        expect(policy.claim('ticket', state, target)).toBe(false);
        const next = policy.begin(origin + '/sign-in/desktop-handoff');
        policy.cancel(next.state);
        expect(policy.accept('ticket', next.state)).toBeNull();
    });

    test('ordinary links and foreign handoff pages create no authorization', () => {
        const { policy } = fixture();
        expect(policy.begin(origin + '/projects')).toBeNull();
        expect(policy.begin('https://evil.example/sign-in/desktop-handoff')).toBeNull();
        expect(policy.accept('ticket', state)).toBeNull();
    });
});

describe('external links', () => {
    test('only HTTP(S) URLs without embedded credentials reach the opener', () => {
        for (const url of ['file:///tmp/a', 'custom://open', 'javascript:alert(1)', 'bad', 'https://user:pass@example.com']) {
            expect(externalHttpUrl(url)).toBeNull();
        }
        expect(externalHttpUrl('https://github.com/login')).toBe('https://github.com/login');
        expect(externalHttpUrl('http://localhost:3000/test')).toBe('http://localhost:3000/test');
    });

    test('same origin is insufficient without the exact window and top frame', () => {
        const mainFrame = { url: origin + '/sign-in' };
        const wc = { mainFrame };
        const origins = new Set([origin]);
        expect(isTrustedSender({ sender: wc, senderFrame: mainFrame }, wc, origins)).toBe(true);
        expect(isTrustedSender({ sender: { mainFrame }, senderFrame: mainFrame }, wc, origins)).toBe(false);
        expect(isTrustedSender({ sender: wc, senderFrame: { url: mainFrame.url } }, wc, origins)).toBe(false);
        mainFrame.url = 'https://evil.example';
        expect(isTrustedSender({ sender: wc, senderFrame: mainFrame }, wc, origins)).toBe(false);
    });
});
