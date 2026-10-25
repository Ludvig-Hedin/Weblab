import postcss from 'postcss';
import { getAstFromContent, t, traverse } from '@weblab/parser';
import type { T } from '@weblab/parser';

type ReadFile = (path: string) => Promise<string | Uint8Array>;
type LayoutFunction = T.FunctionDeclaration | T.FunctionExpression | T.ArrowFunctionExpression;

export interface ProjectStylesheetSource {
    path: string;
    content: string;
    hasTailwindImport: boolean;
    hasImportedStylesheets: boolean;
    hasDisabledSourceScanning: boolean;
}

const LAYOUT_PATH = /^(?:src\/)?app\/(?:[^/]+\/)*layout\.[jt]sx?$/;
const LEGACY_LAYOUTS = ['src/app/layout.tsx', 'app/layout.tsx', 'src/app/(site)/layout.tsx', 'app/(site)/layout.tsx'];
const STYLESHEET_SPECIFIER = /\.(?:css|scss|sass|less)(?:[?#]|$)/i;

async function readText(readFile: ReadFile, path: string): Promise<string | null> {
    try {
        const content = await readFile(path);
        return typeof content === 'string' ? content : null;
    } catch {
        return null;
    }
}

function relativeStylesheet(layoutPath: string, specifier: string): string | null {
    if (!/^\.\.?\//.test(specifier) || !/\.css$/.test(specifier) || /\.module\.css$/.test(specifier) || specifier.includes('\\')) return null;
    const parts = layoutPath.split('/').slice(0, -1);
    for (const part of specifier.split('/')) {
        if (part === '.') continue;
        if (!part || part === '..' && parts.length === 0) return null;
        if (part === '..') parts.pop();
        else parts.push(part);
    }
    return parts.join('/');
}

function stylesheetImport(ast: T.File, layoutPath: string): string | null {
    const imports = ast.program.body.filter((node): node is T.ImportDeclaration =>
        t.isImportDeclaration(node) && STYLESHEET_SPECIFIER.test(node.source.value));
    const entry = imports[0];
    if (imports.length !== 1 || !entry || entry.specifiers.length !== 0 || entry.importKind === 'type') return null;
    return relativeStylesheet(layoutPath, entry.source.value);
}

/** Runtime loads cannot establish the single static stylesheet ownership contract. */
function hasUnmodeledStylesheetLoad(ast: T.File): boolean {
    let unsupported = false;
    const inspect = (target: T.Node | null | undefined) => {
        const specifier = t.isStringLiteral(target) ? target.value
            : t.isTemplateLiteral(target) && target.expressions.length === 0
                ? target.quasis[0]?.value.cooked ?? null : null;
        if (specifier === null || STYLESHEET_SPECIFIER.test(specifier)) unsupported = true;
    };
    t.traverseFast(ast, (node) => {
        if (node.type === 'ImportExpression') inspect(node.source);
        else if (t.isCallExpression(node) &&
            (t.isImport(node.callee) || t.isIdentifier(node.callee, { name: 'require' }))) {
            if (node.arguments.length !== 1) unsupported = true;
            else inspect(node.arguments[0]);
        }
    });
    return unsupported;
}

function defaultLayoutFunction(ast: T.File): LayoutFunction | null {
    const declaration = ast.program.body.find((node): node is T.ExportDefaultDeclaration => t.isExportDefaultDeclaration(node))?.declaration;
    if (t.isFunctionDeclaration(declaration) || t.isFunctionExpression(declaration) || t.isArrowFunctionExpression(declaration)) return declaration;
    if (!t.isIdentifier(declaration)) return null;
    for (const statement of ast.program.body) {
        if (t.isFunctionDeclaration(statement) && statement.id?.name === declaration.name) return statement;
        if (!t.isVariableDeclaration(statement) || statement.kind !== 'const') continue;
        for (const variable of statement.declarations) {
            if (t.isIdentifier(variable.id, { name: declaration.name }) &&
                (t.isArrowFunctionExpression(variable.init) || t.isFunctionExpression(variable.init))) return variable.init;
        }
    }
    return null;
}

function alwaysExits(statement: T.Statement | undefined): boolean {
    if (!statement) return false;
    if (t.isReturnStatement(statement) || t.isThrowStatement(statement)) return true;
    if (t.isBlockStatement(statement)) return statement.body.some(alwaysExits);
    return t.isIfStatement(statement) && alwaysExits(statement.consequent) && alwaysExits(statement.alternate ?? undefined);
}

/** A document layout must return a complete document on every explicit branch. */
function documentLayout(ast: T.File): 'document' | 'nested' | 'invalid' {
    let documents = 0;
    let invalid = false;
    traverse(ast, {
        JSXElement(path) {
            const name = path.node.openingElement.name;
            if (t.isJSXIdentifier(name, { name: 'html' })) {
                documents++;
                const bodies = path.node.children.filter((child): child is T.JSXElement =>
                    t.isJSXElement(child) && t.isJSXIdentifier(child.openingElement.name, { name: 'body' }));
                if (!path.node.closingElement || bodies.length !== 1 ||
                    path.findParent((parent) => parent.isJSXElement() &&
                        (t.isJSXIdentifier(parent.node.openingElement.name, { name: 'html' }) ||
                            t.isJSXIdentifier(parent.node.openingElement.name, { name: 'body' })))) invalid = true;
            } else if (t.isJSXIdentifier(name, { name: 'body' }) &&
                (!path.parentPath.isJSXElement() || !t.isJSXIdentifier(path.parentPath.node.openingElement.name, { name: 'html' }))) invalid = true;
        },
    });
    if (invalid) return 'invalid';
    if (documents === 0) return 'nested';
    const fn = defaultLayoutFunction(ast);
    if (!fn) return 'invalid';
    const returned: T.Node[] = [];
    if (t.isBlockStatement(fn.body)) {
        if (!alwaysExits(fn.body)) return 'invalid';
        traverse(ast, {
            ReturnStatement(path) {
                if (path.getFunctionParent()?.node === fn && path.node.argument) returned.push(path.node.argument);
                else if (path.getFunctionParent()?.node === fn) invalid = true;
            },
        });
    } else returned.push(fn.body);
    if (invalid || returned.length !== documents || returned.some((node) =>
        !t.isJSXElement(node) || !t.isJSXIdentifier(node.openingElement.name, { name: 'html' }))) return 'invalid';
    return 'document';
}

/** Inventory mode validates every App Router document root before selecting shared CSS. */
export async function discoverProjectStylesheet(
    readFile: ReadFile,
    sourcePaths?: readonly string[],
): Promise<ProjectStylesheetSource | null> {
    const explicitInventory = sourcePaths !== undefined;
    const layouts = explicitInventory
        ? [...new Set(sourcePaths)].filter((path) => LAYOUT_PATH.test(path)).sort()
        : LEGACY_LAYOUTS;
    if (layouts.length === 0 || layouts.length > 500) return null;
    if (explicitInventory && layouts.some((path) => path.split('/').some((part) => part === '.' || part === '..' || part.includes('\\')))) return null;
    const directories = new Set<string>();
    const roots: Array<{ layout: string; stylesheet: string }> = [];
    const nested: string[] = [];
    for (const layout of layouts) {
        const content = await readText(readFile, layout);
        if (content === null) {
            if (explicitInventory) return null;
            continue;
        }
        const ast = getAstFromContent(content);
        if (!ast) {
            if (explicitInventory) return null;
            continue;
        }
        if (hasUnmodeledStylesheetLoad(ast)) return null;
        if (explicitInventory) {
            const directory = layout.slice(0, layout.lastIndexOf('/'));
            if (directories.has(directory)) return null;
            directories.add(directory);
            const kind = documentLayout(ast);
            if (kind === 'invalid') return null;
            if (kind === 'nested') { nested.push(layout); continue; }
        }
        const stylesheet = stylesheetImport(ast, layout);
        if (!stylesheet) {
            if (explicitInventory) return null;
            continue;
        }
        roots.push({ layout, stylesheet });
    }
    if (!roots.length) return null;
    if (explicitInventory) {
        const appRoots = new Set(layouts.map((layout) => layout.startsWith('src/') ? 'src/app' : 'app'));
        if (appRoots.size !== 1) return null;
        const rootDirectories = roots.map(({ layout }) => layout.slice(0, layout.lastIndexOf('/')));
        if (rootDirectories.some((directory, index) => rootDirectories.some((other, otherIndex) =>
            otherIndex !== index && other.startsWith(`${directory}/`)))) return null;
        if (nested.some((layout) => !rootDirectories.some((directory) => layout.startsWith(`${directory}/`)))) return null;
        if (sourcePaths.some((path) => /^(?:src\/)?app\/(?:[^/]+\/)*page\.[jt]sx?$/.test(path) &&
            !rootDirectories.some((directory) => path.startsWith(`${directory}/`)))) return null;
    }
    const entries = new Set(roots.map(({ stylesheet }) => stylesheet));
    if (entries.size !== 1) return null;
    const path = roots[0]!.stylesheet;
    const content = await readText(readFile, path);
    if (content === null) return null;
    try {
        const css = postcss.parse(content);
        let hasTailwindImport = false;
        let hasImportedStylesheets = false;
        let hasDisabledSourceScanning = false;
        css.walkAtRules('import', (rule) => {
            if (/^['"]tailwindcss(?:\/[^'"]*)?['"](?:\s|$)/.test(rule.params.trim())) {
                if (/^['"]tailwindcss['"](?:\s|$)/.test(rule.params.trim())) hasTailwindImport = true;
                if (/\bsource\s*\(\s*none\s*\)/.test(rule.params)) hasDisabledSourceScanning = true;
            } else hasImportedStylesheets = true;
        });
        return { path, content, hasTailwindImport, hasImportedStylesheets, hasDisabledSourceScanning };
    } catch {
        return null;
    }
}
