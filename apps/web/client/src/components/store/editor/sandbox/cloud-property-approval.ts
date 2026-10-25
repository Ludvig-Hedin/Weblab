import type { CloudPropertyApproval, CloudPropertyBinding, WriteCodeAction } from '@weblab/models/actions';
import type { DomElement } from '@weblab/models';
import { readContentPropertyTarget, replaceContentPropertyTarget } from '@weblab/parser/src/code-edit/content-property-target';

const encoder = new TextEncoder();
const exact = (value: unknown, keys: string): value is Record<string, unknown> => !!value && typeof value === 'object' &&
    !Array.isArray(value) && Object.keys(value).sort().join(',') === keys;
const id = (value: unknown, max = 160): value is string => typeof value === 'string' && value.length > 0 && value.length <= max &&
    !/[^A-Za-z0-9_.:-]/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 160 &&
    /^[A-Za-z_$]/.test(value) && !/[^A-Za-z0-9_$]/.test(value);
const path = (value: unknown): value is string => typeof value === 'string' && value.length <= 300 && /^(?:src|app)\/.+\.tsx$/.test(value) &&
    !/[\\\s?#%\u0000-\u001f\u007f]/.test(value) && value.split('/').every(part => !!part && !part.startsWith('.'));
function text(value: unknown, max: number): value is string {
    if (typeof value !== 'string' || !value.length || encoder.encode(value).byteLength > max || /[\u0000-\u001f\u007f]/.test(value)) return false;
    for (let i = 0; i < value.length; i++) {
        const unit = value.charCodeAt(i);
        if (unit >= 0xd800 && unit <= 0xdbff) { const next = value.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) return false; }
        else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
    }
    return true;
}
function href(value: string): boolean {
    if (/[\s\\]/.test(value) || value.startsWith('//')) return false;
    try {
        if (/[\u0000-\u001f\u007f]/.test(decodeURIComponent(value))) return false;
        const url = new URL(value, 'https://content.invalid/');
        if (/^https:/i.test(value)) return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
        if (/^(mailto|tel):/i.test(value)) return value.slice(value.indexOf(':') + 1).length > 0;
        return !/^[^/?#]*:/.test(value) && url.origin === 'https://content.invalid';
    } catch { return false; }
}
export function validCloudPropertyApproval(value: unknown): value is CloudPropertyApproval {
    if (!exact(value, 'actorId,binding,branchId,definitionHash,designRevision,generation,path,preparationId,projectId,version')) return false;
    const pin = value as unknown as CloudPropertyApproval, binding = pin.binding, target = binding?.target;
    if (pin.version !== 1 || ![pin.actorId, pin.branchId, pin.projectId, pin.preparationId].every(v => id(v)) || !path(pin.path) ||
        !Number.isSafeInteger(pin.generation) || pin.generation < 1 || pin.generation >= Number.MAX_SAFE_INTEGER ||
        !Number.isSafeInteger(pin.designRevision) || pin.designRevision < 1 ||
        typeof pin.definitionHash !== 'string' || pin.definitionHash.length !== 64 || /[^a-f0-9]/.test(pin.definitionHash) ||
        !exact(binding, 'bindingId,label,options,target') || !id(binding.bindingId, 80) || !text(binding.label, 80) ||
        !target || !identifier(target.exportName) || !id(target.oid) || !Array.isArray(binding.options) || !binding.options.length || binding.options.length > 20) return false;
    if (target.kind === 'component-literal-href') {
        if (!exact(target, 'exportName,field,kind,oid') || target.field !== 'href') return false;
    } else if (target.kind === 'mapped-callsite-enum') {
        const mapping = target.renderMapping;
        if (!exact(target, 'exportName,field,kind,oid,renderMapping') || target.field !== 'tone' ||
            !exact(mapping, 'callsite,kind,mappingId,renderer,version') || mapping.version !== 1 || mapping.kind !== 'object-prop-image' || !id(mapping.mappingId) ||
            ![mapping.callsite, mapping.renderer].every(part => exact(part, 'exportName,oid,path') && path(part.path) && identifier(part.exportName) && id(part.oid)) ||
            mapping.callsite.path !== pin.path || mapping.callsite.oid !== target.oid || mapping.callsite.exportName !== target.exportName) return false;
    } else return false;
    const ids = new Set<string>(), values = new Set<string>();
    for (const option of binding.options) {
        if (!exact(option, 'id,label,value') || !id(option.id, 80) || !text(option.label, 80) || !text(option.value, 2048) ||
            ids.has(option.id) || values.has(option.value) || (target.kind === 'component-literal-href' ? !href(option.value) : !['light', 'dark'].includes(option.value))) return false;
        ids.add(option.id); values.add(option.value);
    }
    return encoder.encode(JSON.stringify(binding)).byteLength <= 128 * 1024;
}
export function copyCloudPropertyBinding(binding: CloudPropertyBinding) {
    const target = binding.target;
    return { bindingId: binding.bindingId, label: binding.label, target: target.kind === 'component-literal-href' ? { ...target } :
        { ...target, renderMapping: { ...target.renderMapping, callsite: { ...target.renderMapping.callsite }, renderer: { ...target.renderMapping.renderer } } },
        options: binding.options.map(option => ({ ...option })) };
}
export function freezeCloudPropertyApproval(pin: CloudPropertyApproval): CloudPropertyApproval {
    const binding = copyCloudPropertyBinding(pin.binding);
    if (binding.target.kind === 'mapped-callsite-enum') {
        Object.freeze(binding.target.renderMapping.callsite); Object.freeze(binding.target.renderMapping.renderer); Object.freeze(binding.target.renderMapping);
    }
    Object.freeze(binding.target); binding.options.forEach(Object.freeze); Object.freeze(binding.options); Object.freeze(binding);
    return Object.freeze({ ...pin, binding });
}
function canonicalPropertyIdentity(value: unknown): string {
    return JSON.stringify(value, (_key, value: unknown) => value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : value);
}
export function cloudPropertyApprovalIdentity(pin: CloudPropertyApproval): string {
    return canonicalPropertyIdentity(pin);
}
export function cloudPropertyTargetIdentity(target: CloudPropertyBinding['target']): string {
    return canonicalPropertyIdentity(target);
}
export function cloudPropertyWirePin(pin: CloudPropertyApproval) {
    return { version: 1 as const, path: pin.path, generation: pin.generation, preparationId: pin.preparationId,
        designRevision: pin.designRevision, definitionHash: pin.definitionHash, bindingId: pin.binding.bindingId };
}
export function matchesCloudPropertyElement(pin: CloudPropertyApproval, element: Pick<DomElement, 'branchId' | 'oid' | 'contentIdentity'>): boolean {
    if (element.branchId !== pin.branchId) return false;
    const target = pin.binding.target;
    return target.kind === 'component-literal-href' ? element.oid === target.oid && element.contentIdentity === undefined :
        element.oid === target.renderMapping.renderer.oid && element.contentIdentity?.mappingId === target.renderMapping.mappingId && element.contentIdentity.itemId === 'single';
}
/** History is semantic. Only this dispatch's diff is rebuilt from the current owner bytes. */
export function reconstructCloudPropertyAction(action: WriteCodeAction, original: string): WriteCodeAction {
    const edit = action.cloudProperty;
    if (!edit || !validCloudPropertyApproval(edit.pin) || action.branchId !== edit.pin.branchId || action.diffs.length !== 1 || action.diffs[0]?.path !== edit.pin.path ||
        action.previewStyle || action.refreshTokens || action.cssModuleStyle || 'cloudImage' in action || 'cloudAttribute' in action ||
        !edit.pin.binding.options.some(option => option.value === edit.previousValue) || !edit.pin.binding.options.some(option => option.value === edit.value) || edit.value === edit.previousValue ||
        readContentPropertyTarget(original, edit.pin.binding.target) !== edit.previousValue) throw new Error('The original property approval changed.');
    const generated = replaceContentPropertyTarget(original, edit.pin.binding.target, edit.previousValue, edit.value);
    return { ...action, cloudProperty: { ...edit, pin: freezeCloudPropertyApproval(edit.pin) }, diffs: [{ path: edit.pin.path, original, generated }] };
}
