'use node';

import { createHash } from 'node:crypto';
import { replaceContentPropertyTarget, validateContentPropertyTarget, type ContentPropertyTarget } from '@weblab/parser/src/code-edit/content-property-target';
import { safeHref } from './cloudContentContract';

export const MAX_PROPERTY_CONTRACT_BYTES = 128 * 1024;
export interface ContentPropertyOption { id: string; label: string; value: string }
export interface ContentPropertyBinding { bindingId: string; label: string; target: ContentPropertyTarget; options: ContentPropertyOption[] }
/** Definition only. Current actor, preparation, design epoch, generation and CAS belong to the caller. */
export interface CloudPropertyContract { version: 1; path: string; bindings: ContentPropertyBinding[]; definitionHash: string }
export class CloudPropertyContractError extends Error {
    constructor(public readonly code: 'INVALID_DEFINITION' | 'INVALID_VALUE' | 'STALE_DEFINITION' | 'UNAPPROVED_CHANGE') {
        super(`CLOUD_PROPERTY_${code}`); this.name = 'CloudPropertyContractError';
    }
}
function fail(code: CloudPropertyContractError['code']): never { throw new CloudPropertyContractError(code); }
function exact(value: unknown, keys: string): boolean {
    return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === keys;
}
function string(value: unknown, bytes: number): value is string {
    if (typeof value !== 'string' || !value.length || Buffer.byteLength(value) > bytes || /[\u0000-\u001f\u007f]/.test(value)) return false;
    for (let i = 0; i < value.length; i++) {
        const unit = value.charCodeAt(i);
        if (unit >= 0xd800 && unit <= 0xdbff) { const next = value.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) return false; }
        else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
    }
    return true;
}
function id(value: unknown): value is string { return string(value, 80) && /^[A-Za-z0-9_.:-]+$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value); }
function canonical(value: unknown): string {
    return JSON.stringify(value, (_key, item: unknown) => item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
}
function definition(path: string, bindings: ContentPropertyBinding[]): string {
    const body = canonical({ version: 1, path, bindings });
    // Reserve room for the definitionHash field in the persisted contract.
    if (Buffer.byteLength(body) + 100 > MAX_PROPERTY_CONTRACT_BYTES) fail('INVALID_DEFINITION');
    return createHash('sha256').update(body).digest('hex');
}
function checked(path: string, files: Record<string, string>, bindings: ContentPropertyBinding[]): void {
    if (typeof path !== 'string' || !Array.isArray(bindings) || !bindings.length || bindings.length > 100) fail('INVALID_DEFINITION');
    const ids = new Set<string>(), targets = new Set<string>();
    // Check the serialized cap before walking up to 100 options/target lists.
    definition(path, bindings);
    for (const binding of bindings) {
        if (!exact(binding, 'bindingId,label,options,target') || !id(binding.bindingId) || ids.has(binding.bindingId)
            || !string(binding.label, 80) || !Array.isArray(binding.options) || !binding.options.length || binding.options.length > 20) fail('INVALID_DEFINITION');
        ids.add(binding.bindingId);
        const identity = canonical(binding.target);
        if (targets.has(identity)) fail('INVALID_DEFINITION');
        targets.add(identity);
        const optionIds = new Set<string>(), values = new Set<string>();
        for (const option of binding.options) {
            if (!exact(option, 'id,label,value') || !id(option.id) || optionIds.has(option.id) || !string(option.label, 80)
                || !string(option.value, 2_048) || values.has(option.value)) fail('INVALID_DEFINITION');
            if (binding.target?.kind === 'component-literal-href' ? !safeHref(option.value)
                : binding.target?.kind !== 'mapped-callsite-enum' || !['light', 'dark'].includes(option.value)) fail('INVALID_VALUE');
            optionIds.add(option.id); values.add(option.value);
        }
        if (!values.has(validateContentPropertyTarget(files, path, binding.target))) fail('INVALID_VALUE');
    }
}
export function createCloudPropertyContract(path: string, files: Record<string, string>, bindings: ContentPropertyBinding[]): CloudPropertyContract {
    checked(path, files, bindings);
    const retained = structuredClone(bindings);
    return { version: 1, path, bindings: retained, definitionHash: definition(path, retained) };
}
/** Node independently reconstructs the client candidate from the queried current source. */
export function validateCloudPropertyCandidate(input: {
    contract: CloudPropertyContract; files: Record<string, string>; bindingId: string;
    previousValue: string; choiceId: string; candidateSource: string;
}): { source: string; bindingId: string; previousValue: string; value: string; definitionHash: string } {
    const { contract, files } = input;
    if (!exact(contract, 'bindings,definitionHash,path,version') || contract.version !== 1
        || typeof contract.definitionHash !== 'string' || contract.definitionHash.length !== 64 || /[^a-f0-9]/.test(contract.definitionHash)) fail('STALE_DEFINITION');
    checked(contract.path, files, contract.bindings);
    if (definition(contract.path, contract.bindings) !== contract.definitionHash) fail('STALE_DEFINITION');
    const binding = contract.bindings.find(entry => entry.bindingId === input.bindingId);
    const choice = binding?.options.find(entry => entry.id === input.choiceId);
    if (!binding || !choice) fail('INVALID_VALUE');
    const original = files[contract.path];
    if (typeof original !== 'string') fail('INVALID_VALUE');
    const source = replaceContentPropertyTarget(original, binding.target, input.previousValue, choice.value);
    if (source !== input.candidateSource) fail('UNAPPROVED_CHANGE');
    // Keep the existing mapped renderer grammar valid after the explicit prop changes too.
    validateContentPropertyTarget({ ...files, [contract.path]: source }, contract.path, binding.target);
    return { source, bindingId: binding.bindingId, previousValue: input.previousValue, value: choice.value, definitionHash: contract.definitionHash };
}
