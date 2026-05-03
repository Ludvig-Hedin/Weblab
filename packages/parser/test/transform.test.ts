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
});
