import { describe, expect, it } from 'bun:test';

import type { InvitationOwner } from './invitation-lifecycle';
import { InvitationLifecycle, runInvitationClaim } from './invitation-lifecycle';

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}

const anonymous = { userId: null, sessionId: null };
const first = { userId: 'user-one', sessionId: 'session-one' };
const second = { userId: 'user-two', sessionId: 'session-two' };
function surface(initial: InvitationOwner = first) {
    let owner = initial;
    let enabled = true;
    const lifecycle = new InvitationLifecycle(
        () => owner,
        () => enabled,
    );
    lifecycle.setScope('invitation-one:bearer-one');
    lifecycle.mount();
    return {
        lifecycle,
        emit(next: InvitationOwner) {
            owner = next;
            lifecycle.observe(next);
        },
        replaceWithoutEmission(next: InvitationOwner) {
            owner = next;
        },
        enable(value: boolean) {
            enabled = value;
        },
    };
}

describe('invitation lifecycle through Clerk activation', () => {
    it('keeps the owned activation alive through transitive undefined until its exact session arrives', async () => {
        const f = surface(anonymous);
        const operation = f.lifecycle.begin()!;
        const gate = deferred<void>();
        expect(operation.activate(first)).toBe(true);
        const activation = (async () => {
            f.emit({ userId: undefined, sessionId: undefined });
            await gate.promise;
            // This is the same guard used by the real setActive navigate callback.
            expect(operation.current()).toBe(true);
            f.emit(first);
            expect(operation.current()).toBe(true);
            expect(operation.finish()).toBe(true);
        })();
        expect(f.lifecycle.begin()).toBeNull();
        gate.resolve();
        await activation;
        expect(f.lifecycle.begin()).not.toBeNull();
    });

    it('never treats a foreign session followed by the expected session as its own activation', async () => {
        const f = surface(anonymous);
        const operation = f.lifecycle.begin()!;
        operation.activate(first);
        const gate = deferred<void>();
        const resumed = gate.promise.then(() => operation.current());
        f.emit(second);
        f.emit(anonymous);
        f.emit({ userId: undefined, sessionId: undefined });
        f.emit(first);
        gate.resolve();
        expect(await resumed).toBe(false);
        expect(operation.finish()).toBe(false);
    });

    it('rejects a logout after the transition and an unmount/remount while activation is held', () => {
        for (const interrupt of ['logout', 'remount'] as const) {
            const f = surface(anonymous);
            const operation = f.lifecycle.begin()!;
            operation.activate(first);
            f.emit({ userId: undefined, sessionId: undefined });
            if (interrupt === 'logout') f.emit(anonymous);
            else {
                f.lifecycle.unmount();
                f.lifecycle.mount();
            }
            f.emit(first);
            expect(operation.current()).toBe(false);
        }
    });

    it('does not allow ordinary sends or claims to accept an undefined transition', () => {
        const f = surface();
        const operation = f.lifecycle.begin()!;
        f.emit({ userId: undefined, sessionId: undefined });
        f.emit(first);
        expect(operation.current()).toBe(false);
    });
});

describe('captured invitation claim completion', () => {
    function claim(f: ReturnType<typeof surface>) {
        const response = deferred<{ projectId: string }>();
        const effects: string[] = [];
        const operation = f.lifecycle.begin()!;
        const run = runInvitationClaim(
            operation,
            () => {
                effects.push('dispatch');
                return response.promise;
            },
            {
                success: (value) => {
                    effects.push(`remove-bearer:${value.projectId}`, `navigate:${value.projectId}`);
                },
                failure: () => {
                    effects.push('error');
                },
                finish: () => {
                    effects.push('finish');
                },
            },
        );
        return { response, effects, run };
    }

    it('applies a current response once, then releases admission for an explicit retry', async () => {
        const f = surface();
        const c = claim(f);
        expect(f.lifecycle.begin()).toBeNull();
        c.response.resolve({ projectId: 'project-one' });
        await c.run;
        expect(c.effects).toEqual([
            'dispatch',
            'remove-bearer:project-one',
            'navigate:project-one',
            'finish',
        ]);
        expect(f.lifecycle.begin()).not.toBeNull();
    });

    for (const drift of [
        'same-user-session',
        'actor-aba',
        'unmount',
        'invitation',
        'token',
    ] as const) {
        it(`retains recovery and suppresses every stale completion after ${drift}`, async () => {
            const f = surface();
            const c = claim(f);
            if (drift === 'same-user-session')
                f.emit({ ...first, sessionId: 'replacement-session' });
            if (drift === 'actor-aba') {
                f.emit(second);
                f.emit(first);
            }
            if (drift === 'unmount') {
                f.lifecycle.unmount();
                f.lifecycle.mount();
            }
            if (drift === 'invitation') f.lifecycle.setScope('invitation-two:bearer-two');
            if (drift === 'token') f.lifecycle.setScope('invitation-one:replacement-bearer');
            c.response.resolve({ projectId: 'old-project' });
            await c.run;
            expect(c.effects).toEqual(['dispatch']);
        });
    }

    it('does not display a delayed failure or finish a newer request', async () => {
        const f = surface();
        const old = claim(f);
        f.emit(second);
        const next = claim(f);
        old.response.reject(new Error('old response'));
        await old.run;
        expect(old.effects).toEqual(['dispatch']);
        expect(f.lifecycle.begin()).toBeNull();
        next.response.resolve({ projectId: 'new-project' });
        await next.run;
        expect(next.effects).toEqual([
            'dispatch',
            'remove-bearer:new-project',
            'navigate:new-project',
            'finish',
        ]);
    });

    it('rechecks the live Clerk identity before dispatch even before its listener runs', async () => {
        const f = surface();
        const operation = f.lifecycle.begin()!;
        f.replaceWithoutEmission(second);
        const calls: string[] = [];
        await runInvitationClaim(
            operation,
            async () => {
                calls.push('dispatch');
                return null;
            },
            {
                success: () => {
                    calls.push('success');
                },
                failure: () => {
                    calls.push('error');
                },
                finish: () => {
                    calls.push('finish');
                },
            },
        );
        expect(calls).toEqual([]);
    });

    it('retains the bearer on unknown failure and permits a later explicit retry', async () => {
        const f = surface();
        const c = claim(f);
        c.response.reject(new Error('lost response'));
        await c.run;
        expect(c.effects).toEqual(['dispatch', 'error', 'finish']);
        expect(f.lifecycle.begin()).not.toBeNull();
    });
});
