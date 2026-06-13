import type { T } from '../packages';
import { t, traverse } from '../packages';
import { getOidFromJsxElement } from '../code-edit/helpers';

/**
 * Variant codegen. Canonical generated form is a module-scope plain class
 * map + `cn(base, map[variant])`:
 *
 *   const cardVariants = { default: '', dark: 'bg-zinc-900 text-white' };
 *   export function Card({ variant = 'default' }: CardProps) {
 *       return <div className={cn('rounded p-4', cardVariants[variant])} …
 *
 * cva-authored components are read by discovery; edits to cva maps reuse
 * `updateVariantClasses` (object-property lookup is the same shape).
 */

export interface AddVariantPropParams {
    componentName: string;
    /** Oid of the element whose className becomes variant-driven (usually the root). */
    elementOid: string;
    mapName?: string;
    initialVariants?: string[];
}

export interface VariantOpResult {
    modified: boolean;
    error?: string;
}

function findVariantMap(
    program: T.Program,
    mapName: string,
): { variantsObject: T.ObjectExpression } | null {
    for (const stmt of program.body) {
        const decl = t.isExportNamedDeclaration(stmt) && stmt.declaration ? stmt.declaration : stmt;
        if (!t.isVariableDeclaration(decl)) continue;
        for (const declarator of decl.declarations) {
            if (!t.isIdentifier(declarator.id) || declarator.id.name !== mapName) continue;
            if (t.isObjectExpression(declarator.init)) {
                return { variantsObject: declarator.init };
            }
            // cva(base, { variants: { variant: {...} } })
            if (
                t.isCallExpression(declarator.init) &&
                t.isIdentifier(declarator.init.callee) &&
                declarator.init.callee.name === 'cva' &&
                t.isObjectExpression(declarator.init.arguments[1])
            ) {
                const config = declarator.init.arguments[1];
                for (const prop of config.properties) {
                    if (
                        t.isObjectProperty(prop) &&
                        t.isIdentifier(prop.key) &&
                        prop.key.name === 'variants' &&
                        t.isObjectExpression(prop.value)
                    ) {
                        const group = prop.value.properties.find(
                            (p): p is T.ObjectProperty =>
                                t.isObjectProperty(p) &&
                                t.isIdentifier(p.key) &&
                                p.key.name === 'variant',
                        );
                        if (group && t.isObjectExpression(group.value)) {
                            return { variantsObject: group.value };
                        }
                    }
                }
            }
        }
    }
    return null;
}

function variantKey(prop: T.ObjectProperty): string | null {
    if (t.isIdentifier(prop.key)) return prop.key.name;
    if (t.isStringLiteral(prop.key)) return prop.key.value;
    return null;
}

/**
 * Converts a component to variant-driven styling: adds a module-scope class
 * map, a `variant` prop with default, and rewires the element's className to
 * `cn(<existing literal>, <map>[variant])`.
 */
export function addVariantProp(ast: T.File, params: AddVariantPropParams): VariantOpResult {
    const { componentName, elementOid } = params;
    const mapName =
        params.mapName ??
        `${componentName.charAt(0).toLowerCase()}${componentName.slice(1)}Variants`;
    const initialVariants = params.initialVariants ?? ['default'];

    if (findVariantMap(ast.program, mapName)) {
        return { modified: false, error: `A variant map "${mapName}" already exists` };
    }

    // Guard BEFORE any mutation: a component that already exposes a `variant`
    // prop would otherwise get a duplicate binding + duplicate interface
    // member (TS2300 / SyntaxError → white screen).
    if (componentHasVariantProp(ast.program, componentName)) {
        return { modified: false, error: 'Component already has a variant prop' };
    }

    // 1. Locate the element + its className literal.
    let targetEl: T.JSXElement | null = null;
    traverse(ast, {
        JSXElement(path) {
            if (getOidFromJsxElement(path.node.openingElement) === elementOid) {
                targetEl = path.node;
                path.stop();
            }
        },
    });
    if (!targetEl) return { modified: false, error: 'Element not found' };
    const el: T.JSXElement = targetEl;

    const classAttr = el.openingElement.attributes.find(
        (a): a is T.JSXAttribute => t.isJSXAttribute(a) && a.name.name === 'className',
    );
    const baseClasses =
        classAttr && t.isStringLiteral(classAttr.value) ? classAttr.value.value : '';
    if (classAttr && !t.isStringLiteral(classAttr.value)) {
        return {
            modified: false,
            error: 'The element already has a dynamic className — add variants manually',
        };
    }

    // 2. Module-scope map: { default: '', …otherInitial: '' }
    const mapDecl = t.variableDeclaration('const', [
        t.variableDeclarator(
            t.identifier(mapName),
            t.objectExpression(
                initialVariants.map((name) =>
                    t.objectProperty(t.identifier(name), t.stringLiteral('')),
                ),
            ),
        ),
    ]);
    // Insert after imports.
    let insertIndex = 0;
    while (
        insertIndex < ast.program.body.length &&
        (t.isImportDeclaration(ast.program.body[insertIndex]) ||
            (t.isExpressionStatement(ast.program.body[insertIndex]) &&
                t.isStringLiteral(
                    (ast.program.body[insertIndex] as T.ExpressionStatement).expression,
                )))
    ) {
        insertIndex++;
    }
    ast.program.body.splice(insertIndex, 0, mapDecl);

    // 3. className -> `${base} ${map[variant] ?? ''}` — a template literal
    // needs no helper import (`cn` is not guaranteed to exist in the
    // project), and discovery's className scan resolves map[variant] inside
    // template expressions the same way it does inside cn() calls.
    const mapLookup = t.logicalExpression(
        '??',
        t.memberExpression(t.identifier(mapName), t.identifier('variant'), true),
        t.stringLiteral(''),
    );
    // `raw` must escape backtick and `${` or @babel/types throws "Invalid
    // raw"; `cooked` keeps the literal classes. (Tailwind strings rarely
    // contain these, but a thrown builder error is an uncaught crash.)
    const rawBase = `${baseClasses} `.replace(/[\\`]/g, '\\$&').replace(/\$\{/g, '\\${');
    const templateValue = t.templateLiteral(
        [
            t.templateElement({ raw: rawBase, cooked: `${baseClasses} ` }, false),
            t.templateElement({ raw: '', cooked: '' }, true),
        ],
        [mapLookup],
    );
    if (classAttr) {
        classAttr.value = t.jsxExpressionContainer(templateValue);
    } else {
        el.openingElement.attributes.push(
            t.jsxAttribute(t.jsxIdentifier('className'), t.jsxExpressionContainer(templateValue)),
        );
    }

    // 4. Add `variant = 'default'` to the signature + type.
    const added = addVariantToSignature(ast.program, componentName, initialVariants);
    if (!added) {
        return { modified: false, error: 'Could not update the component signature' };
    }

    return { modified: true };
}

/** True when the named component's first param already destructures `variant`. */
function componentHasVariantProp(program: T.Program, componentName: string): boolean {
    let found = false;
    const checkFn = (
        fn: T.FunctionDeclaration | T.FunctionExpression | T.ArrowFunctionExpression,
    ) => {
        const param = fn.params[0];
        if (param && t.isObjectPattern(param)) {
            found = param.properties.some(
                (p) => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'variant',
            );
        } else if (param && t.isIdentifier(param)) {
            // Plain `props` param: inspect the annotation for a `variant` member.
            const annotation =
                param.typeAnnotation && t.isTSTypeAnnotation(param.typeAnnotation)
                    ? param.typeAnnotation.typeAnnotation
                    : null;
            if (annotation && t.isTSTypeLiteral(annotation)) {
                found = annotation.members.some(
                    (m) => t.isTSPropertySignature(m) && t.isIdentifier(m.key) && m.key.name === 'variant',
                );
            }
        }
    };
    for (const stmt of program.body) {
        const decl = t.isExportNamedDeclaration(stmt) && stmt.declaration ? stmt.declaration : stmt;
        if (t.isFunctionDeclaration(decl) && decl.id?.name === componentName) {
            checkFn(decl);
        } else if (t.isVariableDeclaration(decl)) {
            for (const declarator of decl.declarations) {
                if (
                    t.isIdentifier(declarator.id) &&
                    declarator.id.name === componentName &&
                    (t.isArrowFunctionExpression(declarator.init) ||
                        t.isFunctionExpression(declarator.init))
                ) {
                    checkFn(declarator.init);
                }
            }
        }
        if (found) break;
    }
    return found;
}

function addVariantToSignature(
    program: T.Program,
    componentName: string,
    variantNames: string[],
): boolean {
    let updated = false;

    const visitFn = (
        fn: T.FunctionDeclaration | T.FunctionExpression | T.ArrowFunctionExpression,
    ) => {
        let param = fn.params[0];
        if (!param) {
            const pattern = t.objectPattern([]);
            fn.params.push(pattern);
            param = pattern;
        }
        if (!t.isObjectPattern(param)) return;

        param.properties.unshift(
            t.objectProperty(
                t.identifier('variant'),
                t.assignmentPattern(t.identifier('variant'), t.stringLiteral('default')),
            ),
        );

        const annotation =
            param.typeAnnotation && t.isTSTypeAnnotation(param.typeAnnotation)
                ? param.typeAnnotation.typeAnnotation
                : null;
        const member = t.tsPropertySignature(
            t.identifier('variant'),
            t.tsTypeAnnotation(
                t.tsUnionType(
                    variantNames.map((name) => t.tsLiteralType(t.stringLiteral(name))),
                ),
            ),
        );
        member.optional = true;
        if (annotation && t.isTSTypeLiteral(annotation)) {
            annotation.members.unshift(member);
        } else if (annotation && t.isTSTypeReference(annotation) && t.isIdentifier(annotation.typeName)) {
            const typeName = annotation.typeName.name;
            for (const stmt of program.body) {
                const decl =
                    t.isExportNamedDeclaration(stmt) && stmt.declaration ? stmt.declaration : stmt;
                if (t.isTSInterfaceDeclaration(decl) && decl.id.name === typeName) {
                    decl.body.body.unshift(member);
                    break;
                }
                if (
                    t.isTSTypeAliasDeclaration(decl) &&
                    decl.id.name === typeName &&
                    t.isTSTypeLiteral(decl.typeAnnotation)
                ) {
                    decl.typeAnnotation.members.unshift(member);
                    break;
                }
            }
        }
        updated = true;
    };

    for (const stmt of program.body) {
        const decl = t.isExportNamedDeclaration(stmt) && stmt.declaration ? stmt.declaration : stmt;
        if (t.isFunctionDeclaration(decl) && decl.id?.name === componentName) {
            visitFn(decl);
        } else if (t.isVariableDeclaration(decl)) {
            for (const declarator of decl.declarations) {
                if (
                    t.isIdentifier(declarator.id) &&
                    declarator.id.name === componentName &&
                    (t.isArrowFunctionExpression(declarator.init) ||
                        t.isFunctionExpression(declarator.init))
                ) {
                    visitFn(declarator.init);
                }
            }
        }
    }
    return updated;
}

/** Adds a variant member to the map (optionally copying another's classes). */
export function addVariant(
    ast: T.File,
    params: { mapName: string; variantName: string; copyFrom?: string },
): VariantOpResult {
    const map = findVariantMap(ast.program, params.mapName);
    if (!map) return { modified: false, error: `Variant map "${params.mapName}" not found` };

    const exists = map.variantsObject.properties.some(
        (p) => t.isObjectProperty(p) && variantKey(p) === params.variantName,
    );
    if (exists) return { modified: false, error: `Variant "${params.variantName}" already exists` };

    let classes = '';
    if (params.copyFrom) {
        const source = map.variantsObject.properties.find(
            (p): p is T.ObjectProperty =>
                t.isObjectProperty(p) && variantKey(p) === params.copyFrom,
        );
        if (source && t.isStringLiteral(source.value)) classes = source.value.value;
    }
    map.variantsObject.properties.push(
        t.objectProperty(t.identifier(params.variantName), t.stringLiteral(classes)),
    );

    // Extend the string-literal union on the signature when present.
    extendVariantUnion(ast.program, params.variantName);
    return { modified: true };
}

export function removeVariant(
    ast: T.File,
    params: { mapName: string; variantName: string },
): VariantOpResult {
    const map = findVariantMap(ast.program, params.mapName);
    if (!map) return { modified: false, error: `Variant map "${params.mapName}" not found` };

    const before = map.variantsObject.properties.length;
    map.variantsObject.properties = map.variantsObject.properties.filter(
        (p) => !(t.isObjectProperty(p) && variantKey(p) === params.variantName),
    );
    if (map.variantsObject.properties.length === before) {
        return { modified: false, error: `Variant "${params.variantName}" not found` };
    }
    shrinkVariantUnion(ast.program, params.variantName);
    return { modified: true };
}

/** Replaces a variant's class string. */
export function updateVariantClasses(
    ast: T.File,
    params: { mapName: string; variantName: string; classes: string },
): VariantOpResult {
    const map = findVariantMap(ast.program, params.mapName);
    if (!map) return { modified: false, error: `Variant map "${params.mapName}" not found` };

    const prop = map.variantsObject.properties.find(
        (p): p is T.ObjectProperty => t.isObjectProperty(p) && variantKey(p) === params.variantName,
    );
    if (!prop) return { modified: false, error: `Variant "${params.variantName}" not found` };
    prop.value = t.stringLiteral(params.classes);
    return { modified: true };
}

function eachVariantUnion(program: T.Program, fn: (union: T.TSUnionType) => void): void {
    traverse(t.file(program), {
        TSPropertySignature(path) {
            const node = path.node;
            if (!t.isIdentifier(node.key) || node.key.name !== 'variant' || !node.typeAnnotation) {
                return;
            }
            const annotation = node.typeAnnotation.typeAnnotation;
            if (t.isTSUnionType(annotation)) {
                fn(annotation);
            } else if (t.isTSLiteralType(annotation) && t.isStringLiteral(annotation.literal)) {
                // Single member (`variant?: 'default'`) — promote to a union
                // so members can be added/removed uniformly.
                const union = t.tsUnionType([annotation]);
                node.typeAnnotation.typeAnnotation = union;
                fn(union);
            }
        },
    });
}

function extendVariantUnion(program: T.Program, variantName: string): void {
    eachVariantUnion(program, (union) => {
        const exists = union.types.some(
            (m) => t.isTSLiteralType(m) && t.isStringLiteral(m.literal) && m.literal.value === variantName,
        );
        if (!exists) union.types.push(t.tsLiteralType(t.stringLiteral(variantName)));
    });
}

function shrinkVariantUnion(program: T.Program, variantName: string): void {
    eachVariantUnion(program, (union) => {
        union.types = union.types.filter(
            (m) =>
                !(
                    t.isTSLiteralType(m) &&
                    t.isStringLiteral(m.literal) &&
                    m.literal.value === variantName
                ),
        );
    });
}
