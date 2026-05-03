import { describe, expect, test } from 'bun:test';
import { transformAst } from 'src/code-edit/transform';
import { getAstFromContent, getContentFromAst } from 'src/parse';

import type { CodeDiffRequest } from '@weblab/models';

describe('transformAst', () => {
    test('renames tags and replaces classes for a matching element', async () => {
        const code = `
            export function Example() {
                return <div data-oid="target" className="old-class">Hello</div>;
            }
        `;
        const ast = getAstFromContent(code);
        if (!ast) {
            throw new Error('Failed to parse AST');
        }

        const request: CodeDiffRequest = {
            oid: 'target',
            branchId: 'branch',
            attributes: {
                className: 'new-class another-class',
            },
            tagName: 'section',
            textContent: null,
            overrideClasses: true,
            structureChanges: [],
        };

        transformAst(ast, new Map([['target', request]]));
        const generated = await getContentFromAst(ast, code);

        expect(generated).toContain('<section');
        expect(generated).toContain('className="new-class another-class"');
        expect(generated).toContain('</section>');
    });

    test('adds imports from inserted code blocks', async () => {
        const code = `
            export function Example() {
                return <main data-oid="target"></main>;
            }
        `;
        const ast = getAstFromContent(code);
        if (!ast) {
            throw new Error('Failed to parse AST');
        }

        const request: CodeDiffRequest = {
            oid: 'target',
            branchId: 'branch',
            attributes: {},
            tagName: null,
            textContent: null,
            overrideClasses: null,
            structureChanges: [
                {
                    type: 'insert',
                    oid: 'inserted',
                    tagName: 'section',
                    attributes: {},
                    textContent: null,
                    pasteParams: null,
                    codeBlock:
                        'import { Cta34 } from "@/components/cta34";\n<section><Cta34 /></section>;',
                    children: [],
                    location: {
                        type: 'append',
                        targetDomId: 'target-dom',
                        targetOid: 'target',
                    },
                },
            ],
        };

        transformAst(ast, new Map([['target', request]]));
        const generated = await getContentFromAst(ast, code);

        expect(generated).toContain('import { Cta34 } from "@/components/cta34";');
        expect(generated).toContain('<Cta34 />');
        expect(generated).toContain('data-oid="inserted"');
    });
});
