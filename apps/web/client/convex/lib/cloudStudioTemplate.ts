'use node';

import { createHash } from 'node:crypto';
import { ConvexError, type Infer } from 'convex/values';
import { generate, parse, t, type T } from '@weblab/parser/src/packages';
import type { studioOperation } from '../cloudEditorStudioSchema';
import { approveCloudContentBindings, validateCloudContentCandidate, type CloudContentBinding } from './cloudContentContract';
import { STUDIO_PROFILE, studioSlug, studioRendererFiles, STUDIO_JSON_PATH, serializeStudioArtifact, draftStudioArtifact,
    type CloudStudioFreezeInput, type StudioSettings, type StudioSlot } from './cloudStudioContent';

export type StudioOperation = Infer<typeof studioOperation>;
type File = { path: string; text?: string; kind: string };
export const studioHash = (value: string): string => createHash('sha256').update(value).digest('hex');
export function studioFingerprint(transport: string, request: unknown): string {
    return studioHash(JSON.stringify({ transport, request }, (_key, value: unknown) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
        const object = value as Record<string, unknown>;
        return Object.fromEntries(Object.keys(object).sort().map(key => [key, object[key]]));
    }));
}
function failure(): never { throw new ConvexError('CLOUD_STUDIO_INVALID_TARGET'); }
function ast(source: string) {
    try { return parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] }); }
    catch { throw new ConvexError('CLOUD_STUDIO_INVALID_TARGET'); }
}
function oid(node: T.JSXElement): string | undefined {
    const ids = node.openingElement.attributes.filter(attribute => t.isJSXAttribute(attribute) && t.isJSXIdentifier(attribute.name, { name: 'data-oid' }));
    if (ids.length !== 1 || !t.isJSXAttribute(ids[0]) || !t.isStringLiteral(ids[0].value)) return undefined;
    return ids[0].value.value;
}
function literalElement(source: string): T.JSXElement {
    const expression = ast(`const element = (${source});`).program.body[0];
    if (!t.isVariableDeclaration(expression) || !t.isJSXElement(expression.declarations[0]?.init)) return failure();
    return expression.declarations[0].init;
}
function selected(source: string, target: string) {
    const tree = ast(source);
    const matches: Array<{ node: T.JSXElement; ancestors: T.JSXElement[] }> = [];
    const visit = (node: T.Node, ancestors: T.JSXElement[]) => {
        if (t.isJSXElement(node) && oid(node) === target) {
            matches.push({ node, ancestors });
        }
        if (t.isJSXElement(node)) for (const child of node.children) {
            if (t.isJSXElement(child)) visit(child, [...ancestors, node]);
        }
    };
    const exported = tree.program.body.find(node => t.isExportDefaultDeclaration(node));
    if (!t.isExportDefaultDeclaration(exported) || !t.isFunctionDeclaration(exported.declaration)) return failure();
    const returns = exported.declaration.body.body.filter(node => t.isReturnStatement(node));
    const returned = returns[0]?.argument;
    if (returns.length !== 1 || !t.isJSXElement(returned)) return failure();
    visit(returned, []);
    const found = matches[0];
    if (matches.length !== 1 || !found) return failure();
    return { tree, ...found };
}
function ancestry(source: string, target: string): string {
    const selection = selected(source, target);
    return studioHash(JSON.stringify([...selection.ancestors, selection.node].map(node => {
        if (!t.isJSXIdentifier(node.openingElement.name) || !['main', 'section', 'div', 'article'].includes(node.openingElement.name.name) || !oid(node)) failure();
        return { name: node.openingElement.name.name, opening: generate(node.openingElement).code };
    })));
}
function blockMarkup(id: string, block: StudioSlot['allowedBlocks'][number]): string {
    const style = block === 'callout-v1' ? 'border border-border bg-muted/30 p-8' : 'py-8';
    return `<section data-oid="${id}" className="${style}"><h2 data-oid="${id}-title" className="text-2xl font-medium">A new section</h2><p data-oid="${id}-body" className="mt-4 whitespace-pre-wrap text-muted-foreground">Add your story here.</p></section>`;
}
function bindingsForBlock(id: string): CloudContentBinding[] {
    return [{ oid: `${id}-title`, fields: ['text'] }, { oid: `${id}-body`, fields: ['text'] }];
}
function wrapper(source: string) { return `export default function Page() { return (${source}); }`; }
function verifyBlock(node: T.JSXElement, instance: StudioSlot['instances'][number]): void {
    const originalSource = wrapper(blockMarkup(instance.id, instance.block));
    const contract = approveCloudContentBindings({ path: 'src/app/page.tsx', source: originalSource,
        bindings: bindingsForBlock(instance.id), approvedAssetPaths: [] });
    validateCloudContentCandidate({ contract, originalSource, candidateSource: wrapper(generate(node).code), approvedAssetPaths: [] });
}
function validBlocks(blocks: StudioSlot['allowedBlocks']): void {
    if (blocks.length > 2 || new Set(blocks).size !== blocks.length || blocks.some(block => !['text-v1', 'callout-v1'].includes(block))) failure();
}
function generatedId(operationId: string, label: string) { return `studio-${studioHash(`${operationId}:${label}`).slice(0, 24)}`; }
function sourceAt(files: File[], path: string): string {
    const file = files.find(entry => entry.path === path);
    if (!file || file.kind !== 'file' || typeof file.text !== 'string' || !/^src\/app\/(?:[a-z0-9-]+\/)*page\.tsx$/.test(path)) return failure();
    return file.text;
}
function addSlot(source: string, parentOid: string, id: string) {
    const found = selected(source, parentOid);
    if (!t.isJSXIdentifier(found.node.openingElement.name) || !['main', 'section', 'div', 'article'].includes(found.node.openingElement.name.name)) failure();
    if (found.node.openingElement.selfClosing) {
        found.node.openingElement.selfClosing = false;
        found.node.closingElement = t.jsxClosingElement(t.cloneNode(found.node.openingElement.name));
    }
    found.node.children.push(literalElement(`<div data-oid="${id}" className="space-y-8"></div>`));
    return generate(found.tree).code + '\n';
}
export function prepareStudioOperation(input: { files: File[]; studio: CloudStudioFreezeInput | null; operation: StudioOperation; operationId: string }) {
    const { operation, operationId, files } = input;
    let settings: StudioSettings = input.studio ? structuredClone(input.studio.settings) : {
        profile: STUDIO_PROFILE, generation: 0, active: true, allowPages: true, allowedBlocks: ['text-v1', 'callout-v1'], slots: [],
    };
    const changes: Array<{ path: string; content: string }> = [];
    const addedBindings = new Map<string, CloudContentBinding[]>();
    const removedOids = new Set<string>();
    const addBinding = (path: string, bindings: CloudContentBinding[]) => addedBindings.set(path, [...(addedBindings.get(path) ?? []), ...bindings]);
    if (operation.kind === 'install') {
        if (input.studio) throw new ConvexError('CLOUD_STUDIO_ALREADY_INSTALLED');
        if (files.some(file => file.path === STUDIO_JSON_PATH || file.path.startsWith('src/app/journal/') || file.path === 'src/app/journal')) throw new ConvexError('CLOUD_STUDIO_ROUTE_OCCUPIED');
        settings.generation = 1;
        changes.push(...studioRendererFiles(), { path: STUDIO_JSON_PATH, content: serializeStudioArtifact(draftStudioArtifact({ settings, items: [], assets: [] })) });
        const id = generatedId(operationId, 'slot');
        const path = 'src/app/page.tsx';
        const content = addSlot(sourceAt(files, path), 'ce-home-main', id);
        settings.slots.push({ id, oid: id, path, ancestry: ancestry(content, id), min: 0, max: 10, allowedBlocks: [...settings.allowedBlocks], instances: [] });
        changes.push({ path, content });
    } else {
        if (!input.studio || (!settings.active && operation.kind !== 'configure')) throw new ConvexError('CLOUD_STUDIO_UNAVAILABLE');
        if (operation.kind === 'configure') {
            validBlocks(operation.allowedBlocks);
            settings = { ...settings, active: operation.active, allowPages: operation.allowPages,
                allowedBlocks: operation.allowedBlocks, generation: settings.generation + 1 };
            changes.push({ path: STUDIO_JSON_PATH, content: serializeStudioArtifact(draftStudioArtifact({ ...input.studio, settings })) });
        } else if (operation.kind === 'approveSlot') {
            validBlocks(operation.allowedBlocks);
            if (operation.min !== 0 || !Number.isSafeInteger(operation.max) || operation.max < 1 || operation.max > 20 || settings.slots.length >= 20) failure();
            const id = generatedId(operationId, 'slot');
            const original = sourceAt(files, operation.path);
            const parent = selected(original, operation.parentOid);
            const parentIds = new Set([...parent.ancestors, parent.node].map(oid));
            if (settings.slots.some(slot => slot.path === operation.path && parentIds.has(slot.oid))) failure();
            const content = addSlot(original, operation.parentOid, id);
            settings.slots.push({ id, path: operation.path, oid: id, ancestry: ancestry(content, id), min: operation.min, max: operation.max,
                allowedBlocks: operation.allowedBlocks, instances: [] });
            settings.generation++;
            changes.push({ path: operation.path, content }, { path: STUDIO_JSON_PATH,
                content: serializeStudioArtifact(draftStudioArtifact({ ...input.studio, settings })) });
        } else if (operation.kind === 'createPage') {
            if (!settings.allowPages || settings.slots.length >= 20) throw new ConvexError('CLOUD_STUDIO_TEMPLATE_NOT_APPROVED');
            const slug = studioSlug(operation.slug);
            const path = `src/app/${slug}/page.tsx`;
            if (['api', 'journal', 'public', 'src', 'app', 'node-modules'].includes(slug) || files.some(file => file.path === `src/app/${slug}` || file.path.startsWith(`src/app/${slug}/`))) throw new ConvexError('CLOUD_STUDIO_ROUTE_OCCUPIED');
            const id = generatedId(operationId, 'page'), slotId = `${id}-slot`;
            const content = wrapper(`<main data-oid="${id}" className="mx-auto max-w-6xl px-6 py-16 sm:px-10"><h1 data-oid="${id}-title" className="text-4xl font-medium">New page</h1><p data-oid="${id}-intro" className="mt-6 whitespace-pre-wrap text-lg text-muted-foreground">Tell your story.</p><div data-oid="${slotId}" className="mt-12 space-y-8"></div></main>`) + '\n';
            settings.slots.push({ id: slotId, path, oid: slotId, ancestry: ancestry(content, slotId), min: 0, max: 10, allowedBlocks: [...settings.allowedBlocks], instances: [] });
            addBinding(path, [{ oid: `${id}-title`, fields: ['text'] }, { oid: `${id}-intro`, fields: ['text'] }]);
            changes.push({ path, content });
        } else {
            const slot = settings.slots.find(entry => entry.id === operation.slotId);
            if (!slot) throw new ConvexError('CLOUD_STUDIO_SLOT_NOT_APPROVED');
            const source = sourceAt(files, slot.path);
            if (ancestry(source, slot.oid) !== slot.ancestry) throw new ConvexError('CLOUD_STUDIO_SLOT_CHANGED');
            const found = selected(source, slot.oid);
            const children = found.node.children.filter(child => !(t.isJSXText(child) && /^\s*$/.test(child.value)));
            if (children.length !== slot.instances.length) throw new ConvexError('CLOUD_STUDIO_SLOT_CHANGED');
            children.forEach((child, index) => { if (!t.isJSXElement(child) || oid(child) !== slot.instances[index]!.id) failure(); verifyBlock(child, slot.instances[index]!); });
            if (operation.kind === 'insertBlock') {
                if (!settings.allowedBlocks.includes(operation.block) || !slot.allowedBlocks.includes(operation.block) || children.length >= slot.max) throw new ConvexError('CLOUD_STUDIO_BLOCK_NOT_APPROVED');
                if (!Number.isSafeInteger(operation.position) || operation.position < 0 || operation.position > children.length) failure();
                const id = generatedId(operationId, 'block');
                children.splice(operation.position, 0, literalElement(blockMarkup(id, operation.block)));
                slot.instances.splice(operation.position, 0, { id, block: operation.block });
                addBinding(slot.path, bindingsForBlock(id));
            } else {
                const index = slot.instances.findIndex(instance => instance.id === operation.instanceId);
                if (index < 0) failure();
                if (operation.kind === 'removeBlock') {
                    if (children.length <= slot.min) throw new ConvexError('CLOUD_STUDIO_SLOT_LIMIT');
                    t.traverseFast(children[index]!, node => { if (t.isJSXElement(node)) { const id = oid(node); if (id) removedOids.add(id); } });
                    children.splice(index, 1); slot.instances.splice(index, 1);
                } else {
                    if (!Number.isSafeInteger(operation.position) || operation.position < 0 || operation.position >= children.length) failure();
                    const [child] = children.splice(index, 1), [instance] = slot.instances.splice(index, 1);
                    children.splice(operation.position, 0, child!); slot.instances.splice(operation.position, 0, instance!);
                }
            }
            found.node.children = children;
            changes.push({ path: slot.path, content: generate(found.tree).code + '\n' });
        }
    }
    return { settings, changes, addedBindings, removedOids };
}
