import type { NodePath, T } from '../packages';
import { getOidFromJsxElement } from '../code-edit/helpers';
import { generate, t, traverse } from '../packages';
import { createOid } from '@weblab/utility';
import { EditorAttributes } from '@weblab/constants';

/**
 * "Create component from selection": extracts a JSX subtree into a new
 * component file, hoists chosen literals into props (current values become
 * defaults), and replaces the original subtree with a `<Name />` usage.
 *
 * Closure rule (v1): the subtree may reference module imports (copied into
 * the new file) and values it declares itself. References to enclosing
 * component scope (state, handlers, map variables) hard-fail with the names
 * so the user gets an actionable message instead of broken code.
 */

export interface PropExtraction {
    /** Oid of the element inside the selection whose literal becomes a prop. */
    sourceOid: string;
    kind: 'text' | 'image' | 'link';
    propName: string;
}

export interface ExtractComponentParams {
    rootOid: string;
    componentName: string;
    /** Import path for the usage site, e.g. `@/components/Card`. */
    importPath: string;
    propExtractions: PropExtraction[];
}

export type ExtractComponentResult =
    | {
          ok: true;
          /** Source of the new component file (unformatted; caller formats). */
          componentFileContent: string;
          /** Oid minted for the `<Name />` usage in the source file. */
          instanceOid: string;
      }
    | { ok: false; error: string };

export function extractComponent(
    sourceAst: T.File,
    params: ExtractComponentParams,
): ExtractComponentResult {
    const { rootOid, componentName, importPath, propExtractions } = params;

    if (!/^[A-Z][A-Za-z0-9]*$/.test(componentName)) {
        return { ok: false, error: 'Component names must be PascalCase (e.g. "HeroCard").' };
    }

    // 1. Locate the subtree path.
    let targetPath: NodePath<T.JSXElement> | null = null;
    traverse(sourceAst, {
        JSXElement(path) {
            if (getOidFromJsxElement(path.node.openingElement) === rootOid) {
                targetPath = path;
                path.stop();
            }
        },
    });
    if (!targetPath) {
        return { ok: false, error: 'Selected element not found in source' };
    }
    const target = targetPath as NodePath<T.JSXElement>;

    // 2. Closure check: partition referenced identifiers.
    const extractionNames = new Set(propExtractions.map((p) => p.propName));
    const neededImports = new Map<string, T.ImportDeclaration>(); // source -> decl(filtered)
    const outerRefs = new Set<string>();

    target.traverse({
        // JSXIdentifiers used as component tags reference values too.
        ReferencedIdentifier(idPath) {
            const name = idPath.node.name;
            // Skip JSX attribute names and member property positions —
            // ReferencedIdentifier already excludes most, but guard anyway.
            const binding = idPath.scope.getBinding(name);
            if (!binding) {
                // Globals (window, undefined, React in classic runtime…) — fine.
                return;
            }
            // Declared inside the extracted subtree (map params, etc.)?
            let declaredInside = false;
            let scope: typeof binding.scope | null = binding.scope;
            while (scope) {
                if (scope.path === target || isDescendantOf(scope.path, target)) {
                    declaredInside = true;
                    break;
                }
                scope = scope.parent;
            }
            if (declaredInside) return;

            if (binding.kind === 'module') {
                const decl = binding.path.parentPath?.node;
                if (decl && t.isImportDeclaration(decl)) {
                    collectImportSpecifier(neededImports, decl, name);
                }
                return;
            }

            // Module-scope consts/functions of the page or enclosing-scope
            // values: not extractable in v1 (unless hoisted as a prop).
            if (!extractionNames.has(name)) {
                outerRefs.add(name);
            }
        },
    });

    if (outerRefs.size > 0) {
        const names = [...outerRefs].slice(0, 5).join(', ');
        return {
            ok: false,
            error: `The selection uses ${names} from the page, which can't move into a component yet. Deselect or inline those values first.`,
        };
    }

    // 3. Clone the subtree, strip oids (fresh ones minted on write), and
    //    hoist the chosen literals into props.
    const cloned = t.cloneNode(target.node, true, false);
    stripOids(cloned);

    // Re-locate extraction targets inside the clone by their original oids —
    // stripOids removed them, so resolve BEFORE stripping. Simpler: clone
    // again with oids, resolve, then strip at the end.
    const clonedWithOids = t.cloneNode(target.node, true, false);
    const props: Array<{ name: string; kind: PropExtraction['kind']; defaultValue: string }> = [];

    for (const extraction of propExtractions) {
        const el = findByOid(clonedWithOids, extraction.sourceOid);
        if (!el) {
            return { ok: false, error: `Element for property "${extraction.propName}" not found` };
        }
        if (extraction.kind === 'text') {
            const text = staticText(el);
            if (text == null) {
                return {
                    ok: false,
                    error: `Element for "${extraction.propName}" has no static text`,
                };
            }
            el.children = [t.jsxExpressionContainer(t.identifier(extraction.propName))];
            props.push({ name: extraction.propName, kind: 'text', defaultValue: text });
        } else {
            const attrName = extraction.kind === 'image' ? 'src' : 'href';
            const attr = el.openingElement.attributes.find(
                (a): a is T.JSXAttribute => t.isJSXAttribute(a) && a.name.name === attrName,
            );
            if (!attr || !t.isStringLiteral(attr.value)) {
                return {
                    ok: false,
                    error: `Element for "${extraction.propName}" has no static ${attrName}`,
                };
            }
            props.push({
                name: extraction.propName,
                kind: extraction.kind,
                defaultValue: attr.value.value,
            });
            attr.value = t.jsxExpressionContainer(t.identifier(extraction.propName));
        }
    }
    stripOids(clonedWithOids);

    // 4. Build the component file AST.
    const interfaceName = `${componentName}Props`;
    const fileBody: T.Statement[] = [...neededImports.values()];

    if (props.length > 0) {
        const members = props.map((prop) => {
            const member = t.tsPropertySignature(
                t.identifier(prop.name),
                t.tsTypeAnnotation(t.tsStringKeyword()),
            );
            member.optional = true;
            return member;
        });
        fileBody.push(t.tsInterfaceDeclaration(
            t.identifier(interfaceName),
            null,
            null,
            t.tsInterfaceBody(members),
        ));
    }

    const fnParams: (T.Identifier | T.ObjectPattern)[] = [];
    if (props.length > 0) {
        const pattern = t.objectPattern(
            props.map((prop) =>
                t.objectProperty(
                    t.identifier(prop.name),
                    t.assignmentPattern(
                        t.identifier(prop.name),
                        t.stringLiteral(prop.defaultValue),
                    ),
                ),
            ),
        );
        pattern.typeAnnotation = t.tsTypeAnnotation(
            t.tsTypeReference(t.identifier(interfaceName)),
        );
        fnParams.push(pattern);
    }

    const fn = t.functionDeclaration(
        t.identifier(componentName),
        fnParams,
        t.blockStatement([t.returnStatement(clonedWithOids)]),
    );
    fileBody.push(t.exportNamedDeclaration(fn, []));

    const componentFileContent = generate(t.file(t.program(fileBody)), {
        retainLines: false,
        comments: true,
    }).code;

    // 5. Replace the original subtree with the usage + import.
    const instanceOid = createOid();
    const usageAttrs: T.JSXAttribute[] = [
        t.jsxAttribute(
            t.jsxIdentifier(EditorAttributes.DATA_WEBLAB_ID),
            t.stringLiteral(instanceOid),
        ),
    ];
    const usage = t.jsxElement(
        t.jsxOpeningElement(t.jsxIdentifier(componentName), usageAttrs, true),
        null,
        [],
        true,
    );
    target.replaceWith(usage);

    const importDecl = t.importDeclaration(
        [t.importSpecifier(t.identifier(componentName), t.identifier(componentName))],
        t.stringLiteral(importPath),
    );
    addImport(sourceAst, importDecl);

    return { ok: true, componentFileContent, instanceOid };
}

function isDescendantOf(path: NodePath, ancestor: NodePath): boolean {
    let current: NodePath | null = path;
    while (current) {
        if (current === ancestor) return true;
        current = current.parentPath;
    }
    return false;
}

function collectImportSpecifier(
    collected: Map<string, T.ImportDeclaration>,
    decl: T.ImportDeclaration,
    localName: string,
): void {
    const source = decl.source.value;
    const specifier = decl.specifiers.find((s) => s.local.name === localName);
    if (!specifier) return;

    const existing = collected.get(source);
    if (existing) {
        if (!existing.specifiers.some((s) => s.local.name === localName)) {
            existing.specifiers.push(t.cloneNode(specifier, true, false));
        }
        return;
    }
    collected.set(
        source,
        t.importDeclaration([t.cloneNode(specifier, true, false)], t.stringLiteral(source)),
    );
}

function stripOids(node: T.JSXElement): void {
    const visit = (el: T.JSXElement) => {
        el.openingElement.attributes = el.openingElement.attributes.filter(
            (attr) =>
                !(
                    t.isJSXAttribute(attr) &&
                    typeof attr.name.name === 'string' &&
                    (attr.name.name === EditorAttributes.DATA_WEBLAB_ID ||
                        attr.name.name === 'data-oid' ||
                        attr.name.name === 'data-onlook-id')
                ),
        );
        for (const child of el.children) {
            if (t.isJSXElement(child)) visit(child);
            if (t.isJSXFragment(child)) {
                for (const sub of child.children) {
                    if (t.isJSXElement(sub)) visit(sub);
                }
            }
        }
    };
    visit(node);
}

function findByOid(root: T.JSXElement, oid: string): T.JSXElement | null {
    if (getOidFromJsxElement(root.openingElement) === oid) return root;
    for (const child of root.children) {
        if (t.isJSXElement(child)) {
            const found = findByOid(child, oid);
            if (found) return found;
        } else if (t.isJSXFragment(child)) {
            for (const sub of child.children) {
                if (t.isJSXElement(sub)) {
                    const found = findByOid(sub, oid);
                    if (found) return found;
                }
            }
        }
    }
    return null;
}

function addImport(ast: T.File, importDecl: T.ImportDeclaration): void {
    let insertIndex = 0;
    while (insertIndex < ast.program.body.length) {
        const node = ast.program.body[insertIndex];
        const isDirective =
            t.isExpressionStatement(node) &&
            t.isStringLiteral(node.expression) &&
            !node.expression.extra?.parenthesized;
        if (isDirective || t.isImportDeclaration(node)) {
            insertIndex++;
            continue;
        }
        break;
    }
    ast.program.body.splice(insertIndex, 0, importDecl);
}

/** Static text of an element's direct children, or null when dynamic. */
function staticText(node: T.JSXElement): string | null {
    let text = '';
    for (const child of node.children) {
        if (t.isJSXText(child)) text += child.value;
        else if (t.isJSXExpressionContainer(child) && t.isStringLiteral(child.expression)) {
            text += child.expression.value;
        } else return null;
    }
    const trimmed = text.replace(/\s+/g, ' ').trim();
    return trimmed.length > 0 ? trimmed : null;
}

/**
 * Suggests prop extractions for a subtree: static text nodes → text props,
 * img srcs → image props, anchor hrefs → link props. Used by the create
 * dialog's "review suggested properties" list.
 */
export function suggestPropExtractions(
    sourceAst: T.File,
    rootOid: string,
): PropExtraction[] {
    let root: T.JSXElement | null = null;
    traverse(sourceAst, {
        JSXElement(path) {
            if (getOidFromJsxElement(path.node.openingElement) === rootOid) {
                root = path.node;
                path.stop();
            }
        },
    });
    if (!root) return [];

    const suggestions: PropExtraction[] = [];
    const usedNames = new Set<string>();

    const uniqueName = (base: string): string => {
        let name = base;
        let i = 2;
        while (usedNames.has(name)) name = `${base}${i++}`;
        usedNames.add(name);
        return name;
    };

    const visit = (el: T.JSXElement) => {
        const oid = getOidFromJsxElement(el.openingElement);
        const tag = t.isJSXIdentifier(el.openingElement.name)
            ? el.openingElement.name.name
            : '';

        if (oid) {
            if (tag === 'img') {
                const src = el.openingElement.attributes.find(
                    (a): a is T.JSXAttribute =>
                        t.isJSXAttribute(a) && a.name.name === 'src' && t.isStringLiteral(a.value),
                );
                if (src) {
                    suggestions.push({ sourceOid: oid, kind: 'image', propName: uniqueName('image') });
                }
            } else if (tag === 'a') {
                const href = el.openingElement.attributes.find(
                    (a): a is T.JSXAttribute =>
                        t.isJSXAttribute(a) && a.name.name === 'href' && t.isStringLiteral(a.value),
                );
                if (href) {
                    suggestions.push({ sourceOid: oid, kind: 'link', propName: uniqueName('href') });
                }
            }
            const text = staticText(el);
            if (text && tag !== 'a') {
                const base = /^h[1-6]$/.test(tag)
                    ? 'title'
                    : tag === 'p'
                      ? 'description'
                      : tag === 'button'
                        ? 'label'
                        : 'text';
                suggestions.push({ sourceOid: oid, kind: 'text', propName: uniqueName(base) });
            }
        }

        for (const child of el.children) {
            if (t.isJSXElement(child)) visit(child);
        }
    };
    visit(root);
    return suggestions;
}
