import { test } from 'bun:test';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createClerkClient } from '@clerk/backend';
import { ConvexHttpClient } from 'convex/browser';
import { EditorAttributes } from '@weblab/constants';
import { parse, t, type T } from '@weblab/parser/src/packages';
import { getContentFromAst } from '@weblab/parser/src/parse';
import { formatContent } from '@weblab/parser/src/prettier';
import type { Id } from '../../apps/web/client/convex/_generated/dataModel';
import type { CloudContentBinding, CloudContentField } from '../../apps/web/client/convex/lib/cloudContentContract';
import { cloudEditorApi, type CloudEditorContentCommit } from '../../apps/web/client/src/lib/cloud-editor/api';
import { cloudContentApi } from '../../apps/web/client/src/components/cloud-editor/content-api';

// Existing disposable enrollment only. No project creation, admin Convex calls,
// preview calls or VM provisioning. Saves may sync an already running lease.
const scope = {
    projectId: 'p970dbg47ttd3ab7b8jhpjxrbx8fhky7' as Id<'projects'>,
    branchId: 'jd7brvw4gacafvy1hfndxsgz9x8fhw3m' as Id<'branches'>,
};
const backend = 'https://accomplished-grouse-400.convex.cloud';
function check(condition: unknown): asserts condition {
    if (!condition) throw new Error('Live attribute acceptance assertion failed');
}
function literal(node: T.JSXElement, name: string): T.StringLiteral | null {
    const attr = node.openingElement.attributes.find(entry => t.isJSXAttribute(entry) && t.isJSXIdentifier(entry.name, { name }));
    if (!t.isJSXAttribute(attr)) return null;
    if (t.isStringLiteral(attr.value)) return attr.value;
    return t.isJSXExpressionContainer(attr.value) && t.isStringLiteral(attr.value.expression) ? attr.value.expression : null;
}
function targets(ast: T.File, tag: string, field: string) {
    const found: Array<{ node: T.JSXElement; oid: string; value: T.StringLiteral }> = [];
    t.traverseFast(ast, node => {
        if (!t.isJSXElement(node) || !t.isJSXIdentifier(node.openingElement.name, { name: tag })) return;
        const oid = literal(node, EditorAttributes.DATA_WEBLAB_ID);
        const value = literal(node, field);
        if (oid && value) found.push({ node, oid: oid.value, value });
    });
    return found;
}
function stable(value: unknown): string {
    return JSON.stringify(value, (_key, entry: unknown) => entry && typeof entry === 'object' && !Array.isArray(entry)
        ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry);
}

test.skipIf(!process.env.WEBLAB_CLOUD_LIVE_TEST_ACCOUNTS)(
    'real customer saves approved attributes and restores source and original approvals', async () => {
        let stage = 'test configuration';
        let failure: string | null = null;
        let revision = 0;
        const checked: string[] = [];
        const coverage = { className: false, href: false, src: false, alt: false };
        const sessions: string[] = [];
        let clerk: ReturnType<typeof createClerkClient> | undefined;
        let cleanup: (() => Promise<void>) | undefined;
        let resultPath: string | undefined;
        try {
            const accountPath = process.env.WEBLAB_CLOUD_LIVE_TEST_ACCOUNTS!;
            resultPath = join(dirname(accountPath), 'cloud-attributes-live-results.json');
            const key = process.env.CLERK_SECRET_KEY;
            check(key?.startsWith('sk_test_'));
            const accounts: Array<{ role: string; id: string }> = JSON.parse(readFileSync(accountPath, 'utf8'));
            clerk = createClerkClient({ secretKey: key });
            const login = async (role: string) => {
                const account = accounts.find(entry => entry.role === role);
                check(account);
                const session = await clerk!.sessions.createSession({ userId: account.id });
                sessions.push(session.id);
                const token = await clerk!.sessions.getToken(session.id, 'convex');
                const client = new ConvexHttpClient(backend, { logger: false });
                client.setAuth(token.jwt);
                return client;
            };
            stage = 'real account authentication';
            const builder = await login('builder');
            const customer = await login('outsider');
            const access = await customer.query(cloudEditorApi.access, scope);
            check(access.role === 'content' && access.canEditContent && !access.canDesign);
            stage = 'existing source and approval snapshot';
            const before = await customer.query(cloudEditorApi.snapshot, scope);
            const approvals = await customer.query(cloudEditorApi.contracts, scope);
            check(approvals.actorId === before.actorId && approvals.revision === before.revision);
            const originalContract = approvals.contracts.find(entry => entry.active && /^(src\/)?app\/page\.tsx$/.test(entry.path));
            check(originalContract);
            const page = before.files.find(entry => entry.path === originalContract.path);
            check(page?.text);
            const original = page.text;
            const parsePage = () => parse(original, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
            const ast = parsePage();
            const title = targets(ast, 'h1', 'className')[0];
            const link = targets(ast, 'a', 'href')[0];
            check(title && link);
            const bindings: CloudContentBinding[] = structuredClone(originalContract.bindings);
            const approveField = (oid: string, field: CloudContentField) => {
                let binding = bindings.find(entry => entry.oid === oid);
                if (!binding) { binding = { oid, fields: [] }; bindings.push(binding); }
                if (!binding.fields.includes(field)) binding.fields.push(field);
                return binding;
            };
            const variant = `${title.value.value} outline-2 outline-offset-2`;
            const titleBinding = approveField(title.oid, 'className');
            const suffix = crypto.randomUUID().replaceAll('-', '');
            titleBinding.choices = { ...titleBinding.choices, [`qa_original_${suffix}`]: title.value.value, [`qa_variant_${suffix}`]: variant };
            titleBinding.choiceLabels = { ...titleBinding.choiceLabels, [`qa_original_${suffix}`]: 'Original', [`qa_variant_${suffix}`]: 'Acceptance variant' };
            const destination = `/#cloud-attribute-acceptance-${suffix}`;
            const linkBinding = approveField(link.oid, 'href');
            linkBinding.allowedValues = { ...linkBinding.allowedValues,
                href: [...new Set([...(linkBinding.allowedValues?.href ?? []), link.value.value, destination])] };
            title.value.value = variant;
            link.value.value = destination;
            const image = targets(ast, 'img', 'src')[0];
            let hasImageSrcChange = false;
            let hasImageAltChange = false;
            if (image) {
                const inventory = await builder.query(cloudContentApi.assets, scope);
                check(inventory.revision === before.revision);
                const alternate = inventory.assets.find(asset => asset.url !== image.value.value);
                if (alternate && inventory.assets.some(asset => asset.url === image.value.value)) {
                    const binding = approveField(image.oid, 'src');
                    binding.allowedValues = { ...binding.allowedValues,
                        src: [...new Set([...(binding.allowedValues?.src ?? []), image.value.value, alternate.url])] };
                    image.value.value = alternate.url;
                    hasImageSrcChange = true;
                }
                const alt = literal(image.node, 'alt');
                if (alt) {
                    approveField(image.oid, 'alt');
                    alt.value = `Acceptance image description ${suffix}`;
                    hasImageAltChange = true;
                }
            }
            // Use the same AST output and final formatter as CodeFS.
            const candidate = await formatContent(page.path, await getContentFromAst(ast, original));
            const generation = originalContract.generation + 1;
            const operation = (expectedRevision: number, content: string): CloudEditorContentCommit => ({
                ...scope, actorId: before.actorId, transport: 'content', transportVersion: 1,
                expectedRevision, operationId: crypto.randomUUID(), changes: [{ path: page.path, content }],
                expectedContracts: [{ path: page.path, generation }],
            });
            let pendingSave: CloudEditorContentCommit | undefined;
            const approvalRequest = { ...scope, path: page.path, expectedRevision: before.revision,
                expectedGeneration: originalContract.generation, bindings };
            let pendingApproval = false;
            cleanup = async () => {
                if (pendingApproval) {
                    // Approval uses a generation CAS rather than receipts. Finish
                    // or fence the original attempt before observing cleanup state.
                    try { await builder.action(cloudContentApi.approve, approvalRequest); }
                    catch (error) {
                        check(error instanceof Error && /\bCLOUD_[A-Z_]+\b/.test(error.message));
                    }
                    pendingApproval = false;
                }
                // Resolve an uncertain acknowledgement before deciding which bytes to restore.
                if (pendingSave) { await customer.action(cloudEditorApi.commitContent, pendingSave); pendingSave = undefined; }
                let current = await customer.query(cloudEditorApi.snapshot, scope);
                const liveApprovals = await builder.query(cloudEditorApi.contracts, scope);
                check(liveApprovals.revision === current.revision);
                const liveContract = liveApprovals.contracts.find(entry => entry.path === page.path);
                check(liveContract?.active);
                const currentText = current.files.find(entry => entry.path === page.path)?.text;
                if (liveContract.generation === originalContract.generation && stable(liveContract.bindings) === stable(originalContract.bindings)) {
                    check(currentText === original); // Approval failed before making a change.
                    return;
                }
                if (liveContract.generation === generation + 1 && stable(liveContract.bindings) === stable(originalContract.bindings)) {
                    check(currentText === original); // Restoration succeeded despite a lost acknowledgement.
                    revision = current.revision;
                    return;
                }
                check(liveContract.generation === generation && stable(liveContract.bindings) === stable(bindings));
                if (currentText !== original) {
                    check(currentText === candidate); // Never replace a concurrent edit.
                    pendingSave = operation(current.revision, original);
                    await customer.action(cloudEditorApi.commitContent, pendingSave);
                    pendingSave = undefined;
                    current = await customer.query(cloudEditorApi.snapshot, scope);
                    check(current.files.find(entry => entry.path === page.path)?.text === original);
                }
                await builder.action(cloudContentApi.approve, { ...scope, path: page.path, expectedRevision: current.revision,
                    expectedGeneration: generation, bindings: originalContract.bindings });
                const restored = await builder.query(cloudEditorApi.contracts, scope);
                const restoredContract = restored.contracts.find(entry => entry.path === page.path);
                check(restoredContract?.active && restoredContract.generation === generation + 1
                    && stable(restoredContract.bindings) === stable(originalContract.bindings));
                revision = current.revision;
            };
            stage = 'builder approves preserved bindings and new attribute choices';
            pendingApproval = true;
            const approved = await builder.action(cloudContentApi.approve, approvalRequest);
            pendingApproval = false;
            check(approved.generation === generation);
            checked.push(stage);
            stage = 'customer attribute save, read and identical retry';
            const request = operation(before.revision, candidate);
            pendingSave = request;
            const saved = await customer.action(cloudEditorApi.commitContent, request);
            pendingSave = undefined;
            check(saved.revision === before.revision + 1);
            const retry = await customer.action(cloudEditorApi.commitContent, request);
            check(retry.revision === saved.revision && retry.currentRevision === saved.revision);
            const reopened = await customer.query(cloudEditorApi.snapshot, scope);
            check(reopened.revision === saved.revision && reopened.files.find(entry => entry.path === page.path)?.text === candidate);
            coverage.className = true; coverage.href = true; coverage.src = hasImageSrcChange; coverage.alt = hasImageAltChange;
            revision = reopened.revision;
            checked.push(stage);
            stage = 'unapproved attribute values rejected';
            const rejectedValues = [
                { tag: 'h1', field: 'className', oid: title.oid, value: `unapproved-${suffix}` },
                { tag: 'a', field: 'href', oid: link.oid, value: `/unapproved-${suffix}` },
            ];
            if (image && hasImageSrcChange) rejectedValues.push({ tag: 'img', field: 'src', oid: image.oid, value: `/unapproved-${suffix}.png` });
            for (const { tag, field, oid, value } of rejectedValues) {
                const forged = parse(candidate, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
                const target = targets(forged, tag, field).find(entry => entry.oid === oid);
                check(target);
                target.value.value = value;
                const content = await formatContent(page.path, await getContentFromAst(forged, candidate));
                let denied = false;
                try { await customer.action(cloudEditorApi.commitContent, operation(revision, content)); }
                catch (error) { denied = error instanceof Error && error.message.includes('CLOUD_CONTENT_INVALID_VALUE'); }
                check(denied);
            }
            const unchanged = await customer.query(cloudEditorApi.snapshot, scope);
            check(unchanged.revision === revision && unchanged.files.find(entry => entry.path === page.path)?.text === candidate);
            checked.push(stage);
            stage = 'original source and contract bindings restored';
            await cleanup();
            cleanup = undefined;
            checked.push(stage);
        } catch (error) {
            const code = error instanceof Error ? error.message.match(/\bCLOUD_[A-Z_]+\b/)?.[0] : null;
            failure = code ? `${stage} (${code})` : stage;
        } finally {
            if (cleanup) {
                try { await cleanup(); checked.push('original source and bindings cleanup'); }
                catch { failure = 'source or approval cleanup needs owner attention'; }
            }
            if (clerk) {
                const revoked = await Promise.allSettled(sessions.map(id => clerk!.sessions.revokeSession(id)));
                if (revoked.some(result => result.status === 'rejected')) failure = 'test session cleanup';
            }
            if (resultPath) {
                writeFileSync(resultPath, JSON.stringify({ checked: failure ? [...checked, `FAILED: ${failure}`] : checked, revision, coverage }, null, 2), { mode: 0o600 });
                chmodSync(resultPath, 0o600);
            }
        }
        if (failure) throw new Error(`Cloud attribute live acceptance failed at: ${failure}`);
    }, 120_000,
);
