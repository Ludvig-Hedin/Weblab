'use node';

import { createHash } from 'node:crypto';
import { parse, t, type T } from '@weblab/parser/src/packages';
import { inlineSourceBytes, MAX_CLOUD_FILES, MAX_CLOUD_INLINE_BYTES, MAX_CLOUD_TEXT_BYTES } from './cloudEditor';
import { importSourcePath, MAX_IMPORT_ASSET_BYTES, MAX_IMPORT_BYTES } from './cloudImportManifest';
import { assertReleaseText } from './cloudReleasePolicy';

export type ImportedNextFile = {
    path: string;
    kind: 'file' | 'directory';
    text?: string;
    hash: string;
    bytes: number;
    storageId?: string;
};

// Official bun-v1.3.11 release asset: bun-linux-x64.zip. Never caller-selected.
export const IMPORTED_BUN_ARCHIVE_SHA256 = '8611ba935af886f05a6f38740a15160326c15e5d5d07adef966130b4493607ed';
const RUNTIME = {
    kind: 'next-app-bun-v1', node: 'node24', bun: '1.3.11', next: '16.3.1',
    install: 'frozen-ignore-scripts', dev: 'next-dev', build: 'next-build-webpack',
    bunArchiveSha256: IMPORTED_BUN_ARCHIVE_SHA256,
} as const;
export type ImportedNextPolicy = typeof RUNTIME & {
    pinnedFiles: Array<{ path: string; hash: string; bytes: number }>;
    policyHash: string;
};

const REQUIRED_PINS = [
    'package.json', 'bun.lock', 'next.config.ts', 'tsconfig.json',
    'public/weblab-preload-script.js', 'public/weblab-ix-runtime.js',
];
const ALLOWED_PINS = new Set([
    ...REQUIRED_PINS, 'bunfig.toml', 'postcss.config.mjs', 'eslint.config.mjs',
    'next-env.d.ts', '.env.example',
]);
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?(?:\+[0-9A-Za-z][0-9A-Za-z.-]*)?$/;
const HEX = /^[a-f0-9]{64}$/;
type Data = null | boolean | number | string | Data[] | { [key: string]: Data };
type DataObject = { [key: string]: Data };

function invalid(): never { throw new Error('CLOUD_IMPORT_RUNTIME_INVALID'); }
function digest(text: string): string { return createHash('sha256').update(text, 'utf8').digest('hex'); }
function object(value: Data | undefined): DataObject {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
    return value;
}
function onlyKeys(value: DataObject, allowed: readonly string[]): void {
    if (Object.keys(value).some(key => !allowed.includes(key))) invalid();
}

/** Accept JSONC literals only. The parser never executes imported source. */
function dataLiteral(node: T.Node, depth = 0): Data {
    if (depth > 24) return invalid();
    if (t.isStringLiteral(node)) {
        if (typeof node.extra?.raw !== 'string' || !node.extra.raw.startsWith('"')) return invalid();
        if (JSON.parse(node.extra.raw) !== node.value) return invalid();
        return node.value;
    }
    if (t.isNumericLiteral(node)) {
        if (!Number.isFinite(node.value) || !/^(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(String(node.extra?.raw))) return invalid();
        return node.value;
    }
    if (t.isBooleanLiteral(node)) return node.value;
    if (t.isNullLiteral(node)) return null;
    if (t.isArrayExpression(node)) return node.elements.map(value => value ? dataLiteral(value, depth + 1) : invalid());
    if (t.isObjectExpression(node)) {
        const result: DataObject = Object.create(null) as DataObject;
        for (const property of node.properties) {
            if (!t.isObjectProperty(property) || property.computed || property.shorthand || !t.isStringLiteral(property.key)) return invalid();
            const key = dataLiteral(property.key, depth + 1);
            if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key) || Object.hasOwn(result, key)) return invalid();
            result[key] = dataLiteral(property.value, depth + 1);
        }
        return result;
    }
    return invalid();
}

function parseData(text: string, jsonOnly = false): DataObject {
    if (jsonOnly) JSON.parse(text); // Also enforce JSON syntax for package.json.
    const ast = parse(`(${text}\n)`, { sourceType: 'script' });
    if (ast.program.body.length !== 1 || !t.isExpressionStatement(ast.program.body[0])) return invalid();
    return object(dataLiteral(ast.program.body[0].expression));
}

function dependencyMap(value: Data | undefined): Record<string, string> {
    const entries = value === undefined ? {} : object(value);
    const result: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const [name, range] of Object.entries(entries)) {
        // Only registry version/range syntax. No aliases, paths, URLs or protocols.
        if (!PACKAGE_NAME.test(name) || typeof range !== 'string' || !range || range.length > 200 ||
            !/^[0-9A-Za-z.*^~<>=|+ -]+$/.test(range) || !/[0-9*]/.test(range)) invalid();
        result[name] = range;
    }
    return result;
}
function equalMap(left: Record<string, string>, right: Record<string, string>): boolean {
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length && keys.every(key => left[key] === right[key]);
}
function trustedNames(value: Data | undefined): string[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some(name => typeof name !== 'string' || !PACKAGE_NAME.test(name))) return invalid();
    const names = value as string[];
    if (new Set(names).size !== names.length) return invalid();
    return [...names].sort();
}

function validateLock(pkg: DataObject, lock: DataObject): void {
    onlyKeys(lock, ['lockfileVersion', 'configVersion', 'workspaces', 'trustedDependencies', 'packages']);
    if (lock.lockfileVersion !== 1 || lock.configVersion !== 1) invalid();
    const workspaces = object(lock.workspaces);
    if (Object.keys(workspaces).length !== 1 || !Object.hasOwn(workspaces, '')) invalid();
    const root = object(workspaces['']);
    onlyKeys(root, ['name', 'version', ...DEPENDENCY_FIELDS]);
    if (root.name !== pkg.name || (root.version !== undefined && root.version !== pkg.version)) invalid();
    if (JSON.stringify(trustedNames(pkg.trustedDependencies)) !== JSON.stringify(trustedNames(lock.trustedDependencies))) invalid();
    const packages = object(lock.packages);
    if (!Object.keys(packages).length || Object.keys(packages).length > 5_000) invalid();
    for (const field of DEPENDENCY_FIELDS) {
        const deps = dependencyMap(pkg[field]);
        if (!equalMap(deps, dependencyMap(root[field]))) invalid();
        for (const name of Object.keys(deps)) {
            if (field !== 'peerDependencies' && !Object.hasOwn(packages, name)) invalid();
        }
    }
    for (const [key, entry] of Object.entries(packages)) {
        if (!Array.isArray(entry) || entry.length !== 4 || typeof entry[0] !== 'string' || entry[1] !== '' ||
            typeof entry[3] !== 'string' || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(entry[3])) invalid();
        const integrity = entry[3].slice(7);
        if (Buffer.from(integrity, 'base64').toString('base64') !== integrity) invalid();
        const separator = entry[0].lastIndexOf('@');
        const name = entry[0].slice(0, separator), version = entry[0].slice(separator + 1);
        if (!PACKAGE_NAME.test(name) || !VERSION.test(version) ||
            (key !== name && !key.endsWith(`/${name}`)) || key.length > 500 ||
            key.split('/').some(part => !/^(?:@?[a-z0-9][a-z0-9._-]*)$/.test(part) || part === '.' || part === '..')) invalid();
        const metadata = object(entry[2]);
        onlyKeys(metadata, ['dependencies', 'optionalDependencies', 'peerDependencies', 'optionalPeers', 'bin', 'os', 'cpu', 'libc', 'bundled']);
        for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) dependencyMap(metadata[field]);
        if (metadata.bundled !== undefined && metadata.bundled !== true) invalid();
        if (metadata.optionalPeers !== undefined) trustedNames(metadata.optionalPeers);
        for (const field of ['os', 'cpu', 'libc']) {
            const value = metadata[field];
            if (value !== undefined && (typeof value !== 'string' || !/^[a-z0-9!_-]+$/.test(value))) invalid();
        }
        if (metadata.bin !== undefined) {
            const bins = typeof metadata.bin === 'string' ? { executable: metadata.bin } : object(metadata.bin);
            for (const [bin, target] of Object.entries(bins)) {
                if (!/^[a-zA-Z0-9._-]+$/.test(bin) || typeof target !== 'string' ||
                    !target || target.startsWith('/') || /[\\\u0000-\u0020\u007f]/.test(target) ||
                    target.split('/').some(part => part === '..' || !part)) invalid();
            }
        }
    }
    const next = packages.next;
    if (!Array.isArray(next) || next[0] !== 'next@16.3.1') invalid();
}

function validatePackage(pkg: DataObject): void {
    if (typeof pkg.name !== 'string' || !PACKAGE_NAME.test(pkg.name) || pkg.packageManager !== 'bun@1.3.11' ||
        ['workspaces', 'overrides', 'resolutions', 'catalog', 'catalogs', 'patchedDependencies', 'installConfig', 'packageManagerConfig', 'pnpm', 'bun', 'imports'].some(key => Object.hasOwn(pkg, key))) invalid();
    const scripts = object(pkg.scripts);
    if (scripts.dev !== 'next dev' || scripts.build !== 'next build --webpack' ||
        Object.values(scripts).some(script => typeof script !== 'string' || script.length > 8_000)) invalid();
    if (dependencyMap(pkg.dependencies).next !== '16.3.1') invalid();
    // These fields remain inert because install always uses --ignore-scripts.
    trustedNames(pkg.trustedDependencies);
}

/** Deliberately narrow TOML admission, preserving the original bytes. */
function validateBunfig(text: string): void {
    let section = '';
    const seen = new Set<string>();
    for (const original of text.split(/\r?\n/)) {
        const line = original.trim();
        if (!line || line.startsWith('#')) continue;
        const header = /^\[(install|test)\]\s*(?:#.*)?$/.exec(line);
        if (header) {
            section = header[1]!;
            if (seen.has(`[${section}]`)) invalid();
            seen.add(`[${section}]`);
            continue;
        }
        const name = section === 'install' && /^exact\s*=\s*true\s*(?:#.*)?$/.test(line) ? 'install.exact'
            : section === 'test' && /^root\s*=\s*(["'])\.\/tests\1\s*(?:#.*)?$/.test(line) ? 'test.root' : null;
        if (!name || seen.has(name)) invalid();
        seen.add(name);
    }
}

function configPath(path: string): boolean {
    const name = path.split('/').at(-1)!.toLowerCase();
    return ALLOWED_PINS.has(path) || /(?:^|\.)config(?:\.|$)/.test(name) ||
        /^(?:package\.json|bun\.lockb?|bunfig\.toml|.*lock(?:\.(?:json|yaml|yml))?|npm-shrinkwrap\.json|\.(?:npmrc|yarnrc)(?:\..*)?|\.pnp\..*|\.babelrc(?:\..*)?|\.browserslistrc|tsconfig(?:\..*)?\.json|jsconfig\.json|deno\.jsonc?|next-env\.d\.ts)$/.test(name);
}

function validatedFiles(files: readonly ImportedNextFile[]): Map<string, ImportedNextFile> {
    if (!Array.isArray(files) || files.length === 0 || files.length > MAX_CLOUD_FILES) invalid();
    const byPath = new Map<string, ImportedNextFile>();
    let total = 0;
    for (const file of files) {
        if (!file || (file.kind !== 'file' && file.kind !== 'directory') || !Number.isSafeInteger(file.bytes) || file.bytes < 0) invalid();
        importSourcePath(file.path);
        if (byPath.has(file.path)) invalid();
        if (file.kind === 'directory') {
            if (file.bytes !== 0 || file.hash !== '' || file.text !== undefined || file.storageId !== undefined) invalid();
        } else {
            if (typeof file.hash !== 'string' || !HEX.test(file.hash)) invalid();
            if (file.text !== undefined) {
                if (typeof file.text !== 'string' || file.storageId !== undefined || file.bytes > MAX_CLOUD_TEXT_BYTES ||
                    Buffer.byteLength(file.text) !== file.bytes || Buffer.from(file.text).toString('utf8') !== file.text || digest(file.text) !== file.hash) invalid();
                assertReleaseText(file.path === '.env.example' ? 'env-example.txt' : file.path, file.text);
            } else if (file.bytes > MAX_IMPORT_ASSET_BYTES || typeof file.storageId !== 'string' ||
                !file.storageId || file.storageId.length > 128 || /[\u0000-\u0020\u007f]/.test(file.storageId)) invalid();
        }
        if (configPath(file.path) && !ALLOWED_PINS.has(file.path)) invalid();
        if (ALLOWED_PINS.has(file.path) && (file.kind !== 'file' || !file.text)) invalid();
        byPath.set(file.path, file);
        total += file.bytes;
        if (total > MAX_IMPORT_BYTES) invalid();
    }
    if (inlineSourceBytes(files) > MAX_CLOUD_INLINE_BYTES) invalid();
    for (const path of byPath.keys()) {
        const parts = path.split('/');
        for (let length = 1; length < parts.length; length++) {
            if (byPath.get(parts.slice(0, length).join('/'))?.kind === 'file') invalid();
        }
    }
    for (const path of REQUIRED_PINS) if (!byPath.has(path)) invalid();
    const roots = ['app', 'src/app'].filter(root => byPath.get(`${root}/layout.tsx`)?.text && byPath.get(`${root}/page.tsx`)?.text);
    if (roots.length !== 1 || [...byPath.keys()].some(path => /^(?:src\/)?pages(?:\/|$)/.test(path))) invalid();
    const otherRoot = roots[0] === 'app' ? 'src/app' : 'app';
    if ([...byPath.keys()].some(path => path === otherRoot || path.startsWith(`${otherRoot}/`))) invalid();
    return byPath;
}

/** Validation never imports config or runs project/dependency scripts. */
export function validateImportedNextProfile(files: readonly ImportedNextFile[]): ImportedNextPolicy {
    try {
        const byPath = validatedFiles(files);
        const pkg = parseData(byPath.get('package.json')!.text!, true);
        validatePackage(pkg);
        validateLock(pkg, parseData(byPath.get('bun.lock')!.text!));
        const bunfig = byPath.get('bunfig.toml');
        if (bunfig) validateBunfig(bunfig.text!);
        const pinnedFiles = files.filter(file => ALLOWED_PINS.has(file.path) || /^(?:src\/)?app\/layout\.tsx$/.test(file.path))
            .map(({ path, hash, bytes }) => ({ path, hash, bytes }))
            .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
        const policy = { ...RUNTIME, pinnedFiles };
        return { ...policy, policyHash: digest(JSON.stringify(policy)) };
    } catch { return invalid(); }
}

/** Revalidate source and inventory before runtime use; policy hashes alone grant nothing. */
export function assertImportedNextPins(files: readonly ImportedNextFile[], policy: ImportedNextPolicy): void {
    try {
        const current = validateImportedNextProfile(files);
        if (!policy || typeof policy !== 'object' || Object.keys(policy).length !== Object.keys(current).length ||
            Object.entries(RUNTIME).some(([key, value]) => Reflect.get(policy, key) !== value) ||
            policy.policyHash !== current.policyHash || !Array.isArray(policy.pinnedFiles) ||
            policy.pinnedFiles.length !== current.pinnedFiles.length) invalid();
        for (let index = 0; index < current.pinnedFiles.length; index++) {
            const expected = current.pinnedFiles[index]!, actual = policy.pinnedFiles[index];
            if (!actual || Object.keys(actual).length !== 3 || actual.path !== expected.path || actual.hash !== expected.hash || actual.bytes !== expected.bytes) invalid();
        }
    } catch { throw new Error('CLOUD_IMPORT_RUNTIME_PINS_CHANGED'); }
}
