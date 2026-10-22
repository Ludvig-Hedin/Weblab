'use node';

import { getAstFromContent, getContentFromAst, t } from '@weblab/parser';

/** Next 16.3.1 rewrites this generated file for its isolated dev directory. */
export function prepareImportedNextDeclarations(content: string): string {
    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    const declaration = (directory: string) => [
        '/// <reference types="next" />',
        '/// <reference types="next/image-types/global" />',
        `import "./${directory}/types/routes.d.ts";`,
        `import "./${directory}/types/root-params.d.ts";`,
        '',
        '// NOTE: This file should not be edited',
        '// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.',
        '',
    ].join(eol);
    if (content !== declaration('.next') && content !== declaration('.next/dev'))
        throw new Error('CLOUD_IMPORT_DECLARATIONS_UNSUPPORTED');
    return declaration('.next/dev');
}

/** Preserve the authored config; add only the gateway host used by this preview. */
export async function prepareImportedNextConfig(content: string): Promise<string> {
    const ast = getAstFromContent(content);
    if (!ast) throw new Error('CLOUD_IMPORT_CONFIG_UNSUPPORTED');
    const exports = ast.program.body.filter(node => t.isExportDefaultDeclaration(node));
    if (exports.length !== 1) throw new Error('CLOUD_IMPORT_CONFIG_UNSUPPORTED');
    const declaration = exports[0]!.declaration;
    let object = t.isObjectExpression(declaration) ? declaration : null;
    if (t.isIdentifier(declaration)) {
        const candidates = ast.program.body.flatMap(node => t.isVariableDeclaration(node, { kind: 'const' }) ? node.declarations : [])
            .filter(node => t.isIdentifier(node.id, { name: declaration.name }) && t.isObjectExpression(node.init));
        if (candidates.length === 1 && t.isObjectExpression(candidates[0]!.init)) object = candidates[0]!.init;
    }
    if (!object || object.properties.some(property => t.isSpreadElement(property) || property.computed)) throw new Error('CLOUD_IMPORT_CONFIG_UNSUPPORTED');
    if (object.properties.some(property => !t.isSpreadElement(property) &&
        ((t.isIdentifier(property.key) && property.key.name === 'allowedDevOrigins') ||
        (t.isStringLiteral(property.key) && property.key.value === 'allowedDevOrigins')))) throw new Error('CLOUD_IMPORT_CONFIG_ORIGIN_CONFLICT');
    const host = () => t.memberExpression(t.memberExpression(t.identifier('process'), t.identifier('env')), t.identifier('WEBLAB_PREVIEW_HOST'));
    object.properties.push(t.objectProperty(t.identifier('allowedDevOrigins'),
        t.conditionalExpression(host(), t.arrayExpression([host()]), t.arrayExpression([]))));
    return getContentFromAst(ast, content);
}
