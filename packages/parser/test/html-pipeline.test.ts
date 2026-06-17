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
        const matches = html.match(new RegExp(`${EditorAttributes.DATA_WEBLAB_ID}=`, 'g')) ?? [];
        // div + 2 paragraphs = 3 oid attributes
        expect(matches.length).toBe(3);
    });

    test('skips script and style tags', () => {
        const ast = htmlPipeline.parse('<div><script>alert(1)</script><style>.a {}</style></div>')!;
        htmlPipeline.injectOids(ast);
        const html = htmlPipeline.generate(ast, '') as string;
        const matches = html.match(new RegExp(`${EditorAttributes.DATA_WEBLAB_ID}=`, 'g')) ?? [];
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

    test('{ __remove: true } sentinel deletes the attribute (not "[object Object]")', async () => {
        // Regression: an instance prop reset passes a `{ __remove: true }`
        // sentinel. The HTML pipeline used to String()-coerce it into the
        // literal "[object Object]" and write THAT as the attribute value,
        // instead of deleting the attribute (the JSX pipeline already deletes).
        const ast = htmlPipeline.parse('<div data-foo="bar" class="a">x</div>')!;
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
                        // `className` sentinel must also map to the `class` attr.
                        attributes: {
                            'data-foo': { __remove: true },
                            className: { __remove: true },
                        },
                        tagName: null,
                        textContent: null,
                        overrideClasses: null,
                        structureChanges: [],
                    },
                ],
            ]),
        );
        const html = await htmlPipeline.generate(ast, '');
        expect(html).not.toContain('[object Object]');
        expect(html).not.toContain('data-foo');
        expect(html).not.toContain('class=');
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

    test('GROUP wraps the listed siblings in a new container at the first sibling position', async () => {
        const ast = htmlPipeline.parse('<div><p>a</p><p>b</p><p>c</p></div>')!;
        htmlPipeline.injectOids(ast);
        const map = htmlPipeline.buildTemplateNodeMap({
            ast,
            filename: 'index.html',
            branchId: 'b',
        });
        // map order: outer div first, then p#a, p#b, p#c.
        const oids = Array.from(map.keys());
        const divOid = oids[0]!;
        const pAOid = oids[1]!;
        const pCOid = oids[3]!;
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
                                type: 'group',
                                oid: divOid,
                                container: {
                                    domId: 'g1',
                                    oid: 'group-oid-1',
                                    tagName: 'section',
                                    attributes: { class: 'wrapper' },
                                },
                                children: [
                                    { domId: 'd-a', oid: pAOid, frameId: 'f', branchId: 'b' },
                                    { domId: 'd-c', oid: pCOid, frameId: 'f', branchId: 'b' },
                                ],
                            },
                        ],
                    },
                ],
            ]) as never,
        );
        const html = await htmlPipeline.generate(ast, '');
        // p#a and p#c are now inside <section class="wrapper">; p#b is left
        // outside the wrapper but adjacent to it. Section is at the position
        // of the first grouped child (p#a's original index).
        expect(html).toMatch(
            /<section[^>]*class="wrapper"[^>]*>[\s\S]*<p[^>]*>a<\/p>[\s\S]*<p[^>]*>c<\/p>[\s\S]*<\/section>/,
        );
        expect(html).toContain('<p ' + EditorAttributes.DATA_WEBLAB_ID + '="' + pCOid + '">c</p>');
    });

    test('GROUP dedupes a repeated child oid (no double-move, no cycle)', async () => {
        const ast = htmlPipeline.parse('<div><p>only</p></div>')!;
        htmlPipeline.injectOids(ast);
        const map = htmlPipeline.buildTemplateNodeMap({
            ast,
            filename: 'index.html',
            branchId: 'b',
        });
        const oids = Array.from(map.keys());
        const divOid = oids[0]!;
        const pOid = oids[1]!;
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
                                type: 'group',
                                oid: divOid,
                                container: {
                                    domId: 'g2',
                                    oid: 'group-oid-2',
                                    tagName: 'section',
                                    attributes: {},
                                },
                                children: [
                                    { domId: 'd-1', oid: pOid, frameId: 'f', branchId: 'b' },
                                    // Same oid passed twice — should be deduped.
                                    { domId: 'd-2', oid: pOid, frameId: 'f', branchId: 'b' },
                                ],
                            },
                        ],
                    },
                ],
            ]) as never,
        );
        const html = await htmlPipeline.generate(ast, '');
        // <p> appears exactly once inside the container, not twice.
        const pMatches = html.match(/<p[\s>]/g) ?? [];
        expect(pMatches.length).toBe(1);
    });

    test('UNGROUP spreads the container children into the parent at the container position', async () => {
        const ast = htmlPipeline.parse(
            '<div><span>before</span><section><p>x</p><p>y</p></section><span>after</span></div>',
        )!;
        htmlPipeline.injectOids(ast);
        const map = htmlPipeline.buildTemplateNodeMap({
            ast,
            filename: 'index.html',
            branchId: 'b',
        });
        const oids = Array.from(map.keys());
        const divOid = oids[0]!;
        // map walk order: div, span#before, section, p#x, p#y, span#after.
        const sectionOid = oids[2]!;
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
                                type: 'ungroup',
                                oid: divOid,
                                container: {
                                    domId: 'sec',
                                    oid: sectionOid,
                                    tagName: 'section',
                                    attributes: {},
                                },
                                children: [],
                            },
                        ],
                    },
                ],
            ]) as never,
        );
        const html = await htmlPipeline.generate(ast, '');
        // The <section> wrapper is gone; its <p> children are now direct
        // children of <div>, and the surrounding <span>s are preserved.
        expect(html).not.toContain('<section');
        expect(html).toMatch(
            /<span[^>]*>before<\/span><p[^>]*>x<\/p><p[^>]*>y<\/p><span[^>]*>after<\/span>/,
        );
    });

    test('INSERT_IMAGE throws an actionable error (image pipeline not yet wired for static HTML)', () => {
        const ast = htmlPipeline.parse('<div></div>')!;
        htmlPipeline.injectOids(ast);
        const map = htmlPipeline.buildTemplateNodeMap({
            ast,
            filename: 'index.html',
            branchId: 'b',
        });
        const divOid = Array.from(map.keys())[0]!;
        // applyEdits is synchronous in the HTML pipeline — the throw bubbles
        // out of the call site directly, no Promise wrapping.
        expect(() =>
            htmlPipeline.applyEdits(
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
                                    type: 'insert-image',
                                    folderPath: 'images',
                                    targets: [
                                        { domId: 'd', oid: divOid, frameId: 'f', branchId: 'b' },
                                    ],
                                    image: {
                                        originPath: 'hero.png',
                                        content: '',
                                        fileName: 'hero.png',
                                        mimeType: 'image/png',
                                    },
                                },
                            ],
                        },
                    ],
                ]) as never,
            ),
        ).toThrow(/Image operations are not yet supported/);
    });
});
