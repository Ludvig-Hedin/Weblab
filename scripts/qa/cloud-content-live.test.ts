import { test } from 'bun:test';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createClerkClient } from '@clerk/backend';
import { ConvexHttpClient } from 'convex/browser';
import { EditorAttributes } from '@weblab/constants';
import { parse, t, type T } from '@weblab/parser/src/packages';
import { updateNodeTextContent } from '@weblab/parser/src/code-edit/text';
import { getContentFromAst } from '@weblab/parser/src/parse';
import { formatContent } from '@weblab/parser/src/prettier';
import type { Id } from '../../apps/web/client/convex/_generated/dataModel';
import { cloudEditorApi } from '../../apps/web/client/src/lib/cloud-editor/api';
import { cloudContentApi } from '../../apps/web/client/src/components/cloud-editor/content-api';

// This test only edits the already enrolled disposable project. There is no
// ensurePreview, project creation, runtime action or SDK allocation path.
const scope = {
    projectId: 'p970dbg47ttd3ab7b8jhpjxrbx8fhky7' as Id<'projects'>,
    branchId: 'jd7brvw4gacafvy1hfndxsgz9x8fhw3m' as Id<'branches'>,
};
const backend = 'https://accomplished-grouse-400.convex.cloud';
// The caller pins the next already-created, budget-recorded test runtime.
const sandboxId = process.env.WEBLAB_CLOUD_LIVE_SANDBOX_ID ?? 'sbx_ejLziYaXTB4mw9indKl2QLkxsLmb';

function check(condition: unknown): asserts condition {
    if (!condition) throw new Error('Live acceptance assertion failed');
}

// Diagnostics may expose only this fixed vocabulary, never server messages.
const diagnosticCodes: ReadonlySet<string> = new Set([
    'CLOUD_CONTENT_UNAPPROVED_CHANGE', 'CLOUD_CONTENT_INVALID_TARGET', 'CLOUD_CONTENT_INVALID_VALUE',
    'CLOUD_CONTENT_STALE_CONTRACT', 'CLOUD_CONTENT_INVALID_SOURCE', 'CLOUD_CONTENT_DUPLICATE_OID',
    'CLOUD_CONFLICT', 'CLOUD_ACTOR_CHANGED', 'CLOUD_ROLE_REQUIRED', 'CLOUD_DISABLED', 'CLOUD_INVALID_OPERATION',
    'FORBIDDEN', 'QA_UNEXPECTED_SUCCESS', 'QA_UNEXPECTED_ERROR',
]);
function diagnosticCode(error: unknown): string | undefined {
    const message = error instanceof Error ? error.message : '';
    return message.match(/\b(?:CLOUD_[A-Z_]+|FORBIDDEN|QA_[A-Z_]+)\b/g)?.find((code) => diagnosticCodes.has(code));
}

function pageAst(source: string) {
    return parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
}

function heading(ast: T.File, approved: readonly string[]): { node: T.JSXElement; oid: string } {
    const matches: Array<{ node: T.JSXElement; oid: string }> = [];
    t.traverseFast(ast, (node) => {
        if (!t.isJSXElement(node) || !t.isJSXIdentifier(node.openingElement.name, { name: 'h1' })) return;
        const attr = node.openingElement.attributes.find((attribute) => t.isJSXAttribute(attribute) &&
            t.isJSXIdentifier(attribute.name, { name: EditorAttributes.DATA_WEBLAB_ID }));
        if (t.isJSXAttribute(attr) && t.isStringLiteral(attr.value) && approved.includes(attr.value.value))
            matches.push({ node, oid: attr.value.value });
    });
    check(matches.length === 1);
    return matches[0]!;
}

test.skipIf(!process.env.WEBLAB_CLOUD_LIVE_TEST_ACCOUNTS)(
    'real customer saves approved canvas text and loses project access when removed', async () => {
        let stage = 'test configuration';
        let failure: string | null = null;
        let revision = 0;
        const checked: string[] = [];
        const sessions: string[] = [];
        const sourceOnly = process.env.WEBLAB_CLOUD_LIVE_SOURCE_ONLY === '1';
        let clerk: ReturnType<typeof createClerkClient> | undefined;
        let builder: ConvexHttpClient | undefined;
        let customer: ConvexHttpClient | undefined;
        // Keep the typed restoration payload separate from arbitrary query results.
        let membershipRestore: { email: string; role: 'content' | 'designer' | 'responsible'; publish: boolean } | undefined;
        let membershipRemovalAttempted = false;
        let restoreSource: (() => Promise<void>) | undefined;
        let resultPath: string | undefined;
        try {
            const accountPath = process.env.WEBLAB_CLOUD_LIVE_TEST_ACCOUNTS!;
            resultPath = join(dirname(accountPath), 'cloud-content-live-results.json');
            const key = process.env.CLERK_SECRET_KEY;
            check(key?.startsWith('sk_test_'));
            const accounts: Array<{ role: string; id: string }> = JSON.parse(readFileSync(accountPath, 'utf8'));
            clerk = createClerkClient({ secretKey: key });
            const login = async (role: string) => {
                const account = accounts.find((entry) => entry.role === role);
                check(account);
                const session = await clerk!.sessions.createSession({ userId: account.id });
                sessions.push(session.id);
                const token = await clerk!.sessions.getToken(session.id, 'convex');
                const client = new ConvexHttpClient(backend, { logger: false });
                client.setAuth(token.jwt);
                return client;
            };
            stage = 'real account authentication';
            builder = await login('builder');
            customer = await login('outsider');
            stage = 'content role and active text approval';
            const access = await customer.query(cloudEditorApi.access, scope);
            check(access.role === 'content' && access.canEditContent && !access.canDesign);
            const before = await customer.query(cloudEditorApi.snapshot, scope);
            const contracts = await customer.query(cloudEditorApi.contracts, scope);
            check(contracts.actorId === before.actorId && contracts.revision === before.revision);
            const member = (await builder.query(cloudContentApi.listMembers, scope))
                .find((entry) => entry.userId === before.actorId);
            check(member?.active && member.role === 'content' && member.email);
            membershipRestore = { email: member.email, role: member.role, publish: member.publish };
            const contract = contracts.contracts.find((entry) => entry.active && /^(src\/)?app\/page\.tsx$/.test(entry.path));
            check(contract);
            const page = before.files.find((entry) => entry.path === contract.path);
            check(page?.text);
            const original = page.text;
            const ast = pageAst(original);
            const target = heading(ast, contract.bindings.filter((binding) => binding.fields.includes('text')).map((binding) => binding.oid));
            updateNodeTextContent(target.node, `Customer cloud acceptance ${crypto.randomUUID()}`);
            // Match the editor's final source formatter. Raw Babel output can
            // alter unrelated JSX whitespace and correctly fail the contract.
            const candidate = await formatContent(page.path, await getContentFromAst(ast, original));
            const operation = (expectedRevision: number, path: string, content: string, generation: number) => ({
                ...scope, actorId: before.actorId, transport: 'content' as const, transportVersion: 1 as const,
                expectedRevision, operationId: crypto.randomUUID(), changes: [{ path, content }],
                expectedContracts: [{ path, generation }],
            });
            checked.push(stage);
            restoreSource = async () => {
                const current = await customer!.query(cloudEditorApi.snapshot, scope);
                const currentText = current.files.find((entry) => entry.path === page.path)?.text;
                if (currentText === original) return;
                // Never overwrite a concurrent agency/customer edit during cleanup.
                check(currentText === candidate);
                const restored = await customer!.action(cloudEditorApi.commitContent,
                    operation(current.revision, page.path, original, contract.generation));
                const saved = await customer!.query(cloudEditorApi.snapshot, scope);
                check(saved.files.find((entry) => entry.path === page.path)?.text === original);
                revision = restored.revision;
            };
            stage = 'approved heading save and idempotent retry';
            const request = operation(before.revision, page.path, candidate, contract.generation);
            const saved = await customer.action(cloudEditorApi.commitContent, request);
            check(saved.revision === before.revision + 1);
            const retry = await customer.action(cloudEditorApi.commitContent, request);
            check(retry.revision === saved.revision && retry.currentRevision === saved.revision);
            const reopened = await customer.query(cloudEditorApi.snapshot, scope);
            check(reopened.revision === saved.revision && reopened.files.find((entry) => entry.path === page.path)?.text === candidate);
            checked.push(stage);
            stage = 'original heading restored by customer operation';
            await restoreSource();
            restoreSource = undefined;
            checked.push(stage);

            const rejects = async (work: () => Promise<unknown>, allowedCodes: readonly string[]) => {
                try { await work(); } catch (error) {
                    const code = diagnosticCode(error);
                    if (code && allowedCodes.includes(code)) return;
                    throw new Error(code ?? 'QA_UNEXPECTED_ERROR');
                }
                throw new Error('QA_UNEXPECTED_SUCCESS');
            };
            stage = 'unapproved style value rejected';
            const forged = pageAst(original);
            const attributes = heading(forged, [target.oid]).node.openingElement.attributes;
            const className = attributes.find((attribute) => t.isJSXAttribute(attribute) &&
                t.isJSXIdentifier(attribute.name, { name: 'className' }));
            if (t.isJSXAttribute(className)) {
                check(t.isStringLiteral(className.value));
                className.value.value += ' outline-8';
                const binding = contract.bindings.find((entry) => entry.oid === target.oid);
                check(!Object.values(binding?.choices ?? {}).includes(className.value.value));
            } else attributes.push(t.jsxAttribute(t.jsxIdentifier('className'), t.stringLiteral('outline-8')));
            const forgedCandidate = await formatContent(page.path, await getContentFromAst(forged, original));
            await rejects(() => customer!.action(cloudEditorApi.commitContent,
                operation(revision, page.path, forgedCandidate, contract.generation)), ['CLOUD_CONTENT_UNAPPROVED_CHANGE', 'CLOUD_CONTENT_INVALID_TARGET', 'CLOUD_CONTENT_INVALID_VALUE']);
            check((await customer.query(cloudEditorApi.snapshot, scope)).revision === revision);
            checked.push(stage);
            stage = 'unapproved source-file change rejected';
            await rejects(() => customer!.action(cloudEditorApi.commitContent,
                operation(revision, 'package.json', '{"name":"forged"}', contract.generation)), ['CLOUD_CONTENT_STALE_CONTRACT', 'CLOUD_CONTENT_INVALID_TARGET']);
            check((await customer.query(cloudEditorApi.snapshot, scope)).revision === revision);
            checked.push(stage);

            const httpStatus = async (url: URL) => {
                const response = await fetch(url, { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(8_000) });
                await response.body?.cancel();
                return response.status;
            };
            let withTicket: URL | undefined;
            if (!sourceOnly) {
                stage = 'actor preview ticket and anonymous denial';
                const ticket = await customer.mutation(cloudEditorApi.issuePreview, scope);
                check(ticket.sandboxId === sandboxId && ticket.expiresAt > Date.now() + 15_000);
                const status = await customer.query(cloudEditorApi.status, scope);
                check(status.previewUrl && status.previewToken === ticket.previewToken);
                const bare = new URL(status.previewUrl);
                check(bare.protocol === 'https:');
                bare.searchParams.delete('__weblab_preview');
                withTicket = new URL(bare);
                withTicket.searchParams.set('__weblab_preview', ticket.previewToken);
                check(await httpStatus(bare) === 401);
                check(await httpStatus(withTicket) === 303);
                checked.push(stage);
            }
            stage = sourceOnly ? 'removed customer denied saved source and access' :
                'removed customer denied saved source, access and old preview ticket';
            membershipRemovalAttempted = true;
            await builder.mutation(cloudContentApi.removeMember, { ...scope, userId: before.actorId });
            if (withTicket) check(await httpStatus(withTicket) === 401);
            await rejects(() => customer!.query(cloudEditorApi.snapshot, scope), ['FORBIDDEN']);
            await rejects(() => customer!.query(cloudEditorApi.access, scope), ['FORBIDDEN']);
            checked.push(stage);
        } catch (error) {
            const code = diagnosticCode(error);
            failure = code ? `${stage} (${code})` : stage;
        } finally {
            if (membershipRemovalAttempted && builder && membershipRestore) {
                try {
                    await builder.mutation(cloudContentApi.setMember, { ...scope, ...membershipRestore });
                    checked.push('original customer membership restored');
                } catch { failure = 'customer membership cleanup'; }
            }
            if (restoreSource) {
                try { await restoreSource(); checked.push('original source cleanup'); }
                catch { failure = 'source cleanup needs owner attention'; }
            }
            if (clerk) {
                const revoked = await Promise.allSettled(sessions.map((id) => clerk!.sessions.revokeSession(id)));
                if (revoked.some((result) => result.status === 'rejected')) failure = 'test session cleanup';
            }
            if (resultPath) {
                writeFileSync(resultPath, JSON.stringify({ checked: failure ? [...checked, `FAILED: ${failure}`] : checked, revision }, null, 2), { mode: 0o600 });
                chmodSync(resultPath, 0o600);
            }
        }
        if (failure) throw new Error(`Cloud content live acceptance failed at: ${failure}`);
    }, 120_000,
);
