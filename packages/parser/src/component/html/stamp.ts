import type { DefaultTreeAdapterMap } from 'parse5';
import { parseFragment, serialize } from 'parse5';

import type {
    ComponentDef,
    ComponentPropSpec,
    ComponentSlotSpec,
    ComponentVariantSpec,
} from '@weblab/models';
import { EditorAttributes } from '@weblab/constants';
import { createOid } from '@weblab/utility';

import type { HtmlAst } from '../../pipelines/html';
import { htmlPipeline } from '../../pipelines/html';

type Element = DefaultTreeAdapterMap['element'];
type ChildNode = DefaultTreeAdapterMap['childNode'];
type Node = DefaultTreeAdapterMap['node'];
type TextNode = DefaultTreeAdapterMap['textNode'];
type ParentNode = DefaultTreeAdapterMap['parentNode'];

/**
 * Editor-managed component stamping for static-HTML projects.
 *
 * Master partials live at `weblab/components/<key>.html`:
 *
 *   <script type="application/json" data-weblab-manifest>
 *   { "name": "Card", "props": { "title": {"type":"text","default":"Hi"},
 *     "variant": {"type":"variant","default":"default",
 *                 "variants":{"default":"card--light","dark":"card--dark"}} } }
 *   </script>
 *   <div class="card {{variant:class}}" data-oid="a1">
 *     <h3 data-oid="b2">{{title}}</h3>
 *     <a href="{{href}}" data-wb-if="showCta" data-oid="c3">More</a>
 *     <slot name="body"><p data-oid="d4">Fallback</p></slot>
 *   </div>
 *
 * Instances are stamped into pages with the marker attributes ON the root
 * element (no extra wrapper): `data-weblab-component`, `data-weblab-instance`
 * and `data-weblab-props`. Stamped element oids are derived as
 * `${masterOid}~${instanceId}` — unique per instance, stable across
 * re-stamps, reversible for edit routing. Slot content keeps page-native
 * oids and is preserved verbatim across re-stamps inside
 * `<div data-wb-slot-content="name">` regions.
 */

export const HTML_COMPONENT_DIR = 'weblab/components';
export const ATTR_COMPONENT = 'data-weblab-component';
export const ATTR_INSTANCE = 'data-weblab-instance';
export const ATTR_PROPS = 'data-weblab-props';
export const ATTR_SLOT_CONTENT = 'data-wb-slot-content';
export const ATTR_IF = 'data-wb-if';

export type HtmlPropValue = string | number | boolean;

export interface HtmlInstance {
    componentKey: string;
    instanceId: string;
    props: Record<string, HtmlPropValue>;
    /** Slot name → serialized inner HTML (page-native oids). */
    slots: Record<string, string>;
}

// ── parse5 helpers ──

function isElement(node: Node): node is Element {
    return 'tagName' in node && Array.isArray((node as Element).attrs);
}

function getAttr(el: Element, name: string): string | null {
    return el.attrs.find((a) => a.name === name)?.value ?? null;
}

function setAttr(el: Element, name: string, value: string): void {
    const attr = el.attrs.find((a) => a.name === name);
    if (attr) attr.value = value;
    else el.attrs.push({ name, value });
}

function removeAttr(el: Element, name: string): void {
    el.attrs = el.attrs.filter((a) => a.name !== name);
}

function* walkElements(root: Node): Generator<Element> {
    const children = 'childNodes' in root ? (root as ParentNode).childNodes : [];
    for (const child of children) {
        if (isElement(child)) {
            yield child;
            yield* walkElements(child);
        } else if ('childNodes' in child) {
            yield* walkElements(child);
        }
    }
}

function detachNode(node: ChildNode): void {
    const parent = node.parentNode;
    if (!parent || !('childNodes' in parent)) return;
    const idx = parent.childNodes.indexOf(node);
    if (idx >= 0) parent.childNodes.splice(idx, 1);
}

function serializeChildren(el: Element): string {
    return serialize(el);
}

// ── Manifest ──

interface ManifestProp {
    type: string;
    default?: HtmlPropValue;
    variants?: Record<string, string>;
}

interface Manifest {
    name: string;
    props: Record<string, ManifestProp>;
}

function parseManifest(masterRoot: ParentNode): Manifest | null {
    for (const el of walkElements(masterRoot as Node)) {
        if (el.tagName === 'script' && getAttr(el, 'data-weblab-manifest') !== null) {
            const text = el.childNodes
                .map((c) => (c.nodeName === '#text' ? (c as TextNode).value : ''))
                .join('');
            try {
                return JSON.parse(text) as Manifest;
            } catch {
                return null;
            }
        }
    }
    return null;
}

function findMasterRootElement(masterRoot: ParentNode): Element | null {
    for (const child of masterRoot.childNodes) {
        if (isElement(child) && child.tagName !== 'script') return child;
    }
    return null;
}

/**
 * Derives a ComponentDef from a master partial. The manifest lives in the
 * file, so the definition is fully reproducible from code.
 */
export function parseComponentManifest(
    masterContent: string,
    filePath: string,
): ComponentDef | null {
    const fragment = parseFragment(masterContent);
    const manifest = parseManifest(fragment);
    const root = findMasterRootElement(fragment);
    if (!manifest?.name || !root) return null;

    const props: ComponentPropSpec[] = [];
    const slots: ComponentSlotSpec[] = [];
    let variants: ComponentVariantSpec | null = null;

    for (const [name, spec] of Object.entries(manifest.props ?? {})) {
        if (spec.type === 'variant' && spec.variants) {
            variants = {
                propName: name,
                style: 'plain-map',
                mapName: name,
                variants: spec.variants,
                defaultVariant:
                    typeof spec.default === 'string'
                        ? spec.default
                        : (Object.keys(spec.variants)[0] ?? 'default'),
            };
        }
        props.push({
            name,
            type:
                spec.type === 'text' ||
                spec.type === 'image' ||
                spec.type === 'link' ||
                spec.type === 'number' ||
                spec.type === 'switch' ||
                spec.type === 'variant'
                    ? (spec.type as ComponentPropSpec['type'])
                    : 'unsupported',
            required: false,
            defaultValue: spec.default ?? null,
            bindings: [],
            editable: spec.type !== 'unsupported',
            ...(spec.variants ? { options: Object.keys(spec.variants) } : {}),
        });
    }

    // Slots declared as <slot name="x"> in the body.
    for (const el of walkElements(fragment)) {
        if (el.tagName === 'slot') {
            const name = getAttr(el, 'name') ?? 'children';
            slots.push({ name, containerOid: getAttr(el, EditorAttributes.DATA_WEBLAB_ID) });
            props.push({
                name,
                type: 'slot',
                required: false,
                defaultValue: null,
                bindings: [{ kind: 'slot-site', containerOid: null }],
                editable: false,
            });
        }
    }

    return {
        key: filePath,
        name: manifest.name,
        filePath,
        exportType: 'named',
        kind: 'html',
        rootOid: getAttr(root, EditorAttributes.DATA_WEBLAB_ID),
        props,
        slots,
        variants,
        hasSpread: false,
        editable: true,
    };
}

// ── Stamping ──

const PLACEHOLDER = /\{\{(\w+)(?::class)?\}\}/g;

function substitute(
    text: string,
    resolve: (name: string, isClass: boolean) => string,
): string {
    return text.replace(PLACEHOLDER, (match, name: string) =>
        resolve(name, match.includes(':class')),
    );
}

/**
 * Renders one instance of a master. Returns the serialized root element with
 * marker attributes; oids inside are `${masterOid}~${instanceId}`.
 */
export function stampInstance(masterContent: string, instance: HtmlInstance): string | null {
    const fragment = parseFragment(masterContent);
    const manifest = parseManifest(fragment);
    const root = findMasterRootElement(fragment);
    if (!manifest || !root) return null;

    const valueOf = (name: string): HtmlPropValue | null => {
        if (instance.props[name] !== undefined) return instance.props[name]!;
        return manifest.props[name]?.default ?? null;
    };

    const resolve = (name: string, isClass: boolean): string => {
        const spec = manifest.props[name];
        if (isClass && spec?.variants) {
            const chosen = String(valueOf(name) ?? '');
            return spec.variants[chosen] ?? '';
        }
        const value = valueOf(name);
        return value == null ? '' : String(value);
    };

    // Depth-first transform. Collect removals after the walk so iteration
    // stays stable.
    const toRemove: Element[] = [];
    const slotsToFill: Element[] = [];

    for (const el of walkElements(fragment)) {
        if (el.tagName === 'script' && getAttr(el, 'data-weblab-manifest') !== null) {
            toRemove.push(el);
            continue;
        }
        if (el.tagName === 'slot') {
            slotsToFill.push(el);
            continue;
        }

        // data-wb-if
        const guard = getAttr(el, ATTR_IF);
        if (guard !== null) {
            const value = valueOf(guard);
            if (!value) {
                toRemove.push(el);
                continue;
            }
        }

        // Attribute placeholders.
        for (const attr of el.attrs) {
            if (attr.value.includes('{{')) {
                attr.value = substitute(attr.value, resolve).replace(/\s{2,}/g, ' ').trim();
            }
        }

        // Instance-scoped oid.
        const oid = getAttr(el, EditorAttributes.DATA_WEBLAB_ID);
        if (oid && !oid.includes('~')) {
            setAttr(el, EditorAttributes.DATA_WEBLAB_ID, `${oid}~${instance.instanceId}`);
        }

        // Text placeholders.
        for (const child of el.childNodes) {
            if (child.nodeName === '#text') {
                const textNode = child as TextNode;
                if (textNode.value.includes('{{')) {
                    textNode.value = substitute(textNode.value, resolve);
                }
            }
        }
    }

    for (const el of toRemove) detachNode(el);

    // Slots → <div data-wb-slot-content="name">instance content or fallback</div>
    for (const slot of slotsToFill) {
        const name = getAttr(slot, 'name') ?? 'children';
        const content = instance.slots[name];
        const replacementHtml =
            content !== undefined && content.trim().length > 0
                ? `<div ${ATTR_SLOT_CONTENT}="${name}">${content}</div>`
                : `<div ${ATTR_SLOT_CONTENT}="${name}">${serializeChildren(slot)}</div>`;
        const replacementFragment = parseFragment(replacementHtml);
        const replacement = replacementFragment.childNodes[0];
        const parent = slot.parentNode;
        if (!replacement || !parent || !('childNodes' in parent)) continue;
        const idx = parent.childNodes.indexOf(slot);
        (replacement as ChildNode).parentNode = parent;
        parent.childNodes.splice(idx, 1, replacement as ChildNode);
        // Fallback content keeps master oids — scope them like everything else.
        if (content === undefined || content.trim().length === 0) {
            for (const el of walkElements(replacement as Node)) {
                const oid = getAttr(el, EditorAttributes.DATA_WEBLAB_ID);
                if (oid && !oid.includes('~')) {
                    setAttr(el, EditorAttributes.DATA_WEBLAB_ID, `${oid}~${instance.instanceId}`);
                }
            }
        }
    }

    // Marker attributes on the root.
    setAttr(root, ATTR_COMPONENT, instance.componentKey);
    setAttr(root, ATTR_INSTANCE, instance.instanceId);
    setAttr(root, ATTR_PROPS, JSON.stringify(instance.props));

    const holder = parseFragment('<div></div>').childNodes[0] as Element;
    holder.childNodes = [root as ChildNode];
    (root as ChildNode).parentNode = holder;
    return serializeChildren(holder);
}

/** Reads all stamped instances (markers) in a page. */
export function findInstancesInPage(
    pageRoot: ParentNode,
    componentKey?: string,
): Array<{ element: Element; instance: HtmlInstance }> {
    const results: Array<{ element: Element; instance: HtmlInstance }> = [];
    for (const el of walkElements(pageRoot as Node)) {
        const key = getAttr(el, ATTR_COMPONENT);
        if (!key || (componentKey && key !== componentKey)) continue;
        const instanceId = getAttr(el, ATTR_INSTANCE);
        if (!instanceId) continue;

        let props: Record<string, HtmlPropValue> = {};
        try {
            props = JSON.parse(getAttr(el, ATTR_PROPS) ?? '{}');
        } catch {
            props = {};
        }

        const slots: Record<string, string> = {};
        for (const slotEl of walkElements(el)) {
            const slotName = getAttr(slotEl, ATTR_SLOT_CONTENT);
            // Only slot regions whose content diverged from the master
            // fallback are per-instance; we can't distinguish here, so all
            // regions are preserved verbatim. Fallback content carries
            // `~`-scoped oids and is treated as instance content from then on.
            if (slotName) {
                slots[slotName] = serializeChildren(slotEl);
            }
        }

        results.push({ element: el, instance: { componentKey: key, instanceId, props, slots } });
    }
    return results;
}

/**
 * Re-renders every instance of a component in a page from the (edited)
 * master, preserving per-instance props and slot content. Idempotent:
 * re-stamping twice yields no diff.
 */
export function restampPage(
    pageContent: string,
    masterContent: string,
    componentKey: string,
): { content: string; changed: boolean } {
    const ast = htmlPipeline.parse(pageContent) as HtmlAst | null;
    if (!ast) return { content: pageContent, changed: false };

    const markers = findInstancesInPage(ast.root as ParentNode, componentKey);
    if (markers.length === 0) return { content: pageContent, changed: false };

    for (const { element, instance } of markers) {
        const stamped = stampInstance(masterContent, instance);
        if (!stamped) continue;
        const replacementFragment = parseFragment(stamped);
        const replacement = replacementFragment.childNodes.find(isElement);
        const parent = element.parentNode;
        if (!replacement || !parent || !('childNodes' in parent)) continue;
        const idx = parent.childNodes.indexOf(element);
        (replacement as ChildNode).parentNode = parent;
        parent.childNodes.splice(idx, 1, replacement as ChildNode);
    }

    const next = serialize(ast.root);
    return { content: next, changed: next !== pageContent };
}

/**
 * Detach (unlink) an instance: marker attributes are removed and the stamped
 * oids are replaced with fresh page-native ones, so future master edits no
 * longer touch the copy.
 */
export function detachInstanceHtml(
    pageRoot: ParentNode,
    instanceId: string,
): boolean {
    for (const el of walkElements(pageRoot as Node)) {
        if (getAttr(el, ATTR_INSTANCE) !== instanceId) continue;
        removeAttr(el, ATTR_COMPONENT);
        removeAttr(el, ATTR_INSTANCE);
        removeAttr(el, ATTR_PROPS);
        const scoped = [el, ...walkElements(el)];
        for (const node of scoped) {
            const oid = getAttr(node, EditorAttributes.DATA_WEBLAB_ID);
            if (oid?.includes('~')) {
                setAttr(node, EditorAttributes.DATA_WEBLAB_ID, createOid());
            }
            removeAttr(node, ATTR_IF);
            removeAttr(node, ATTR_SLOT_CONTENT);
        }
        return true;
    }
    return false;
}

/** Publish-time cleanup: strips all component bookkeeping attributes. */
export function stripComponentMarkers(pageRoot: ParentNode): boolean {
    let changed = false;
    for (const el of walkElements(pageRoot as Node)) {
        for (const name of [ATTR_COMPONENT, ATTR_INSTANCE, ATTR_PROPS, ATTR_IF, ATTR_SLOT_CONTENT]) {
            if (getAttr(el, name) !== null) {
                removeAttr(el, name);
                changed = true;
            }
        }
    }
    return changed;
}

/**
 * "Create component from selection" for HTML pages: serializes the selected
 * element into a master partial (with manifest) and returns both the partial
 * content and the stamped replacement for the page.
 */
export function extractHtmlComponent(params: {
    selectedHtml: string;
    componentKey: string;
    componentName: string;
}): { masterContent: string; instanceId: string; stamped: string } | null {
    const { selectedHtml, componentKey, componentName } = params;
    const fragment = parseFragment(selectedHtml);
    const root = fragment.childNodes.find(isElement);
    if (!root) return null;

    const manifest: Manifest = { name: componentName, props: {} };
    const masterContent = `<script type="application/json" data-weblab-manifest>\n${JSON.stringify(
        manifest,
        null,
        2,
    )}\n</script>\n${selectedHtml.trim()}\n`;

    const instanceId = createOid();
    const stamped = stampInstance(masterContent, {
        componentKey,
        instanceId,
        props: {},
        slots: {},
    });
    if (!stamped) return null;
    return { masterContent, instanceId, stamped };
}
