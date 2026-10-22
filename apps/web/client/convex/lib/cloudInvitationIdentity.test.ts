import { describe, expect, it } from 'bun:test';
import type { MutationCtx } from '../_generated/server';
import { requireCloudInvitationIdentity } from './cloudInvitationIdentity';

type Row = Record<string, unknown> & { _id: string; _creationTime: number };
function fixture() {
    const rows = new Map<string, Row>();
    const writes: string[] = [];
    let subject: string | null = 'client';
    const ctx = {
        auth: { getUserIdentity: async () => subject ? { subject, tokenIdentifier: `issuer|${subject}`,
            email: 'primary@example.com', givenName: 'Client', familyName: 'Person', name: 'Client Person' } : null },
        db: {
            get: async (id: string) => rows.get(id) ?? null,
            insert: async (table: string, fields: Record<string, unknown>) => {
                const id = `${table}:new`; rows.set(id, { _id: id, _creationTime: 3, ...fields }); writes.push(`insert:${table}`); return id;
            },
            query: () => {
                let wanted: string | undefined;
                const index = { eq: (_key: string, value: string) => { wanted = value; return index; } };
                const query = { withIndex: (_name: string, build: (q: typeof index) => unknown) => { build(index); return query; },
                    collect: async () => [...rows.values()].filter(row => row.clerkUserId === wanted) };
                return query;
            },
        },
    } as unknown as MutationCtx;
    return { ctx, rows, writes, signIn: (value: string | null) => { subject = value; } };
}

describe('identity creation inside a validated pending cloud invitation claim', () => {
    it('rejects missing and changed Clerk subjects before writing', async () => {
        const f = fixture(); f.signIn(null);
        await expect(requireCloudInvitationIdentity(f.ctx, 'client')).rejects.toThrow('UNAUTHORIZED');
        f.signIn('other');
        await expect(requireCloudInvitationIdentity(f.ctx, 'client')).rejects.toThrow('UNAUTHORIZED');
        expect(f.writes).toEqual([]);
    });

    it('retains the canonical stored email rather than replacing it with identity or invitation aliases', async () => {
        const f = fixture();
        f.rows.set('users:canonical', { _id: 'users:canonical', _creationTime: 1, clerkUserId: 'client', email: 'stored@example.com' });
        expect((await requireCloudInvitationIdentity(f.ctx, 'client')).email).toBe('stored@example.com');
        expect(f.writes).toEqual([]);
    });

    it('uses the same earliest canonical duplicate without deleting referenced rows', async () => {
        const f = fixture();
        f.rows.set('users:later', { _id: 'users:later', _creationTime: 2, clerkUserId: 'client', email: 'later@example.com' });
        f.rows.set('users:first', { _id: 'users:first', _creationTime: 1, clerkUserId: 'client', email: 'first@example.com' });
        expect((await requireCloudInvitationIdentity(f.ctx, 'client'))._id).toBe('users:first');
        expect(f.rows.size).toBe(2); expect(f.writes).toEqual([]);
    });

    it('creates only the missing canonical identity and returns it unchanged on retry', async () => {
        const f = fixture();
        const user = await requireCloudInvitationIdentity(f.ctx, 'client');
        expect(user).toMatchObject({ clerkUserId: 'client', email: 'primary@example.com', firstName: 'Client', displayName: 'Client Person' });
        expect(await requireCloudInvitationIdentity(f.ctx, 'client')).toEqual(user);
        expect(f.writes).toEqual(['insert:users']);
    });
});
