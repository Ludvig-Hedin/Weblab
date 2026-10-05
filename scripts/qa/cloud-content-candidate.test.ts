import { test, expect, mock } from 'bun:test';
import { readFileSync } from 'node:fs';
import { EditorAttributes } from '@weblab/constants';
import { generate, parse, t, type T } from '@weblab/parser/src/packages';
import { getRenderedJsxText, updateNodeTextContent } from '@weblab/parser/src/code-edit/text';
import { getContentFromAst } from '@weblab/parser/src/parse';
import { formatContent } from '@weblab/parser/src/prettier';
import { validateCloudContentCandidate, type CloudContentContract } from '../../apps/web/client/convex/lib/cloudContentContract';
import { MemoryFileSystem } from '../../packages/file-system/src/test-memory-fs';

mock.module('../../packages/file-system/src/fs', () => ({ FileSystem: MemoryFileSystem }));
const { CodeFileSystem } = await import('../../packages/file-system/src/code-fs');

function parsePage(source: string) {
    return parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
}
function nodeId(node: T.JSXElement): string | null {
    const attr = node.openingElement.attributes.find((entry) => t.isJSXAttribute(entry) &&
        t.isJSXIdentifier(entry.name, { name: EditorAttributes.DATA_WEBLAB_ID }));
    return t.isJSXAttribute(attr) && t.isStringLiteral(attr.value) ? attr.value.value : null;
}
function textOutsideApproval(source: string, oid: string): Map<string, string> {
    const result = new Map<string, string>();
    t.traverseFast(parsePage(source), (node) => {
        if (!t.isJSXElement(node) || nodeId(node) === oid) return;
        node.children.forEach((child, index) => {
            if (t.isJSXText(child)) result.set(`${nodeId(node)}.children[${index}]`, child.value);
        });
    });
    return result;
}

// Local fixture only. Never calls Convex, Clerk, preview URLs or runtime APIs.
test.skipIf(!process.env.WEBLAB_CLOUD_CONTENT_FIXTURE)('real CodeFS candidate preserves the approved text contract', async () => {
    const { original, contract }: { original: string; contract: CloudContentContract } =
        JSON.parse(readFileSync(process.env.WEBLAB_CLOUD_CONTENT_FIXTURE!, 'utf8'));
    const oid = contract.bindings[0]!.oid;
    const ast = parsePage(original);
    let edited = false;
    t.traverseFast(ast, (node) => {
        if (t.isJSXElement(node) && nodeId(node) === oid) {
            updateNodeTextContent(node, 'Customer cloud acceptance fixture');
            edited = true;
        }
    });
    expect(edited).toBe(true);
    const raw = generate(ast, { retainLines: true, comments: true }, original).code;
    const rawText = textOutsideApproval(raw, oid);
    const first = [...textOutsideApproval(original, oid)].find(([key, value]) =>
        rawText.get(key) !== value);
    if (first) {
        const generated = rawText.get(first[0]);
        console.info(JSON.stringify({ difference: first[0], originalLength: first[1].length,
            generatedLength: generated?.length, renderedTextEqual: generated !== undefined &&
                getRenderedJsxText(first[1]) === getRenderedJsxText(generated),
            ...(first[1].trim() === '' && generated?.trim() === '' ?
                { originalWhitespace: first[1], generatedWhitespace: generated } : {}) }));
    }
    const accepts = (candidateSource: string) => {
        try { validateCloudContentCandidate({ contract, originalSource: original, candidateSource, approvedAssetPaths: [] }); return true; }
        catch { return false; }
    };
    const fs = new CodeFileSystem('content-candidate-fixture', crypto.randomUUID(), { durableCloud: true });
    fs.setDurableRecoveryHandler(() => async () => {});
    await fs.initialize();
    await fs.hydrateDurableSnapshot([{ path: contract.path, content: original }]);
    let submitted: string | undefined;
    fs.setDurableCommitHandler(async (changes) => {
        const content = changes.find((change) => change.path === contract.path)?.content;
        if (typeof content === 'string') submitted = content;
    });
    await fs.writeFiles([{ path: contract.path, content: raw }]);
    const corrected = await formatContent(contract.path, await getContentFromAst(ast, original));
    const actualAccepted = typeof submitted === 'string' && accepts(submitted);
    console.info(JSON.stringify({ rawAccepted: accepts(raw), codeFsAccepted: actualAccepted,
        correctedTestAccepted: accepts(corrected), correctedMatchesCodeFs: corrected === submitted }));
    expect(actualAccepted).toBe(true);
    expect(accepts(corrected)).toBe(true);
    expect(corrected === submitted).toBe(true);
});
