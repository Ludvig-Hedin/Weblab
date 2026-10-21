import { test, expect } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { createClerkClient } from '@clerk/backend';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import type { Id } from '../../apps/web/client/convex/_generated/dataModel';

import { cloudEditorApi } from '../../apps/web/client/src/lib/cloud-editor/api';

// Opt-in, disposable test deployment only. Never use the app's default backend.
test.skipIf(!process.env.WEBLAB_CLOUD_LIVE_TEST_ACCOUNTS)('durable source accepts real sessions, atomic revisions and retries', async () => {
    const accountPath = process.env.WEBLAB_CLOUD_LIVE_TEST_ACCOUNTS!;
    const key = process.env.CLERK_SECRET_KEY;
    if (!key?.startsWith('sk_test_')) throw new Error('A Clerk test key is required');
    const accounts: Array<{ role: string; id: string }> = JSON.parse(readFileSync(accountPath, 'utf8'));
    const clerk = createClerkClient({ secretKey: key });
    const sessions: string[] = [];
    const url = 'https://accomplished-grouse-400.convex.cloud';
    const login = async (role: string) => {
        const user = accounts.find(account => account.role === role);
        if (!user) throw new Error(`Missing test account: ${role}`);
        const session = await clerk.sessions.createSession({ userId: user.id });
        sessions.push(session.id);
        const token = await clerk.sessions.getToken(session.id, 'convex');
        const client = new ConvexHttpClient(url);
        client.setAuth(token.jwt);
        return client;
    };
    try {
        const builder = await login('builder');
        const otherSession = await login('builder');
        const outsider = await login('outsider');
        const anonymous = new ConvexHttpClient(url);
        const workspace = await builder.mutation(makeFunctionReference<'mutation', Record<string, never>, { _id: string }>('workspaces:ensurePersonal'), {});
        const request = { workspaceId: workspace._id as Id<'workspaces'>, name: 'Visual editor verification', creationId: 'cloud-source-acceptance-v1' };
        const scope = await builder.action(cloudEditorApi.create, request);
        expect(await otherSession.action(cloudEditorApi.create, request)).toEqual(scope);
        const before = await builder.query(cloudEditorApi.snapshot, scope);
        expect(before.files.some(file => file.path.endsWith('/about/page.tsx'))).toBe(true);
        const page = before.files.find(file => /(?:^|\/)app\/page\.tsx$/.test(file.path));
        if (!page?.text) throw new Error('Missing real Next.js page');
        const stamp = crypto.randomUUID();
        const save = { ...scope, actorId: before.actorId, expectedRevision: before.revision, operationId: stamp,
            changes: [{ path: page.path, content: `${page.text}\n// Source verification ${stamp}\n` },
                { path: 'public/verification.txt', content: `Durable source ${stamp}` }] };
        const saved = await builder.action(cloudEditorApi.commit, save);
        expect(saved.revision).toBe(before.revision + 1);
        expect(await otherSession.action(cloudEditorApi.commit, save)).toEqual(saved);
        const reopened = await otherSession.query(cloudEditorApi.snapshot, scope);
        for (const change of save.changes) expect(reopened.files.find(file => file.path === change.path)?.text).toBe(change.content);
        await expect(outsider.query(cloudEditorApi.snapshot, scope)).rejects.toThrow('FORBIDDEN');
        await expect(outsider.action(cloudEditorApi.commit, save)).rejects.toThrow('FORBIDDEN');
        await expect(anonymous.query(cloudEditorApi.snapshot, scope)).rejects.toThrow('UNAUTHORIZED');
        const concurrent = await Promise.allSettled([builder, otherSession].map((client, index) => client.action(cloudEditorApi.commit, {
            ...scope, actorId: before.actorId, expectedRevision: saved.revision, operationId: crypto.randomUUID(),
            changes: [{ path: 'public/verification.txt', content: `Concurrent ${index}` }],
        })));
        expect(concurrent.filter(result => result.status === 'fulfilled')).toHaveLength(1);
        const rejection = concurrent.find(result => result.status === 'rejected');
        expect(String(rejection?.status === 'rejected' ? rejection.reason : '')).toContain('CLOUD_CONFLICT');
        const final = await builder.query(cloudEditorApi.snapshot, scope);
        const image = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jh1sAAAAASUVORK5CYII=', 'base64')).buffer;
        await builder.action(cloudEditorApi.commit, { ...scope, actorId: before.actorId,
            expectedRevision: final.revision, operationId: crypto.randomUUID(),
            changes: [{ path: 'public/verification.png', content: image }] });
        const withImage = await otherSession.query(cloudEditorApi.snapshot, scope);
        const imageFile = withImage.files.find(file => file.path === 'public/verification.png');
        if (!imageFile) throw new Error('Stored image missing');
        const asset = { ...scope, path: imageFile.path, expectedHash: imageFile.hash };
        expect(new Uint8Array(await otherSession.action(cloudEditorApi.readAsset, asset))).toEqual(new Uint8Array(image));
        await expect(outsider.action(cloudEditorApi.readAsset, asset)).rejects.toThrow('FORBIDDEN');
        const resultPath = new URL('./cloud-source-live-results.json', `file://${accountPath}`).pathname;
        writeFileSync(resultPath, JSON.stringify({ timestamp: new Date().toISOString(), scope, revision: withImage.revision,
            checked: ['real auth', 'idempotent create', 'two-file save', 'idempotent retry', 'separate-session reopen', 'outsider denial', 'anonymous denial', 'concurrent CAS', 'exact binary image recovery', 'private asset denial'] }, null, 2), { mode: 0o600 });
    } finally {
        await Promise.all(sessions.map(id => clerk.sessions.revokeSession(id)));
    }
}, 90_000);
