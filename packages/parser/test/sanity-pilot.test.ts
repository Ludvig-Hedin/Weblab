import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'bun:test';

import type { CodeDiffRequest } from '@weblab/models/code';
import { EditorAttributes } from '@weblab/constants';

import type { T } from '../src/packages';
import { hasLocalTailwindStyleWriter } from '../../../apps/web/client/src/components/store/editor/style/local-style-writer';
import { canEditJsxChildrenAsText } from '../../../apps/web/client/src/components/store/editor/text/editable';
import { getOidFromJsxElement } from '../src/code-edit/helpers';
import { transformAst } from '../src/code-edit/transform';
import { addOidsToAst } from '../src/ids';
import { t, traverse } from '../src/packages';
import { getAstFromContent, getContentFromAst } from '../src/parse';

const pilot = new URL('../../../examples/sanity-pilot/', import.meta.url);

function parse(source: string): T.File {
    const ast = getAstFromContent(source);
    if (!ast) throw new Error('Pilot source did not parse');
    return ast;
}

async function withoutStylesAndIds(source: string): Promise<string> {
    const ast = parse(source);
    traverse(ast, {
        JSXOpeningElement(path) {
            path.node.attributes = path.node.attributes.filter(
                (attribute) =>
                    !(
                        t.isJSXAttribute(attribute) &&
                        (attribute.name.name === 'className' ||
                            attribute.name.name === EditorAttributes.DATA_WEBLAB_ID)
                    ),
            );
        },
    });
    return getContentFromAst(ast, '');
}

describe('Sanity pilot uses Weblab-compatible source', () => {
    test('is accepted by the local Tailwind style capability gate', async () => {
        expect(
            await hasLocalTailwindStyleWriter((path) => readFile(new URL(path, pilot), 'utf8')),
        ).toBe(true);
    });

    for (const [file, target] of [
        ['src/app/(site)/page.tsx', 'h1'],
        ['src/components/post-list.tsx', 'Link'],
        ['src/app/(site)/blog/[slug]/page.tsx', 'img'],
        ['src/components/article-body.tsx', 'p'],
    ] as const) {
        test(`restyles ${target} in ${file} without changing its CMS expressions`, async () => {
            const source = await readFile(new URL(file, pilot), 'utf8');
            const ast = parse(source);
            addOidsToAst(ast);
            let oid: string | undefined;
            traverse(ast, {
                JSXElement(path) {
                    const name = path.node.openingElement.name;
                    if (!oid && t.isJSXIdentifier(name) && name.name === target) {
                        oid = getOidFromJsxElement(path.node.openingElement) ?? undefined;
                    }
                },
            });
            if (!oid) throw new Error('Pilot target was not instrumented');
            const request: CodeDiffRequest = {
                oid,
                branchId: 'pilot',
                attributes: { className: 'md:mb-12' },
                tagName: null,
                textContent: null,
                overrideClasses: false,
                structureChanges: [],
            };
            transformAst(ast, new Map([[oid, request]]));
            const edited = await getContentFromAst(ast, source);
            expect(edited).toContain('md:mb-12');
            expect(getAstFromContent(edited)).not.toBeNull();
            expect(await withoutStylesAndIds(edited)).toBe(await withoutStylesAndIds(source));
        });
    }

    test('blocks inline text edits on the actual CMS title nodes', async () => {
        for (const file of ['src/app/(site)/page.tsx', 'src/app/(site)/blog/[slug]/page.tsx']) {
            const ast = parse(await readFile(new URL(file, pilot), 'utf8'));
            let heading: T.JSXElement | undefined;
            traverse(ast, {
                JSXElement(path) {
                    const name = path.node.openingElement.name;
                    if (t.isJSXIdentifier(name) && name.name === 'h1') heading = path.node;
                },
            });
            if (!heading) throw new Error('Pilot title not found');
            const snippet = await getContentFromAst(
                t.file(t.program([t.expressionStatement(heading)])),
                '',
            );
            expect(canEditJsxChildrenAsText(snippet)).toBe(false);
        }
    });
});
