import type {
    ComponentDef,
    ComponentPropBinding,
    ComponentPropSpec,
    ComponentPropType,
    ComponentSlotSpec,
    ComponentVariantSpec,
} from '@weblab/models';

import type { NodePath, T } from '../packages';
import { getOidFromJsxElement } from '../code-edit/helpers';
import { t, traverse } from '../packages';
import { getAstFromContent } from '../parse';

/** Builds the stable identity for a React component definition. */
export function componentKeyFor(filePath: string, exportName: string): string {
    return `${filePath}#${exportName}`;
}

export function isPascalCase(name: string): boolean {
    return /^[A-Z][A-Za-z0-9]*$/.test(name);
}

interface ExportedFn {
    name: string;
    exportType: 'default' | 'named';
    fn: T.FunctionDeclaration | T.FunctionExpression | T.ArrowFunctionExpression;
}

/** HOC wrappers we unwrap one level to find the component function. */
const HOC_NAMES = new Set(['memo', 'forwardRef', 'observer']);

function unwrapHoc(node: T.Node | null | undefined): T.Node | null {
    if (!node) return null;
    if (t.isCallExpression(node)) {
        const callee = node.callee;
        const calleeName = t.isIdentifier(callee)
            ? callee.name
            : t.isMemberExpression(callee) && t.isIdentifier(callee.property)
              ? callee.property.name
              : null;
        if (calleeName && HOC_NAMES.has(calleeName) && node.arguments.length > 0) {
            return node.arguments[0] as T.Node;
        }
    }
    return node;
}

function isFnNode(
    node: T.Node | null,
): node is T.FunctionDeclaration | T.FunctionExpression | T.ArrowFunctionExpression {
    return (
        !!node &&
        (t.isFunctionDeclaration(node) ||
            t.isFunctionExpression(node) ||
            t.isArrowFunctionExpression(node))
    );
}

function containsJsx(fn: T.Node): boolean {
    let found = false;
    // Wrap in a File so traverse accepts the standalone node.
    traverse(t.file(t.program([wrapStatement(fn)])), {
        JSXElement() {
            found = true;
        },
        JSXFragment() {
            found = true;
        },
    });
    return found;
}

function wrapStatement(node: T.Node): T.Statement {
    if (t.isStatement(node)) return node;
    return t.expressionStatement(node as T.Expression);
}

/**
 * Collects all module-scope declarations of the file keyed by name:
 * functions, consts, interfaces, and type aliases. Used to resolve
 * `export default Card` / `export { Card }` and same-file prop types.
 */
function collectModuleScope(program: T.Program): {
    valueDecls: Map<string, T.Node>;
    typeDecls: Map<string, T.TSInterfaceDeclaration | T.TSTypeAliasDeclaration>;
} {
    const valueDecls = new Map<string, T.Node>();
    const typeDecls = new Map<string, T.TSInterfaceDeclaration | T.TSTypeAliasDeclaration>();

    const visit = (stmt: T.Statement) => {
        if (t.isFunctionDeclaration(stmt) && stmt.id) {
            valueDecls.set(stmt.id.name, stmt);
        } else if (t.isVariableDeclaration(stmt)) {
            for (const decl of stmt.declarations) {
                if (t.isIdentifier(decl.id) && decl.init) {
                    valueDecls.set(decl.id.name, decl.init);
                }
            }
        } else if (t.isTSInterfaceDeclaration(stmt)) {
            typeDecls.set(stmt.id.name, stmt);
        } else if (t.isTSTypeAliasDeclaration(stmt)) {
            typeDecls.set(stmt.id.name, stmt);
        }
    };

    for (const stmt of program.body) {
        visit(stmt);
        if (t.isExportNamedDeclaration(stmt) && stmt.declaration) {
            visit(stmt.declaration);
        }
        if (t.isExportDefaultDeclaration(stmt)) {
            const decl = stmt.declaration;
            if (t.isFunctionDeclaration(decl) && decl.id) {
                valueDecls.set(decl.id.name, decl);
            }
        }
    }

    return { valueDecls, typeDecls };
}

/** Enumerates exported PascalCase functions that contain JSX. */
function collectExportedComponents(program: T.Program): ExportedFn[] {
    const { valueDecls } = collectModuleScope(program);
    const results: ExportedFn[] = [];
    const seen = new Set<string>();

    const push = (name: string, node: T.Node | null, exportType: 'default' | 'named') => {
        if (!name || !isPascalCase(name) || seen.has(name)) return;
        const unwrapped = unwrapHoc(node);
        if (!isFnNode(unwrapped)) return;
        if (!containsJsx(unwrapped)) return;
        seen.add(name);
        results.push({ name, exportType, fn: unwrapped });
    };

    for (const stmt of program.body) {
        if (t.isExportNamedDeclaration(stmt)) {
            const decl = stmt.declaration;
            if (t.isFunctionDeclaration(decl) && decl.id) {
                push(decl.id.name, decl, 'named');
            } else if (t.isVariableDeclaration(decl)) {
                for (const d of decl.declarations) {
                    if (t.isIdentifier(d.id) && d.init) {
                        push(d.id.name, d.init, 'named');
                    }
                }
            } else if (!decl && stmt.specifiers.length > 0) {
                for (const spec of stmt.specifiers) {
                    if (t.isExportSpecifier(spec) && t.isIdentifier(spec.local)) {
                        push(spec.local.name, valueDecls.get(spec.local.name) ?? null, 'named');
                    }
                }
            }
        } else if (t.isExportDefaultDeclaration(stmt)) {
            const decl = stmt.declaration;
            if (t.isFunctionDeclaration(decl) && decl.id) {
                push(decl.id.name, decl, 'default');
            } else if (t.isIdentifier(decl)) {
                push(decl.name, valueDecls.get(decl.name) ?? null, 'default');
            } else {
                const unwrapped = unwrapHoc(decl);
                if (t.isIdentifier(unwrapped)) {
                    push(unwrapped.name, valueDecls.get(unwrapped.name) ?? null, 'default');
                }
            }
        }
    }

    return results;
}

// ---------------------------------------------------------------------------
// Prop signature extraction
// ---------------------------------------------------------------------------

interface RawProp {
    name: string;
    typeAnnotation: T.TSType | null;
    defaultValue: string | number | boolean | null;
    hasDefault: boolean;
    optional: boolean;
}

function literalValue(node: T.Node | null | undefined): string | number | boolean | null {
    if (!node) return null;
    if (t.isStringLiteral(node)) return node.value;
    if (t.isNumericLiteral(node)) return node.value;
    if (t.isBooleanLiteral(node)) return node.value;
    if (
        t.isUnaryExpression(node) &&
        node.operator === '-' &&
        t.isNumericLiteral(node.argument)
    ) {
        return -node.argument.value;
    }
    return null;
}

function isReactNodeType(type: T.TSType): boolean {
    if (t.isTSTypeReference(type)) {
        const name = type.typeName;
        if (t.isIdentifier(name)) {
            return name.name === 'ReactNode' || name.name === 'ReactElement';
        }
        if (t.isTSQualifiedName(name) && t.isIdentifier(name.right)) {
            return (
                name.right.name === 'ReactNode' ||
                name.right.name === 'ReactElement' ||
                name.right.name === 'Element'
            );
        }
    }
    return false;
}

function stringLiteralUnion(type: T.TSType): string[] | null {
    if (!t.isTSUnionType(type)) return null;
    const options: string[] = [];
    for (const member of type.types) {
        if (t.isTSLiteralType(member) && t.isStringLiteral(member.literal)) {
            options.push(member.literal.value);
        } else if (t.isTSUndefinedKeyword(member)) {
            continue;
        } else {
            return null;
        }
    }
    return options.length > 0 ? options : null;
}

function typeToPropType(type: T.TSType | null): {
    type: ComponentPropType;
    options?: string[];
    rawTypeText?: string;
} {
    if (!type) return { type: 'text' };
    if (t.isTSStringKeyword(type)) return { type: 'text' };
    if (t.isTSNumberKeyword(type)) return { type: 'number' };
    if (t.isTSBooleanKeyword(type)) return { type: 'switch' };
    if (isReactNodeType(type)) return { type: 'slot' };
    const options = stringLiteralUnion(type);
    if (options) return { type: 'text', options };
    return { type: 'unsupported', rawTypeText: typeText(type) };
}

function typeText(type: T.TSType): string {
    // Best-effort label for read-only display of unsupported prop types.
    return type.type.replace(/^TS/, '');
}

/** Resolves the members of a same-file interface / type-literal annotation. */
function resolveTypeMembers(
    annotation: T.TSType | null,
    typeDecls: Map<string, T.TSInterfaceDeclaration | T.TSTypeAliasDeclaration>,
): Map<string, { type: T.TSType | null; optional: boolean }> | null {
    if (!annotation) return null;

    let literal: T.TSTypeLiteral | T.TSInterfaceBody | null = null;
    if (t.isTSTypeLiteral(annotation)) {
        literal = annotation;
    } else if (t.isTSTypeReference(annotation) && t.isIdentifier(annotation.typeName)) {
        const decl = typeDecls.get(annotation.typeName.name);
        if (decl && t.isTSInterfaceDeclaration(decl)) {
            literal = decl.body;
        } else if (decl && t.isTSTypeAliasDeclaration(decl) && t.isTSTypeLiteral(decl.typeAnnotation)) {
            literal = decl.typeAnnotation;
        }
    }
    if (!literal) return null;

    const members = t.isTSTypeLiteral(literal) ? literal.members : literal.body;
    const map = new Map<string, { type: T.TSType | null; optional: boolean }>();
    for (const member of members) {
        if (t.isTSPropertySignature(member) && t.isIdentifier(member.key)) {
            map.set(member.key.name, {
                type: member.typeAnnotation?.typeAnnotation ?? null,
                optional: !!member.optional,
            });
        }
    }
    return map;
}

/**
 * Extracts the raw prop list from the component's first parameter.
 * Handles destructured object patterns (with defaults and rest) and a plain
 * `props` identifier (props read as `props.x` — names recovered during
 * binding analysis).
 */
function extractRawProps(
    fn: ExportedFn['fn'],
    typeDecls: Map<string, T.TSInterfaceDeclaration | T.TSTypeAliasDeclaration>,
): { props: RawProp[]; hasSpread: boolean; propsParamName: string | null } {
    const param = fn.params[0];
    if (!param) return { props: [], hasSpread: false, propsParamName: null };

    const annotation =
        'typeAnnotation' in param && param.typeAnnotation && t.isTSTypeAnnotation(param.typeAnnotation)
            ? param.typeAnnotation.typeAnnotation
            : null;
    const typeMembers = resolveTypeMembers(annotation, typeDecls);

    if (t.isIdentifier(param)) {
        // Plain `props` param: enumerate from the type annotation when present.
        const props: RawProp[] = [];
        if (typeMembers) {
            for (const [name, info] of typeMembers) {
                props.push({
                    name,
                    typeAnnotation: info.type,
                    defaultValue: null,
                    hasDefault: false,
                    optional: info.optional,
                });
            }
        }
        return { props, hasSpread: false, propsParamName: param.name };
    }

    if (!t.isObjectPattern(param)) {
        return { props: [], hasSpread: false, propsParamName: null };
    }

    const props: RawProp[] = [];
    let hasSpread = false;

    for (const prop of param.properties) {
        if (t.isRestElement(prop)) {
            hasSpread = true;
            continue;
        }
        if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) continue;
        const name = prop.key.name;

        let defaultValue: string | number | boolean | null = null;
        let hasDefault = false;
        if (t.isAssignmentPattern(prop.value)) {
            defaultValue = literalValue(prop.value.right);
            hasDefault = true;
        }

        const member = typeMembers?.get(name);
        props.push({
            name,
            typeAnnotation: member?.type ?? null,
            defaultValue,
            hasDefault,
            optional: member?.optional ?? hasDefault,
        });
    }

    return { props, hasSpread, propsParamName: null };
}

// ---------------------------------------------------------------------------
// Variant map detection
// ---------------------------------------------------------------------------

interface VariantMapCandidate {
    mapName: string;
    style: 'plain-map' | 'cva';
    variants: Record<string, string>;
    cvaDefaultVariant: string | null;
}

function collectVariantMaps(program: T.Program): Map<string, VariantMapCandidate> {
    const maps = new Map<string, VariantMapCandidate>();

    const visitDecl = (decl: T.VariableDeclarator) => {
        if (!t.isIdentifier(decl.id) || !decl.init) return;
        const name = decl.id.name;

        // Plain map: const cardVariants = { a: '...', b: '...' }
        if (t.isObjectExpression(decl.init)) {
            const variants: Record<string, string> = {};
            let allStrings = decl.init.properties.length > 0;
            for (const prop of decl.init.properties) {
                if (
                    t.isObjectProperty(prop) &&
                    (t.isIdentifier(prop.key) || t.isStringLiteral(prop.key)) &&
                    t.isStringLiteral(prop.value)
                ) {
                    const key = t.isIdentifier(prop.key) ? prop.key.name : prop.key.value;
                    variants[key] = prop.value.value;
                } else {
                    allStrings = false;
                    break;
                }
            }
            if (allStrings) {
                maps.set(name, { mapName: name, style: 'plain-map', variants, cvaDefaultVariant: null });
            }
            return;
        }

        // cva: const cardVariants = cva(base, { variants: { variant: {...} }, defaultVariants: { variant: 'x' } })
        if (
            t.isCallExpression(decl.init) &&
            t.isIdentifier(decl.init.callee) &&
            decl.init.callee.name === 'cva' &&
            decl.init.arguments.length >= 2 &&
            t.isObjectExpression(decl.init.arguments[1])
        ) {
            const config = decl.init.arguments[1];
            const variants: Record<string, string> = {};
            let cvaDefaultVariant: string | null = null;

            for (const prop of config.properties) {
                if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) continue;
                if (prop.key.name === 'variants' && t.isObjectExpression(prop.value)) {
                    const variantGroup = prop.value.properties.find(
                        (p): p is T.ObjectProperty =>
                            t.isObjectProperty(p) &&
                            t.isIdentifier(p.key) &&
                            p.key.name === 'variant',
                    );
                    if (variantGroup && t.isObjectExpression(variantGroup.value)) {
                        for (const v of variantGroup.value.properties) {
                            if (
                                t.isObjectProperty(v) &&
                                (t.isIdentifier(v.key) || t.isStringLiteral(v.key)) &&
                                t.isStringLiteral(v.value)
                            ) {
                                const key = t.isIdentifier(v.key) ? v.key.name : v.key.value;
                                variants[key] = v.value.value;
                            }
                        }
                    }
                } else if (prop.key.name === 'defaultVariants' && t.isObjectExpression(prop.value)) {
                    const dv = prop.value.properties.find(
                        (p): p is T.ObjectProperty =>
                            t.isObjectProperty(p) &&
                            t.isIdentifier(p.key) &&
                            p.key.name === 'variant',
                    );
                    if (dv && t.isStringLiteral(dv.value)) {
                        cvaDefaultVariant = dv.value.value;
                    }
                }
            }

            if (Object.keys(variants).length > 0) {
                maps.set(name, { mapName: name, style: 'cva', variants, cvaDefaultVariant });
            }
        }
    };

    for (const stmt of program.body) {
        if (t.isVariableDeclaration(stmt)) {
            stmt.declarations.forEach(visitDecl);
        } else if (t.isExportNamedDeclaration(stmt) && t.isVariableDeclaration(stmt.declaration)) {
            stmt.declaration.declarations.forEach(visitDecl);
        }
    }

    return maps;
}

// ---------------------------------------------------------------------------
// Binding analysis
// ---------------------------------------------------------------------------

interface BindingScan {
    bindings: Map<string, ComponentPropBinding[]>;
    /** Prop names referenced as `props.x` when the param wasn't destructured. */
    memberPropNames: Set<string>;
    /** Prop name → variant map it indexes into within a className. */
    variantUsage: Map<string, string>;
    rootOid: string | null;
    slotSites: Map<string, string | null>;
}

function propNameFromExpression(
    expr: T.Node | null | undefined,
    propNames: Set<string>,
    propsParamName: string | null,
    memberPropNames: Set<string>,
): string | null {
    if (!expr) return null;
    // `props.title ?? 'default'` — the generated plain-props binding form.
    if (t.isLogicalExpression(expr) && expr.operator === '??') {
        return propNameFromExpression(expr.left, propNames, propsParamName, memberPropNames);
    }
    if (t.isIdentifier(expr) && propNames.has(expr.name)) {
        return expr.name;
    }
    if (
        propsParamName &&
        t.isMemberExpression(expr) &&
        t.isIdentifier(expr.object) &&
        expr.object.name === propsParamName &&
        t.isIdentifier(expr.property)
    ) {
        memberPropNames.add(expr.property.name);
        return expr.property.name;
    }
    return null;
}

function scanBindings(
    fn: ExportedFn['fn'],
    propNames: Set<string>,
    propsParamName: string | null,
    variantMaps: Map<string, VariantMapCandidate>,
): BindingScan {
    const bindings = new Map<string, ComponentPropBinding[]>();
    const memberPropNames = new Set<string>();
    const variantUsage = new Map<string, string>();
    const slotSites = new Map<string, string | null>();
    let rootOid: string | null = null;

    const addBinding = (propName: string, binding: ComponentPropBinding) => {
        const list = bindings.get(propName) ?? [];
        list.push(binding);
        bindings.set(propName, list);
    };

    const getProp = (expr: T.Node | null | undefined) =>
        propNameFromExpression(expr, propNames, propsParamName, memberPropNames);

    const file = t.file(t.program([wrapStatement(fn)]));

    traverse(file, {
        JSXElement: (path: NodePath<T.JSXElement>) => {
            const oid = getOidFromJsxElement(path.node.openingElement);

            // Root element: first JSX element returned from the function body.
            if (!rootOid && oid) {
                const parent = path.parent;
                if (t.isReturnStatement(parent) || t.isArrowFunctionExpression(parent)) {
                    rootOid = oid;
                }
            }

            // Attribute bindings: attr={prop}
            for (const attr of path.node.openingElement.attributes) {
                if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) continue;
                if (!attr.value || !t.isJSXExpressionContainer(attr.value)) continue;
                const expr = attr.value.expression;
                const attrName = attr.name.name;

                const propName = getProp(expr);
                if (propName && oid && attrName !== 'className' && attrName !== 'key') {
                    addBinding(propName, { kind: 'attr', oid, attr: attrName });
                    continue;
                }

                // Variant usage inside className: map[variant], cn(..., map[variant]),
                // or cva-style call map({ variant }).
                if (attrName === 'className') {
                    scanClassNameExpression(expr, getProp, variantMaps, variantUsage);
                }
            }

            // Child bindings: {prop} text children, {prop && <el/>} visibility,
            // {children}/{slotProp} slot sites.
            for (const child of path.node.children) {
                if (!t.isJSXExpressionContainer(child)) continue;
                const expr = child.expression;

                const directProp = getProp(expr);
                if (directProp && oid) {
                    if (directProp === 'children') {
                        slotSites.set('children', oid);
                        addBinding(directProp, { kind: 'slot-site', containerOid: oid });
                    } else {
                        addBinding(directProp, { kind: 'text-child', oid });
                    }
                    continue;
                }

                if (t.isLogicalExpression(expr) && expr.operator === '&&') {
                    const guardProp = getProp(expr.left);
                    if (guardProp && t.isJSXElement(expr.right)) {
                        const guardedOid = getOidFromJsxElement(expr.right.openingElement);
                        if (guardedOid) {
                            addBinding(guardProp, { kind: 'visibility', oid: guardedOid });
                        }
                    }
                }
            }
        },
    });

    return { bindings, memberPropNames, variantUsage, rootOid, slotSites };
}

function scanClassNameExpression(
    expr: T.Node,
    getProp: (e: T.Node | null | undefined) => string | null,
    variantMaps: Map<string, VariantMapCandidate>,
    variantUsage: Map<string, string>,
): void {
    const visit = (node: T.Node | null | undefined): void => {
        if (!node) return;
        // map[variant]
        if (t.isMemberExpression(node) && node.computed && t.isIdentifier(node.object)) {
            const mapName = node.object.name;
            const propName = getProp(node.property);
            if (propName && variantMaps.has(mapName)) {
                variantUsage.set(propName, mapName);
            }
            return;
        }
        // cvaMap({ variant }) / cvaMap({ variant: variant })
        if (t.isCallExpression(node) && t.isIdentifier(node.callee)) {
            const mapName = node.callee.name;
            if (variantMaps.has(mapName) && variantMaps.get(mapName)!.style === 'cva') {
                const arg = node.arguments[0];
                if (arg && t.isObjectExpression(arg)) {
                    for (const prop of arg.properties) {
                        if (t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name === 'variant') {
                            const propName = getProp(prop.value) ?? (t.isIdentifier(prop.value) ? null : null);
                            if (propName) variantUsage.set(propName, mapName);
                        }
                    }
                }
            }
            for (const arg of node.arguments) visit(arg as T.Node);
            return;
        }
        if (t.isCallExpression(node)) {
            for (const arg of node.arguments) visit(arg as T.Node);
            return;
        }
        if (t.isTemplateLiteral(node)) {
            for (const e of node.expressions) visit(e as T.Node);
            return;
        }
        if (t.isConditionalExpression(node)) {
            visit(node.consequent);
            visit(node.alternate);
            return;
        }
        if (t.isLogicalExpression(node)) {
            visit(node.left);
            visit(node.right);
        }
    };
    visit(expr);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const SUPPORTED_EDITABLE_TYPES: ReadonlySet<ComponentPropType> = new Set([
    'text',
    'richtext',
    'image',
    'link',
    'number',
    'switch',
    'variant',
]);

/**
 * Discovers React component definitions in a parsed file.
 * Pure function — no file-system access. Re-run on every write of the file;
 * cheap because the caller already holds the parsed AST.
 */
export function discoverComponentsInAst(ast: T.File, filePath: string): ComponentDef[] {
    const program = ast.program;
    const { typeDecls } = collectModuleScope(program);
    const exported = collectExportedComponents(program);
    if (exported.length === 0) return [];

    const variantMaps = collectVariantMaps(program);
    const defs: ComponentDef[] = [];

    for (const { name, exportType, fn } of exported) {
        const { props: rawProps, hasSpread, propsParamName } = extractRawProps(fn, typeDecls);
        const propNames = new Set(rawProps.map((p) => p.name));
        const scan = scanBindings(fn, propNames, propsParamName, variantMaps);

        // Props referenced as `props.x` without a resolvable annotation.
        for (const memberName of scan.memberPropNames) {
            if (!propNames.has(memberName)) {
                rawProps.push({
                    name: memberName,
                    typeAnnotation: null,
                    defaultValue: null,
                    hasDefault: false,
                    optional: true,
                });
                propNames.add(memberName);
            }
        }

        let variants: ComponentVariantSpec | null = null;
        const props: ComponentPropSpec[] = [];
        const slots: ComponentSlotSpec[] = [];

        for (const raw of rawProps) {
            const mapped = typeToPropType(raw.typeAnnotation);
            let type = mapped.type;
            let options = mapped.options;
            const bindings = scan.bindings.get(raw.name) ?? [];

            // Refine type from how the prop is used in the master.
            const attrBinding = bindings.find(
                (b): b is Extract<ComponentPropBinding, { kind: 'attr' }> => b.kind === 'attr',
            );
            if (attrBinding?.attr === 'src') type = 'image';
            else if (attrBinding?.attr === 'href') type = 'link';
            if (bindings.some((b) => b.kind === 'visibility') && type === 'text') {
                type = 'switch';
            }

            // Variant prop: string-literal union (or untyped) indexing a variant map.
            const mapName = scan.variantUsage.get(raw.name);
            if (mapName) {
                const candidate = variantMaps.get(mapName);
                if (candidate) {
                    type = 'variant';
                    options = Object.keys(candidate.variants);
                    bindings.push({ kind: 'variant-class', mapName });
                    variants = {
                        propName: raw.name,
                        style: candidate.style,
                        mapName,
                        variants: candidate.variants,
                        defaultVariant:
                            (typeof raw.defaultValue === 'string' ? raw.defaultValue : null) ??
                            candidate.cvaDefaultVariant ??
                            Object.keys(candidate.variants)[0] ??
                            'default',
                    };
                }
            }

            if (type === 'slot' || raw.name === 'children') {
                type = 'slot';
                const containerOid = scan.slotSites.get(raw.name) ?? null;
                slots.push({ name: raw.name, containerOid });
            }

            props.push({
                name: raw.name,
                type,
                required: !raw.optional && !raw.hasDefault && raw.typeAnnotation != null,
                defaultValue: raw.defaultValue,
                bindings,
                editable: SUPPORTED_EDITABLE_TYPES.has(type),
                ...(mapped.rawTypeText ? { rawTypeText: mapped.rawTypeText } : {}),
                ...(options ? { options } : {}),
            });
        }

        // `children` referenced but not declared in the signature (plain JS).
        if (scan.slotSites.has('children') && !propNames.has('children')) {
            slots.push({ name: 'children', containerOid: scan.slotSites.get('children') ?? null });
            props.push({
                name: 'children',
                type: 'slot',
                required: false,
                defaultValue: null,
                bindings: [
                    { kind: 'slot-site', containerOid: scan.slotSites.get('children') ?? null },
                ],
                editable: false,
            });
        }

        defs.push({
            key: componentKeyFor(filePath, name),
            name,
            filePath,
            exportType,
            kind: 'react',
            rootOid: scan.rootOid,
            props,
            slots,
            variants,
            hasSpread,
            editable: true,
        });
    }

    return defs;
}

/** Convenience for cold scans over raw file content. */
export function discoverComponentsInFile(content: string, filePath: string): ComponentDef[] {
    const ast = getAstFromContent(content);
    if (!ast) return [];
    return discoverComponentsInAst(ast, filePath);
}
