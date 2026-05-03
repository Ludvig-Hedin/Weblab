import type { CodeAction } from '@weblab/models/actions';
import type { CodeDiffRequest } from '@weblab/models/code';
import { CodeActionType } from '@weblab/models/actions';
import { assertNever } from '@weblab/utility';

import type { NodePath, T } from '../packages';
import { t, traverse } from '../packages';
import { groupElementsInNode, ungroupElementsInNode } from './group';
import { getOidFromJsxElement } from './helpers';
import { insertImageToNode, removeImageFromNode } from './image';
import { insertElementToNode } from './insert';
import { moveElementInNode } from './move';
import { removeElementFromNode } from './remove';
import { addClassToNode, renameNodeTag, replaceNodeClasses, updateNodeProp } from './style';
import { updateNodeTextContent } from './text';
import { getAstFromContent } from '../parse';

export function transformAst(ast: T.File, oidToCodeDiff: Map<string, CodeDiffRequest>): void {
    addImportsFromStructureChanges(ast, oidToCodeDiff);

    traverse(ast, {
        JSXElement(path) {
            const currentOid = getOidFromJsxElement(path.node.openingElement);
            if (!currentOid) {
                console.error('No oid found for jsx element');
                return;
            }
            const codeDiffRequest = oidToCodeDiff.get(currentOid);
            if (codeDiffRequest) {
                const { attributes, tagName, textContent, structureChanges } = codeDiffRequest;

                if (tagName) {
                    renameNodeTag(path.node, tagName);
                }

                if (attributes) {
                    Object.entries(attributes).forEach(([key, value]) => {
                        if (key === 'className') {
                            if (codeDiffRequest.overrideClasses) {
                                replaceNodeClasses(path.node, value as string);
                            } else {
                                addClassToNode(path.node, value as string);
                            }
                        } else {
                            updateNodeProp(path.node, key, value);
                        }
                    });
                }

                if (textContent !== undefined && textContent !== null) {
                    updateNodeTextContent(path.node, textContent);
                }

                applyStructureChanges(path, structureChanges);
            }
        },
    });
}

function addImportsFromStructureChanges(
    ast: T.File,
    oidToCodeDiff: Map<string, CodeDiffRequest>,
): void {
    const imports = Array.from(oidToCodeDiff.values())
        .flatMap((request) => request.structureChanges)
        .flatMap(getImportsFromAction);

    for (const importDeclaration of imports) {
        addImportIfMissing(ast, importDeclaration);
    }
}

function getImportsFromAction(action: CodeAction): T.ImportDeclaration[] {
    if (action.type !== CodeActionType.INSERT || !action.codeBlock) {
        return [];
    }

    const ast = getAstFromContent(action.codeBlock);
    if (!ast) {
        return [];
    }
    return ast.program.body.filter((node): node is T.ImportDeclaration =>
        t.isImportDeclaration(node),
    );
}

function addImportIfMissing(ast: T.File, importDeclaration: T.ImportDeclaration): void {
    const source = importDeclaration.source.value;
    const importedNames = importDeclaration.specifiers.map((specifier) =>
        t.isImportSpecifier(specifier) && t.isIdentifier(specifier.imported)
            ? specifier.imported.name
            : specifier.local.name,
    );

    const hasImport = ast.program.body.some((node) => {
        if (!t.isImportDeclaration(node) || node.source.value !== source) {
            return false;
        }
        return importedNames.every((name) =>
            node.specifiers.some((specifier) => specifier.local.name === name),
        );
    });

    if (hasImport) {
        return;
    }

    let insertIndex = 0;
    for (let i = 0; i < ast.program.body.length; i++) {
        if (t.isImportDeclaration(ast.program.body[i])) {
            insertIndex = i + 1;
        } else {
            break;
        }
    }

    ast.program.body.splice(insertIndex, 0, importDeclaration);
}

function applyStructureChanges(path: NodePath<T.JSXElement>, actions: CodeAction[]): void {
    if (actions.length === 0) {
        return;
    }
    for (const action of actions) {
        switch (action.type) {
            case CodeActionType.MOVE:
                moveElementInNode(path, action);
                break;
            case CodeActionType.INSERT:
                insertElementToNode(path, action);
                break;
            case CodeActionType.REMOVE:
                removeElementFromNode(path, action);
                break;
            case CodeActionType.GROUP:
                groupElementsInNode(path, action);
                break;
            case CodeActionType.UNGROUP:
                ungroupElementsInNode(path, action);
                break;
            case CodeActionType.INSERT_IMAGE:
                insertImageToNode(path, action);
                break;
            case CodeActionType.REMOVE_IMAGE:
                removeImageFromNode(path, action);
                break;
            default:
                assertNever(action);
        }
    }
}
