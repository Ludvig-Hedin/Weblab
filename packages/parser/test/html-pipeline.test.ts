import { describe, expect, test } from 'bun:test';
import { htmlPipeline } from 'src/pipelines/html';

import { EditorAttributes } from '@weblab/constants';

describe('htmlPipeline.parse', () => {
    test('parses a full HTML document', () => {
        const ast = htmlPipeline.parse('<!doctype html><html><body><h1>hi</h1></body></html>');
        expect(ast).not.toBeNull();
        expect(ast?.isDocument).toBe(true);
    });

    test('parses a fragment when no doctype is present', () => {
        const ast = htmlPipeline.parse('<div><p>hi</p></div>');
        expect(ast).not.toBeNull();
        expect(ast?.isDocument).toBe(false);
    });

    test('does not return null on empty input', () => {
        // parse5 is permissive — it almost never throws — so we don't have a
        // strong invalid-input case. This guard exists for future strictness.
        expect(htmlPipeline.parse('')).not.toBeNull();
    });
});

describe('htmlPipeline.injectOids', () => {
    test('injects a data-oid attribute on every editable element', () => {
        const ast = htmlPipeline.parse('<div><p>a</p><p>b</p></div>')!;
        const result = htmlPipeline.injectOids(ast);
        expect(result.modified).toBe(true);

        const html = htmlPipeline.generate(result.ast, '<div><p>a</p><p>b</p></div>') as string;
        const matches = html.match(new RegExp(`${EditorAttributes.DATA_ONLOOK_ID}=`, 'g')) ?? [];
        // div + 2 paragraphs = 3 oid attributes
        expect(matches.length).toBe(3);
    });

    test('skips script and style tags', () => {
        const ast = htmlPipeline.parse('<div><script>alert(1)</script><style>.a {}</style></div>')!;
        htmlPipeline.injectOids(ast);
        const html = htmlPipeline.generate(ast, '') as string;
        const matches = html.match(new RegExp(`${EditorAttributes.DATA_ONLOOK_ID}=`, 'g')) ?? [];
        // Only the outer div gets an oid; <script> and <style> are skipped.
        expect(matches.length).toBe(1);
    });

    test('idempotent: re-injecting yields the same oids', () => {
        const ast1 = htmlPipeline.parse('<div><span>x</span></div>')!;
        const first = htmlPipeline.injectOids(ast1);
        const after = htmlPipeline.generate(first.ast, '') as string;

        const ast2 = htmlPipeline.parse(after)!;
        const second = htmlPipeline.injectOids(ast2);
        // After the first pass every element had a unique oid; the second
        // pass should NOT modify because all oids are already valid.
        expect(second.modified).toBe(false);
    });
});

describe('htmlPipeline.buildTemplateNodeMap', () => {
    test('records source positions for every oid-stamped element', () => {
        const ast = htmlPipeline.parse('<div><span>x</span></div>')!;
        htmlPipeline.injectOids(ast);
        const map = htmlPipeline.buildTemplateNodeMap({
            ast,
            filename: 'index.html',
            branchId: 'branch-1',
        });
        expect(map.size).toBe(2);
        for (const node of map.values()) {
            expect(node.path).toBe('index.html');
            expect(node.branchId).toBe('branch-1');
            expect(node.startTag.start.line).toBeGreaterThanOrEqual(1);
        }
    });
});

describe('htmlPipeline.applyEdits', () => {
    test('updates the class attribute (merge)', async () => {
        const ast = htmlPipeline.parse('<div class="a">x</div>')!;
        htmlPipeline.injectOids(ast);
        const map = htmlPipeline.buildTemplateNodeMap({
            ast,
            filename: 'index.html',
            branchId: 'branch-1',
        });
        const oid = map.keys().next().value!;
        await htmlPipeline.applyEdits(
            ast,
            new Map([
                [
                    oid,
                    {
                        oid,
                        branchId: 'branch-1',
                        attributes: { className: 'b' },
                        tagName: null,
                        textContent: null,
                        overrideClasses: null,
                        structureChanges: [],
                    },
                ],
            ]),
        );
        const html = await htmlPipeline.generate(ast, '');
        expect(html).toContain('class="a b"');
    });

    test('overrides class when overrideClasses=true', async () => {
        const ast = htmlPipeline.parse('<div class="a">x</div>')!;
        htmlPipeline.injectOids(ast);
        const map = htmlPipeline.buildTemplateNodeMap({
            ast,
            filename: 'index.html',
            branchId: 'b',
        });
        const oid = map.keys().next().value!;
        await htmlPipeline.applyEdits(
            ast,
            new Map([
                [
                    oid,
                    {
                        oid,
                        branchId: 'b',
                        attributes: { className: 'b' },
                        tagName: null,
                        textContent: null,
                        overrideClasses: true,
                        structureChanges: [],
                    },
                ],
            ]),
        );
        const html = await htmlPipeline.generate(ast, '');
        expect(html).toContain('class="b"');
        expect(html).not.toContain('class="a b"');
    });

    test('replaces text content', async () => {
        const ast = htmlPipeline.parse('<button>old</button>')!;
        htmlPipeline.injectOids(ast);
        const map = htmlPipeline.buildTemplateNodeMap({
            ast,
            filename: 'index.html',
            branchId: 'b',
        });
        const oid = map.keys().next().value!;
        await htmlPipeline.applyEdits(
            ast,
            new Map([
                [
                    oid,
                    {
                        oid,
                        branchId: 'b',
                        attributes: {},
                        tagName: null,
                        textContent: 'new',
                        overrideClasses: null,
                        structureChanges: [],
                    },
                ],
            ]),
        );
        const html = await htmlPipeline.generate(ast, '');
        expect(html).toContain('>new<');
    });

    test('renames a tag', async () => {
        const ast = htmlPipeline.parse('<div>x</div>')!;
        htmlPipeline.injectOids(ast);
        const map = htmlPipeline.buildTemplateNodeMap({
            ast,
            filename: 'index.html',
            branchId: 'b',
        });
        const oid = map.keys().next().value!;
        await htmlPipeline.applyEdits(
            ast,
            new Map([
                [
                    oid,
                    {
                        oid,
                        branchId: 'b',
                        attributes: {},
                        tagName: 'section',
                        textContent: null,
                        overrideClasses: null,
                        structureChanges: [],
                    },
                ],
            ]),
        );
        const html = await htmlPipeline.generate(ast, '');
        expect(html).toContain('<section');
        expect(html).not.toContain('<div');
    });
});

describe('htmlPipeline.applyEdits — structural', () => {
    test('INSERT appends a new child element', async () => {
        const ast = htmlPipeline.parse('<div><p>existing</p></div>')!;
        htmlPipeline.injectOids(ast);
        const map = htmlPipeline.buildTemplateNodeMap({
            ast,
            filename: 'index.html',
            branchId: 'b',
        });
        // The first oid in the map is the outer <div>.
        const divOid = Array.from(map.keys())[0]!;
        await htmlPipeline.applyEdits(
            ast,
            new Map([
                [
                    divOid,
                    {
                        oid: divOid,
                        branchId: 'b',
                        attributes: {},
                        tagName: null,
                        textContent: null,
                        overrideClasses: null,
                        structureChanges: [
                            {
                                type: 'insert',
                                oid: 'new-oid-xyz',
                                tagName: 'span',
                                attributes: { class: 'added' },
                                textContent: 'inserted!',
                                pasteParams: null,
                                codeBlock: null,
                                children: [],
                                location: {
                                    type: 'append',
                                    targetDomId: 'd1',
                                    targetOid: divOid,
                                },
                            },
                        ],
                    },
                ],
            ]) as never,
        );
        const html = await htmlPipeline.generate(ast, '');
        expect(html).toContain('<span');
        expect(html).toContain('inserted!');
        expect(html).toContain('class="added"');
    });

    test('REMOVE deletes the element from the tree', async () => {
        const ast = htmlPipeline.parse('<div><p>keep</p><p>remove</p></div>')!;
        htmlPipeline.injectOids(ast);
        const map = htmlPipeline.buildTemplateNodeMap({
            ast,
            filename: 'index.html',
            branchId: 'b',
        });
        // Find the <p>remove</p> oid by walking serialized output:
        // there are 3 oids — div, first p, second p. We keep all <p>'s
        // but only target the second.
        const oids = Array.from(map.keys());
        const removeOid = oids[2]!; // second <p>
        await htmlPipeline.applyEdits(
            ast,
            new Map([
                [
                    removeOid,
                    {
                        oid: removeOid,
                        branchId: 'b',
                        attributes: {},
                        tagName: null,
                        textContent: null,
                        overrideClasses: null,
                        structureChanges: [
                            {
                                type: 'remove',
                                oid: removeOid,
                                codeBlock: null,
                            },
                        ],
                    },
                ],
            ]) as never,
        );
        const html = await htmlPipeline.generate(ast, '');
        expect(html).toContain('keep');
        expect(html).not.toContain('remove');
    });
});
