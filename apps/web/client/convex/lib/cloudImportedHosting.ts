'use node';

import { parse, t, type T } from '@weblab/parser/src/packages';
import type { ImportedReleaseMetadata } from '../cloudReleasesSchema';
import { prepareImportedReleaseArtifact } from './cloudImportedReleaseArtifact';
import type { ImportedSnapshotFile } from './cloudImportedRelease';
import { IMPORTED_BUN_ARCHIVE_SHA256, type ImportedNextFile } from './cloudImportedNextProfile';
import { manifestHash, sha256 } from './cloudReleaseArtifact';
import {
    IMPORTED_HOSTING_BUILD, IMPORTED_HOSTING_CONFIG_PATHS, IMPORTED_HOSTING_INSTALL,
    IMPORTED_HOSTING_PLUGIN_VERSIONS, IMPORTED_HOSTING_PROFILE, IMPORTED_HOSTING_TOOLCHAIN,
    hostingFail, hostingHash, hostingId, serializeImportedHostingBuildPolicy, serializeImportedHostingCandidate,
    type ImportedHostingBinding, type ImportedHostingBuildPolicy, type ImportedHostingCandidate, type ImportedHostingVisibility,
} from './cloudImportedHostingState';

export type ImportedHostingArtifact = {
    id: string; purpose: 'private-artifact'; hash: string; artifactJson: string;
    projectId: string; branchId: string; workspaceId: string; revision: number;
};
export type ImportedHostingInput = {
    artifact: ImportedHostingArtifact;
    source: ImportedSnapshotFile[]; original: ImportedSnapshotFile[]; metadata: ImportedReleaseMetadata;
    actorId: string; visibility: ImportedHostingVisibility;
};
export type ImportedHostingPrepared = {
    importedHosting: ImportedHostingBinding; candidate: ImportedHostingCandidate;
    buildPolicyReceipt: ImportedHostingBuildPolicy; buildPolicyJson: string;
    artifactJson: string; hash: string; sourceHash: string; files: ImportedNextFile[];
};
type Data = null | boolean | number | string | Data[] | { [key: string]: Data };
type DataObject = { [key: string]: Data };
const unsupported = (): never => hostingFail('UNSUPPORTED_CONFIG');
function object(value: Data | undefined): DataObject {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return unsupported();
    return value;
}
function onlyKeys(value: object, allowed: readonly string[]): void {
    if (Object.keys(value).some(key => !allowed.includes(key))) unsupported();
}
function key(node: T.ObjectProperty | T.ObjectMethod): string {
    if (node.computed) return unsupported();
    const name = t.isIdentifier(node.key) ? node.key.name : t.isStringLiteral(node.key) ? node.key.value : unsupported();
    if (['__proto__', 'constructor', 'prototype'].includes(name)) return unsupported();
    return name;
}
function properties(node: T.ObjectExpression): Map<string, T.ObjectProperty | T.ObjectMethod> {
    const result = new Map<string, T.ObjectProperty | T.ObjectMethod>();
    for (const property of node.properties) {
        if ((!t.isObjectProperty(property) && !t.isObjectMethod(property)) || property.computed ||
            (t.isObjectProperty(property) && property.shorthand)) return unsupported();
        const name = key(property);
        if (result.has(name)) unsupported();
        result.set(name, property);
    }
    return result;
}
function literal(node: T.Node, depth = 0): Data {
    if (depth > 24) return unsupported();
    if (t.isStringLiteral(node) || t.isBooleanLiteral(node)) return node.value;
    if (t.isNumericLiteral(node) && Number.isFinite(node.value)) return node.value;
    if (t.isNullLiteral(node)) return null;
    if (t.isArrayExpression(node)) return node.elements.map(value => value ? literal(value, depth + 1) : unsupported());
    if (t.isObjectExpression(node)) {
        const result: DataObject = Object.create(null) as DataObject;
        for (const [name, property] of properties(node)) {
            if (!t.isObjectProperty(property)) return unsupported();
            result[name] = literal(property.value, depth + 1);
        }
        return result;
    }
    return unsupported();
}
function data(text: string): DataObject {
    const ast = parse(`(${text}\n)`, { sourceType: 'script' });
    const statement = ast.program.body[0];
    if (ast.program.body.length !== 1 || ast.program.directives.length || !t.isExpressionStatement(statement)) return unsupported();
    return object(literal(statement.expression));
}
/** Accepts one inert object export, never imports or evaluates the module. */
function moduleObject(text: string, allowNextType: boolean): T.ObjectExpression {
    const ast = parse(text, { sourceType: 'module', plugins: ['typescript'] });
    if (ast.program.directives.length || ast.program.interpreter) return unsupported();
    const body = [...ast.program.body];
    if (t.isImportDeclaration(body[0])) {
        const statement = body.shift();
        if (!allowNextType || !t.isImportDeclaration(statement) || statement.importKind !== 'type' || statement.source.value !== 'next' ||
            statement.specifiers.length !== 1 || !t.isImportSpecifier(statement.specifiers[0]) ||
            !t.isIdentifier(statement.specifiers[0].imported, { name: 'NextConfig' }) || statement.specifiers[0].local.name !== 'NextConfig') return unsupported();
    }
    if (body.length === 1 && t.isExportDefaultDeclaration(body[0]) && t.isObjectExpression(body[0].declaration)) return body[0].declaration;
    const declaration = body[0], exported = body[1];
    if (body.length !== 2 || !t.isVariableDeclaration(declaration, { kind: 'const' }) || declaration.declarations.length !== 1 ||
        !t.isExportDefaultDeclaration(exported)) return unsupported();
    const binding = declaration.declarations[0]!;
    if (!t.isIdentifier(binding.id) || binding.id.name === 'process' || !t.isObjectExpression(binding.init) ||
        !t.isIdentifier(exported.declaration, { name: binding.id.name })) return unsupported();
    if (binding.id.typeAnnotation) {
        const annotation = binding.id.typeAnnotation;
        if (!allowNextType || !t.isTSTypeAnnotation(annotation) || !t.isTSTypeReference(annotation.typeAnnotation) ||
            !t.isIdentifier(annotation.typeAnnotation.typeName, { name: 'NextConfig' }) || annotation.typeAnnotation.typeParameters) return unsupported();
    }
    return binding.init;
}
const SECURITY_HEADERS: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'X-Robots-Tag': 'noindex, nofollow',
};
function headers(method: T.ObjectMethod): void {
    const statement = method.body.body[0];
    if (method.kind !== 'method' || !method.async || method.generator || method.params.length || method.body.directives.length ||
        method.body.body.length !== 1 || !t.isReturnStatement(statement) || !statement.argument) return unsupported();
    const routes = literal(statement.argument);
    if (!Array.isArray(routes) || routes.length !== 1) return unsupported();
    const route = object(routes[0]); onlyKeys(route, ['source', 'headers']);
    if (route.source !== '/:path*' || !Array.isArray(route.headers) || route.headers.length < 1 || route.headers.length > 4) return unsupported();
    const seen = new Set<string>();
    for (const value of route.headers) {
        const header = object(value); onlyKeys(header, ['key', 'value']);
        if (typeof header.key !== 'string' || !Object.hasOwn(SECURITY_HEADERS, header.key) ||
            header.value !== SECURITY_HEADERS[header.key] || seen.has(header.key)) unsupported();
        seen.add(header.key as string);
    }
}
function nextConfig(text: string): void {
    const props = properties(moduleObject(text, true));
    for (const [name, property] of props) {
        if (name === 'headers') {
            if (!t.isObjectMethod(property)) return unsupported();
            headers(property); continue;
        }
        if (!t.isObjectProperty(property)) return unsupported();
        if (name === 'poweredByHeader' || name === 'devIndicators') {
            if (!t.isBooleanLiteral(property.value, { value: false })) unsupported();
        } else if (name === 'turbopack') {
            if (!t.isObjectExpression(property.value)) return unsupported();
            const values = properties(property.value), root = values.get('root');
            if (values.size !== 1 || !t.isObjectProperty(root) || !t.isCallExpression(root.value) || root.value.arguments.length ||
                !t.isMemberExpression(root.value.callee) || root.value.callee.computed ||
                !t.isIdentifier(root.value.callee.object, { name: 'process' }) || !t.isIdentifier(root.value.callee.property, { name: 'cwd' })) unsupported();
        } else if (name === 'images') {
            const value = object(literal(property.value)); onlyKeys(value, ['formats', 'qualities']);
            if (value.formats !== undefined && (!Array.isArray(value.formats) || value.formats.length < 1 || value.formats.length > 2 ||
                value.formats.some(format => format !== 'image/avif' && format !== 'image/webp') || new Set(value.formats).size !== value.formats.length)) unsupported();
            if (value.qualities !== undefined && (!Array.isArray(value.qualities) || value.qualities.length < 1 || value.qualities.length > 20 ||
                value.qualities.some(quality => typeof quality !== 'number' || !Number.isSafeInteger(quality) || quality < 1 || quality > 100) ||
                new Set(value.qualities).size !== value.qualities.length)) unsupported();
        } else unsupported();
    }
}
function strings(value: Data | undefined, max: number): string[] {
    if (!Array.isArray(value) || value.length > max || value.some(item => typeof item !== 'string' || !item || item.length > 240 || /[\\\u0000-\u001f\u007f]/.test(item))) return unsupported();
    return value as string[];
}
function tsConfig(text: string): void {
    const config = data(text); onlyKeys(config, ['compilerOptions', 'include', 'exclude']);
    const options = object(config.compilerOptions);
    const booleans: Record<string, boolean> = {
        allowJs: false, skipLibCheck: true, strict: true, noEmit: true, esModuleInterop: true,
        resolveJsonModule: true, isolatedModules: true, incremental: true,
        noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true,
    };
    const enums: Record<string, string> = { target: 'ES2022', module: 'esnext', moduleResolution: 'bundler', jsx: 'react-jsx' };
    onlyKeys(options, [...Object.keys(booleans), ...Object.keys(enums), 'lib', 'plugins', 'paths', 'types']);
    for (const [name, expected] of Object.entries({ ...booleans, ...enums })) if (options[name] !== undefined && options[name] !== expected) unsupported();
    if (options.lib !== undefined && strings(options.lib, 3).some(value => !['dom', 'dom.iterable', 'esnext'].includes(value))) unsupported();
    if (options.types !== undefined && strings(options.types, 1).some(value => value !== 'bun')) unsupported();
    if (options.paths !== undefined) {
        const paths = object(options.paths); onlyKeys(paths, ['@/*']);
        if (JSON.stringify(paths['@/*']) !== '["./src/*"]') unsupported();
    }
    if (options.plugins !== undefined && (!Array.isArray(options.plugins) || options.plugins.length !== 1 ||
        JSON.stringify(object(options.plugins[0])) !== '{"name":"next"}')) unsupported();
    for (const name of ['include', 'exclude']) if (config[name] !== undefined) {
        for (const path of strings(config[name], 16)) if (path.startsWith('/') || path.split('/').includes('..') || /^[A-Za-z]:/.test(path)) unsupported();
    }
}
function declarations(text: string): void {
    // Next-generated type references are inert, but custom imports/ambient executable config are unsupported.
    for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
        const value = line.trim();
        if (!value || value.startsWith('//') && !value.startsWith('///')) continue;
        if (/^\/\/\/ <reference types="(?:next|next\/image-types\/global)" \/>$/.test(value)) continue;
        if (/^import "\.\/\.next\/(?:dev\/)?types\/(?:routes|root-params)\.d\.ts";$/.test(value)) continue;
        unsupported();
    }
}
function buildPolicy(files: ImportedNextFile[]): ImportedHostingBuildPolicy {
    const byPath = new Map(files.map(file => [file.path, file]));
    const text = (path: string): string => { const value = byPath.get(path)?.text; return value === undefined ? unsupported() : value; };
    for (const file of files) {
        const lower = file.path.toLowerCase(), name = lower.split('/').at(-1)!;
        if (name === 'vercel.json' || name.startsWith('.postcssrc') || lower.split('/').includes('.vercel') ||
            /(?:^|\/)(?:middleware|instrumentation(?:-client)?|proxy|route)\.[cm]?[jt]sx?$/.test(lower) ||
            /(?:^|\/)api(?:\/|$)/.test(lower) || /\.(?:scss|sass|less|styl)$/.test(lower) ||
            /(?:^|\/)\.(?:babelrc|npmrc|yarnrc)(?:\.|$)/.test(lower) ||
            (name.startsWith('.env') && file.path !== '.env.example') ||
            /(?:^|\.)config(?:\.|$)/.test(name) && !(IMPORTED_HOSTING_CONFIG_PATHS as readonly string[]).includes(file.path)) unsupported();
        // This first grammar refuses escapes rather than allowing escaped @plugin/@config names.
        if (/\.css$/.test(lower) && (file.text === undefined || /\\|@(config|plugin)\b/i.test(file.text))) unsupported();
        if (['public/weblab-preload-script.js', 'public/weblab-ix-runtime.js'].includes(file.path)) unsupported();
    }
    nextConfig(text('next.config.ts')); tsConfig(text('tsconfig.json'));
    if (byPath.has('next-env.d.ts')) declarations(text('next-env.d.ts'));
    const hasPostcss = byPath.has('postcss.config.mjs');
    if (hasPostcss) {
        const config = object(literal(moduleObject(text('postcss.config.mjs'), false))); onlyKeys(config, ['plugins']);
        const plugins = object(config.plugins); onlyKeys(plugins, ['@tailwindcss/postcss']);
        if (Object.keys(plugins).length !== 1 || Object.keys(object(plugins['@tailwindcss/postcss'])).length) unsupported();
    }
    const pkg = data(text('package.json'));
    // These alternative package-level configs must not influence the fixed build command.
    if (['babel', 'postcss', 'browserslist', 'type', 'exports', 'main', 'module'].some(name => Object.hasOwn(pkg, name))) unsupported();
    if (pkg.engines !== undefined) {
        const engines = object(pkg.engines); onlyKeys(engines, ['node', 'bun']);
        // Preserve the real customer's minimums. Provider selection must still prove the desired versions.
        if (engines.node !== undefined && engines.node !== '24.x' && engines.node !== '>=20.9.0') unsupported();
        if (engines.bun !== undefined && engines.bun !== '1.3.11' && engines.bun !== '>=1.2.0') unsupported();
    }
    const lock = data(text('bun.lock')), packages = object(lock.packages);
    const pluginNames: Array<keyof typeof IMPORTED_HOSTING_PLUGIN_VERSIONS> = hasPostcss
        ? ['@tailwindcss/postcss', 'next', 'tailwindcss', 'typescript'] : ['next', 'typescript'];
    const plugins = pluginNames.map(name => {
        const version = IMPORTED_HOSTING_PLUGIN_VERSIONS[name], tuple = packages[name];
        if (!Array.isArray(tuple) || tuple.length !== 4 || tuple[0] !== `${name}@${version}` || tuple[1] !== '' || typeof tuple[3] !== 'string') return unsupported();
        const declared = ['dependencies', 'devDependencies'].some(field => Object.hasOwn(object(pkg[field] ?? {}), name));
        if (!declared) unsupported();
        return { name, version, integrity: tuple[3] };
    });
    const configs = files.filter(file => (IMPORTED_HOSTING_CONFIG_PATHS as readonly string[]).includes(file.path))
        .map(({ path, hash, bytes, text }) => { if (text === undefined) unsupported(); return { path, hash, bytes }; })
        .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    return { version: 1, profile: IMPORTED_HOSTING_PROFILE, toolchain: { ...IMPORTED_HOSTING_TOOLCHAIN },
        installCommand: IMPORTED_HOSTING_INSTALL, buildCommand: IMPORTED_HOSTING_BUILD, configs, plugins, deployHash: manifestHash(files) };
}

/**
 * Pure planner over trusted retained records. Revalidates genuine prepared source, then its stripped
 * derivative. Callers must verify storage bytes and current actor/scope access before sealing/sending.
 * Desired toolchain facts are NOT a provider proof. Visibility is data, never publishing authority.
 */
export async function prepareImportedHostingCandidate(input: ImportedHostingInput): Promise<ImportedHostingPrepared> {
    const { artifact } = input;
    if (!artifact || artifact.purpose !== 'private-artifact' || !hostingId(artifact.id) || !hostingHash(artifact.hash) ||
        ![artifact.projectId, artifact.branchId, artifact.workspaceId, input.actorId].every(hostingId) ||
        !Number.isSafeInteger(artifact.revision) || artifact.revision < 0 || artifact.revision !== input.metadata.capturedRevision ||
        typeof artifact.artifactJson !== 'string' || artifact.artifactJson.length > 700_000 ||
        IMPORTED_HOSTING_TOOLCHAIN.bunArchiveSha256 !== IMPORTED_BUN_ARCHIVE_SHA256) hostingFail('ARTIFACT_MISMATCH');
    // This existing path requires real prepared bridge files. Never fabricate them for validation.
    const prepared = await prepareImportedReleaseArtifact({ purpose: 'private-artifact', source: input.source, original: input.original, metadata: input.metadata });
    if (prepared.hash !== artifact.hash || prepared.artifactJson !== artifact.artifactJson) hostingFail('ARTIFACT_MISMATCH');
    let buildPolicyReceipt: ImportedHostingBuildPolicy;
    try { buildPolicyReceipt = buildPolicy(prepared.files); } catch { return unsupported(); }
    const buildPolicyJson = serializeImportedHostingBuildPolicy(buildPolicyReceipt);
    const importedHosting: ImportedHostingBinding = { version: 1, profile: IMPORTED_HOSTING_PROFILE,
        artifactId: artifact.id, artifactHash: artifact.hash, deployHash: buildPolicyReceipt.deployHash,
        buildPolicyHash: sha256(buildPolicyJson), visibility: input.visibility };
    const candidate: ImportedHostingCandidate = { version: 1, profile: IMPORTED_HOSTING_PROFILE,
        projectId: artifact.projectId, branchId: artifact.branchId, workspaceId: artifact.workspaceId,
        actorId: input.actorId, revision: artifact.revision, importedHosting };
    const artifactJson = serializeImportedHostingCandidate(candidate);
    return { importedHosting, candidate, buildPolicyReceipt, buildPolicyJson, artifactJson,
        hash: sha256(artifactJson), sourceHash: prepared.sourceHash, files: prepared.files };
}
