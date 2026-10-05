'use node';

// Node-only authority for v2 text leaves. Render mapping and approval pins belong to the caller.
import { createHash } from 'node:crypto';
import { parse, type T } from '@weblab/parser/src/packages';
import {
    ContentTextTargetError,
    readContentTextTarget,
    replaceContentTextTarget,
    type ContentTextTarget,
} from '@weblab/parser/src/code-edit/content-target';
import { CloudContentContractError } from './cloudContentContract';

export interface ContentTextBinding {
    bindingId: string;
    target: ContentTextTarget;
}

export interface CloudTextContract {
    version: 2;
    path: string;
    bindings: ContentTextBinding[];
    fingerprint: string;
}

export interface CloudTextOperation {
    bindingId: string;
    previousValue: string;
    value: string;
}

function fail(code: CloudContentContractError['code']): never {
    throw new CloudContentContractError(code);
}

function targetCall<Result>(operation: () => Result): Result {
    try {
        return operation();
    } catch (error) {
        if (!(error instanceof ContentTextTargetError)) throw error;
        if (error.code === 'INVALID_SOURCE' || error.code === 'INVALID_VALUE') fail(error.code);
        if (error.code === 'PREVIOUS_VALUE_MISMATCH') fail('STALE_CONTRACT');
        return fail('INVALID_TARGET');
    }
}

function checkPath(path: string): void {
    if (typeof path !== 'string' || path.length > 300 || !/^(?:src|app)\/.+\.tsx?$/.test(path)
        || /[\\\u0000-\u0020\u007f]/.test(path)
        || path.split('/').some(part => !part || part.startsWith('.')
            || /^(?:node_modules|vendor|dist|build|coverage|env|config|configs)$/i.test(part))
        || /(?:^|\/)(?:env|config|middleware|instrumentation)(?:\.[^/]*)?\.tsx?$/i.test(path)
        || /(?:\.config|\.d)\.tsx?$/i.test(path)) fail('INVALID_TARGET');
}

function parseSource(source: string): T.File {
    if (typeof source !== 'string' || source.length > 750_000
        || Buffer.byteLength(source, 'utf8') > 750_000) fail('INVALID_SOURCE');
    try {
        return parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
    } catch { return fail('INVALID_SOURCE'); }
}

/** Keep every syntax node, comment and directive; ignore positions and literal spelling. */
function canonical(value: unknown): string {
    return JSON.stringify(value, (_key, entry: unknown) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
        const record = entry as Record<string, unknown>;
        return Object.fromEntries(Object.keys(record).sort()
            .filter(key => !['start', 'end', 'loc'].includes(key)
                && !(key === 'extra' && record.type !== 'DirectiveLiteral'))
            .map(key => [key, record[key]]));
    });
}

function checkBindings(bindings: ContentTextBinding[]): void {
    if (!Array.isArray(bindings) || !bindings.length || bindings.length > 100) fail('INVALID_TARGET');
    const ids = new Set<string>();
    const targets = new Set<string>();
    for (const binding of bindings) {
        if (!binding || typeof binding.bindingId !== 'string'
            || !/^[A-Za-z0-9_.:-]{1,160}$/.test(binding.bindingId) || ids.has(binding.bindingId)
            || !binding.target || typeof binding.target !== 'object') fail('INVALID_TARGET');
        const target = binding.target;
        const key = target.kind === 'component-literal'
            ? JSON.stringify([target.kind, target.exportName, target.oid])
            : target.kind === 'data-leaf'
                ? JSON.stringify([target.kind, target.exportName, target.itemId, target.property])
                : fail('INVALID_TARGET');
        if (targets.has(key)) fail('INVALID_TARGET');
        ids.add(binding.bindingId);
        targets.add(key);
    }
}

/** Mask exactly the approved leaves, including JSX's equivalent literal representations. */
function maskedSource(source: string, bindings: ContentTextBinding[]): string {
    let masked = source;
    for (const { target } of bindings) {
        let previous = targetCall(() => readContentTextTarget(masked, target));
        // Force the helper's canonical literal representation even when the leaf is already empty.
        if (previous === '') {
            masked = targetCall(() => replaceContentTextTarget(masked, target, '', 'x'));
            previous = 'x';
        }
        masked = targetCall(() => replaceContentTextTarget(masked, target, previous, ''));
    }
    return masked;
}

function structure(source: string, bindings: ContentTextBinding[]): string {
    const original = parseSource(source);
    const masked = parseSource(maskedSource(source, bindings));
    // Keep the original comment inventory too, so normalization cannot erase candidate comments.
    return canonical({ ast: masked, comments: original.comments ?? [] });
}

function fingerprint(path: string, source: string, bindings: ContentTextBinding[]): string {
    return createHash('sha256').update(canonical({ version: 2, path, bindings }))
        .update('\n').update(structure(source, bindings)).digest('hex');
}

export function createCloudTextContract(path: string, source: string, bindings: ContentTextBinding[]): CloudTextContract {
    checkPath(path);
    checkBindings(bindings);
    const approved = structuredClone(bindings);
    return { version: 2, path, bindings: approved, fingerprint: fingerprint(path, source, approved) };
}

/** Caller must verify actor, generation, version, structural epoch and saved revision atomically. */
export function validateCloudTextCandidate(input: {
    contract: CloudTextContract;
    originalSource: string;
    candidateSource: string;
}): { source: string; operations: CloudTextOperation[] } {
    const { contract, originalSource, candidateSource } = input;
    if (!contract || contract.version !== 2) fail('STALE_CONTRACT');
    checkPath(contract.path);
    checkBindings(contract.bindings);
    if (fingerprint(contract.path, originalSource, contract.bindings) !== contract.fingerprint) fail('STALE_CONTRACT');
    parseSource(candidateSource);
    let source = originalSource;
    const operations: CloudTextOperation[] = [];
    for (const { bindingId, target } of contract.bindings) {
        const previousValue = targetCall(() => readContentTextTarget(originalSource, target));
        const value = targetCall(() => readContentTextTarget(candidateSource, target));
        if (previousValue === value) continue;
        source = targetCall(() => replaceContentTextTarget(source, target, previousValue, value));
        operations.push({ bindingId, previousValue, value });
    }
    if (structure(source, contract.bindings) !== structure(candidateSource, contract.bindings)) fail('UNAPPROVED_CHANGE');
    return { source, operations };
}
