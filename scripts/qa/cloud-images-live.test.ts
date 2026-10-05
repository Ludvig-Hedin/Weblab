import { test } from 'bun:test';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createClerkClient } from '@clerk/backend';
import { ConvexHttpClient } from 'convex/browser';
import { EditorAttributes } from '@weblab/constants';
import { parse, t, type T } from '@weblab/parser/src/packages';
import { getContentFromAst } from '@weblab/parser/src/parse';
import { formatContent } from '@weblab/parser/src/prettier';
import type { Id } from '../../apps/web/client/convex/_generated/dataModel';
import { approveCloudContentBindings, validateCloudContentCandidate, type CloudContentBinding } from '../../apps/web/client/convex/lib/cloudContentContract';
import { cloudEditorApi, type CloudEditorCommit, type CloudEditorContentCommit } from '../../apps/web/client/src/lib/cloud-editor/api';
import { cloudContentApi } from '../../apps/web/client/src/components/cloud-editor/content-api';

// Authenticated public APIs on the existing disposable enrollment only.
// No preview, runtime, project creation, membership or admin Convex calls.
const scope = {
    projectId: 'p970dbg47ttd3ab7b8jhpjxrbx8fhky7' as Id<'projects'>,
    branchId: 'jd7brvw4gacafvy1hfndxsgz9x8fhw3m' as Id<'branches'>,
};
const backend = 'https://accomplished-grouse-400.convex.cloud';
function check(value: unknown): asserts value { if (!value) throw new Error('Image acceptance assertion failed'); }
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
function stable(value: unknown): string {
    return JSON.stringify(value, (_key, entry: unknown) => entry && typeof entry === 'object' && !Array.isArray(entry)
        ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry);
}
function imageAttribute(ast: T.File, oid: string, name: string): T.StringLiteral {
    let found: T.StringLiteral | undefined;
    t.traverseFast(ast, node => {
        if (!t.isJSXElement(node)) return;
        const attrs = node.openingElement.attributes;
        if (!attrs.some(attr => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name, { name: EditorAttributes.DATA_WEBLAB_ID })
            && t.isStringLiteral(attr.value) && attr.value.value === oid)) return;
        const attr = attrs.find(entry => t.isJSXAttribute(entry) && t.isJSXIdentifier(entry.name, { name }));
        check(t.isJSXAttribute(attr) && t.isStringLiteral(attr.value));
        found = attr.value;
    });
    check(found); return found;
}

test.skipIf(!process.env.WEBLAB_CLOUD_LIVE_TEST_ACCOUNTS)(
    'real customer changes approved raster image and alt text with exact fixture cleanup', async () => {
        let stage = 'configuration';
        let failure: string | null = null;
        const checked: string[] = [];
        const coverage = { src: false, alt: false };
        const sessions: string[] = [];
        let clerk: ReturnType<typeof createClerkClient> | undefined;
        let cleanup: (() => Promise<void>) | undefined;
        let journalPath: string | undefined;
        let resultPath: string | undefined;
        let journalOwned = false;
        let restored = false;
        let revision = 0;
        let pending: (() => Promise<void>) | undefined;
        try {
            const accountPath = process.env.WEBLAB_CLOUD_LIVE_TEST_ACCOUNTS!;
            journalPath = join(dirname(accountPath), 'cloud-images-live-recovery.json');
            resultPath = join(dirname(accountPath), 'cloud-images-live-results.json');
            // Never replace an unresolved prior run's original source or receipts.
            stage = 'prior recovery journal must be resolved';
            check(!existsSync(journalPath));
            const secretKey = process.env.CLERK_SECRET_KEY;
            check(secretKey?.startsWith('sk_test_'));
            const accounts: Array<{ role: string; id: string }> = JSON.parse(readFileSync(accountPath, 'utf8'));
            clerk = createClerkClient({ secretKey });
            const login = async (role: string) => {
                const account = accounts.find(entry => entry.role === role); check(account);
                const session = await clerk!.sessions.createSession({ userId: account.id }); sessions.push(session.id);
                const token = await clerk!.sessions.getToken(session.id, 'convex');
                const client = new ConvexHttpClient(backend, { logger: false }); client.setAuth(token.jwt); return client;
            };
            stage = 'account and restorable contract preflight';
            const builder = await login('builder');
            const customer = await login('outsider');
            const before = await builder.query(cloudEditorApi.snapshot, scope);
            const customerSnapshot = await customer.query(cloudEditorApi.snapshot, scope);
            const access = await customer.query(cloudEditorApi.access, scope);
            check(access.role === 'content' && !access.canDesign && access.canEditContent && customerSnapshot.revision === before.revision);
            const originalApprovals = await builder.query(cloudEditorApi.contracts, scope);
            const inventory = await builder.query(cloudContentApi.assets, scope);
            check(originalApprovals.revision === before.revision && inventory.revision === before.revision);
            const originalContract = originalApprovals.contracts.find(entry => /^(src\/)?app\/page\.tsx$/.test(entry.path));
            // No public API can restore inactive bindings without reapproving.
            // Leave absent/revoked approvals untouched rather than resurrect them.
            check(originalContract?.active);
            const page = before.files.find(entry => entry.path === originalContract.path); check(page?.text);
            const original = page.text;
            const originalBindings = structuredClone(originalContract.bindings);
            const originalAssets = inventory.assets.map(asset => asset.url);
            check(approveCloudContentBindings({ path: page.path, source: original, bindings: originalBindings,
                approvedAssetPaths: originalAssets }).fingerprint === originalContract.fingerprint);
            const nonce = crypto.randomUUID().replaceAll('-', '');
            const oid = `qa_image_${nonce}`;
            check(!before.files.some(file => file.text?.includes(oid)));
            const selected: Array<{ path: string; url: string; bytes: Uint8Array; created: boolean }> = [];
            for (const asset of inventory.assets.filter(entry => /\.png$/i.test(entry.path)).slice(0, 2)) {
                const file = before.files.find(entry => entry.path === asset.path); check(file?.storageId);
                const bytes = new Uint8Array(await builder.action(cloudEditorApi.readAsset, { ...scope, path: asset.path, expectedHash: file.hash }));
                check(hash(bytes) === file.hash);
                selected.push({ ...asset, bytes, created: false });
            }
            const fixturePaths = ['../../apps/web/client/public/favicon.png', '../../apps/web/client/public/brand/symbol.png'];
            while (selected.length < 2) {
                const index = selected.length;
                const bytes = new Uint8Array(readFileSync(new URL(fixturePaths[index]!, import.meta.url)));
                const path = `public/qa-cloud-image-${nonce}-${index}.png`;
                check(!before.files.some(file => file.path === path));
                selected.push({ path, url: path.slice('public'.length), bytes, created: true });
            }
            for (const asset of selected) check(asset.bytes.length < 2_000_000
                && Buffer.from(asset.bytes.subarray(0, 8)).toString('hex') === '89504e470d0a1a0a');
            const parsePage = (source: string) => parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
            const ast = parsePage(original);
            const exported = ast.program.body.find(node => t.isExportDefaultDeclaration(node));
            check(exported && t.isExportDefaultDeclaration(exported) && t.isFunctionDeclaration(exported.declaration));
            const returned = exported.declaration.body.body.find(node => t.isReturnStatement(node));
            check(returned && t.isReturnStatement(returned) && t.isJSXElement(returned.argument));
            returned.argument.children.push(t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier('img'), [
                t.jsxAttribute(t.jsxIdentifier(EditorAttributes.DATA_WEBLAB_ID), t.stringLiteral(oid)),
                t.jsxAttribute(t.jsxIdentifier('src'), t.stringLiteral(selected[0]!.url)),
                t.jsxAttribute(t.jsxIdentifier('alt'), t.stringLiteral('Temporary acceptance image')),
            ], true), null, [], true));
            const fixture = await formatContent(page.path, await getContentFromAst(ast, original));
            const bindings: CloudContentBinding[] = [...originalBindings, { oid, fields: ['src', 'alt'],
                allowedValues: { src: selected.map(asset => asset.url) } }];
            const approvedAssetPaths = [...originalAssets, ...selected.map(asset => asset.url)];
            const temporaryContract = approveCloudContentBindings({ path: page.path, source: fixture, bindings, approvedAssetPaths });
            const candidateAst = parsePage(fixture);
            imageAttribute(candidateAst, oid, 'src').value = selected[1]!.url;
            imageAttribute(candidateAst, oid, 'alt').value = `Customer image description ${nonce}`;
            const candidate = await formatContent(page.path, await getContentFromAst(candidateAst, fixture));
            const operations = validateCloudContentCandidate({ contract: temporaryContract, originalSource: fixture,
                candidateSource: candidate, approvedAssetPaths }).operations;
            check(operations.length === 2 && operations.some(op => op.field === 'src') && operations.some(op => op.field === 'alt'));
            let generation = originalContract.generation;
            let active = true;
            let currentBindings: CloudContentBinding[] = originalBindings;
            revision = before.revision;
            const journal: Record<string, unknown> = { version: 1, backend, scope, originalSnapshot: before,
                originalContract, fixture, candidate, temporaryBindings: bindings,
                createdAssets: selected.filter(asset => asset.created).map(asset => ({ path: asset.path, hash: hash(asset.bytes), base64: Buffer.from(asset.bytes).toString('base64') })),
                operations: [] };
            const persist = (request?: unknown) => {
                if (request) (journal.operations as unknown[]).push(request);
                Object.assign(journal, { stage, revision, generation, active });
                const text = JSON.stringify(journal, (_key, value: unknown) => value instanceof ArrayBuffer
                    ? { encoding: 'base64', data: Buffer.from(value).toString('base64') } : value, 2);
                if (!journalOwned) { writeFileSync(journalPath!, text, { mode: 0o600, flag: 'wx' }); journalOwned = true; }
                else { writeFileSync(`${journalPath}.tmp`, text, { mode: 0o600 }); chmodSync(`${journalPath}.tmp`, 0o600); renameSync(`${journalPath}.tmp`, journalPath!); }
                chmodSync(journalPath!, 0o600);
            };
            persist();
            const save = async (request: CloudEditorCommit | CloudEditorContentCommit) => {
                persist(request);
                pending = async () => {
                    const saved = 'transport' in request
                        ? await customer.action(cloudEditorApi.commitContent, request)
                        : await builder.action(cloudEditorApi.commit, request);
                    check(saved.revision === request.expectedRevision + 1 && saved.currentRevision === saved.revision);
                    revision = saved.revision; pending = undefined; persist();
                };
                await pending();
            };
            const designRequest = (changes: CloudEditorCommit['changes']): CloudEditorCommit => ({ ...scope, actorId: before.actorId,
                expectedRevision: revision, operationId: crypto.randomUUID(), changes });
            const contentRequest = (content: string): CloudEditorContentCommit => ({ ...scope, actorId: customerSnapshot.actorId,
                transport: 'content', transportVersion: 1, expectedRevision: revision, operationId: crypto.randomUUID(),
                changes: [{ path: page.path, content }], expectedContracts: [{ path: page.path, generation }] });
            const setApproval = async (nextBindings: CloudContentBinding[], nextActive: boolean) => {
                const expectedGeneration = generation;
                const request = { ...scope, path: page.path, expectedRevision: revision, expectedGeneration, bindings: nextBindings };
                persist({ action: nextActive ? 'approve' : 'revoke', ...request });
                pending = async () => {
                    try {
                        if (nextActive) await builder.action(cloudContentApi.approve, request);
                        else await builder.mutation(cloudContentApi.revoke, { ...scope, path: page.path, expectedGeneration });
                    } catch (error) {
                        // A matching observed generation resolves a lost acknowledgement.
                        check(error instanceof Error && error.message.includes('CLOUD_CONTENT_STALE_CONTRACT'));
                    }
                    const observed = await builder.query(cloudEditorApi.contracts, scope);
                    const row = observed.contracts.find(entry => entry.path === page.path);
                    check(observed.revision === revision && row?.generation === expectedGeneration + 1
                        && row.active === nextActive && stable(row.bindings) === stable(nextBindings));
                    generation = row.generation; active = nextActive; currentBindings = nextBindings; pending = undefined; persist();
                };
                await pending();
            };
            cleanup = async () => {
                if (pending) await pending(); // Unresolved receipts retain the journal and stop cleanup.
                const current = await builder.query(cloudEditorApi.snapshot, scope);
                const approvals = await builder.query(cloudEditorApi.contracts, scope);
                const row = approvals.contracts.find(entry => entry.path === page.path);
                check(current.revision === revision && approvals.revision === revision && row?.generation === generation
                    && row.active === active && stable(row.bindings) === stable(currentBindings));
                const text = current.files.find(file => file.path === page.path)?.text;
                check(text === original || text === fixture || text === candidate);
                for (const asset of selected.filter(entry => entry.created)) {
                    const file = current.files.find(entry => entry.path === asset.path);
                    check(!file || file.hash === hash(asset.bytes));
                }
                if (text !== original) {
                    if (active) await setApproval(currentBindings, false);
                    await save(designRequest([{ path: page.path, content: original },
                        ...selected.filter(asset => asset.created).map(asset => ({ path: asset.path, content: null }))]));
                }
                if (!active || stable(currentBindings) !== stable(originalBindings)) await setApproval(originalBindings, true);
                const finalSource = await builder.query(cloudEditorApi.snapshot, scope);
                const finalApprovals = await builder.query(cloudEditorApi.contracts, scope);
                check(finalSource.revision === revision && finalApprovals.revision === revision);
                const manifest = (files: typeof before.files) => files.map(({ path, kind, hash, bytes }) => ({ path, kind, hash, bytes })).sort((a, b) => a.path.localeCompare(b.path));
                check(stable(manifest(finalSource.files)) === stable(manifest(before.files)));
                const finalContract = finalApprovals.contracts.find(entry => entry.path === page.path);
                check(finalContract?.active === originalContract.active && stable(finalContract?.bindings) === stable(originalBindings));
                restored = true; persist();
            };
            stage = 'atomic builder image fixture setup';
            await save(designRequest([{ path: page.path, content: fixture }, ...selected.filter(asset => asset.created)
                .map(asset => ({ path: asset.path, content: asset.bytes.buffer.slice(asset.bytes.byteOffset, asset.bytes.byteOffset + asset.bytes.byteLength) as ArrayBuffer }))]));
            checked.push(stage);
            stage = 'builder approves image choices and alt text';
            await setApproval(bindings, true); checked.push(stage);
            stage = 'customer image and alt save with identical receipt retry';
            const request = contentRequest(candidate);
            await save(request);
            const replay = await customer.action(cloudEditorApi.commitContent, request);
            check(replay.revision === revision && replay.currentRevision === revision);
            const reopened = await customer.query(cloudEditorApi.snapshot, scope);
            check(reopened.revision === revision && reopened.files.find(file => file.path === page.path)?.text === candidate);
            for (const asset of selected) {
                const file = reopened.files.find(entry => entry.path === asset.path); check(file?.storageId && file.hash === hash(asset.bytes));
                const read = await customer.action(cloudEditorApi.readAsset, { ...scope, path: asset.path, expectedHash: file.hash });
                check(hash(new Uint8Array(read)) === hash(asset.bytes));
            }
            coverage.src = true; coverage.alt = true;
            checked.push(stage);
            stage = 'unapproved image URL rejected without source change';
            const forged = parsePage(candidate);
            imageAttribute(forged, oid, 'src').value = `/unapproved-${nonce}.png`;
            const invalid = await formatContent(page.path, await getContentFromAst(forged, candidate));
            let denied = false;
            try { await customer.action(cloudEditorApi.commitContent, contentRequest(invalid)); }
            catch (error) { denied = error instanceof Error && error.message.includes('CLOUD_CONTENT_INVALID_VALUE'); }
            check(denied);
            const unchanged = await customer.query(cloudEditorApi.snapshot, scope);
            check(unchanged.revision === revision && unchanged.files.find(file => file.path === page.path)?.text === candidate);
            checked.push(stage);
            stage = 'exact source, manifest and approval restoration';
            await cleanup(); cleanup = undefined; checked.push(stage);
        } catch (error) {
            const code = error instanceof Error ? error.message.match(/\bCLOUD_[A-Z_]+\b/)?.[0] : null;
            failure = code ? `${stage} (${code})` : stage;
        } finally {
            if (cleanup) {
                try { await cleanup(); checked.push('original image fixture cleanup'); }
                catch { failure = 'image fixture recovery journal needs owner attention'; }
            }
            if (clerk) {
                const outcomes = await Promise.allSettled(sessions.map(id => clerk!.sessions.revokeSession(id)));
                if (outcomes.some(result => result.status === 'rejected')) failure = 'test session cleanup';
            }
            if (journalOwned && restored) unlinkSync(journalPath!);
            if (resultPath) {
                writeFileSync(resultPath, JSON.stringify({ checked: failure ? [...checked, `FAILED: ${failure}`] : checked,
                    revision, restored, coverage, recoveryRequired: Boolean(journalPath && existsSync(journalPath)) }, null, 2), { mode: 0o600 });
                chmodSync(resultPath, 0o600);
            }
        }
        if (failure) throw new Error(`Cloud image live acceptance failed at: ${failure}`);
    }, 120_000,
);
