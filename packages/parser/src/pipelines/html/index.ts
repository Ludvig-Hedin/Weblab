import type { DefaultTreeAdapterMap } from 'parse5';
import { parse, parseFragment, serialize } from 'parse5';

import type { TemplateNode } from '@weblab/models';
import type { CodeAction } from '@weblab/models/actions';
import type { CodeDiffRequest } from '@weblab/models/code';
import { EditorAttributes } from '@weblab/constants';
import { CoreElementType } from '@weblab/models';
import { CodeActionType } from '@weblab/models/actions';
import { createOid } from '@weblab/utility';

import type { EditorPipeline, OidInjectionResult } from '../types';

type Document = DefaultTreeAdapterMap['document'];
type DocumentFragment = DefaultTreeAdapterMap['documentFragment'];
type Element = DefaultTreeAdapterMap['element'];
type ChildNode = DefaultTreeAdapterMap['childNode'];
type ParentNode = DefaultTreeAdapterMap['parentNode'];
type Node = DefaultTreeAdapterMap['node'];
type TextNode = DefaultTreeAdapterMap['textNode'];

/**
 * The AST passed across the HTML pipeline. We accept either a full
 * document or a fragment so that `.astro` template bodies (Phase 6) can
 * reuse this pipeline without forging a `<!doctype>` wrapper.
 */
export interface HtmlAst {
    /** True for `parse(content)`, false for `parseFragment(content)`. */
    isDocument: boolean;
    root: Document | DocumentFragment;
}

function isElement(node: Node): node is Element {
    return 'tagName' in node && Array.isArray((node as Element).attrs);
}

function getChildren(node: Node): Node[] {
    if ('childNodes' in node && Array.isArray((node as ParentNode).childNodes)) {
        return (node as ParentNode).childNodes;
    }
    return [];
}

/**
 * Walks every element in document order. Used for both OID injection and
 * template-node map construction. Elements without a parent (the implicit
 * `<html>` for fragments) are skipped — they aren't user-editable.
 */
function* walkElements(root: Node): Generator<Element> {
    for (const child of getChildren(root)) {
        if (isElement(child)) {
            yield child;
            yield* walkElements(child);
        } else if ('childNodes' in child) {
            yield* walkElements(child);
        }
    }
}

function getAttribute(element: Element, name: string): string | null {
    const attr = element.attrs.find((a) => a.name === name);
    return attr ? attr.value : null;
}

function setAttribute(element: Element, name: string, value: string): void {
    const attr = element.attrs.find((a) => a.name === name);
    if (attr) {
        attr.value = value;
    } else {
        element.attrs.push({ name, value });
    }
}

function removeAttribute(element: Element, name: string): void {
    element.attrs = element.attrs.filter((a) => a.name !== name);
}

/**
 * Tags whose contents are not real DOM elements (raw text containers,
 * metadata, control flow). Skipping them avoids decorating script/style
 * source positions and keeps the editor's element tree focused on what's
 * visible/editable.
 */
const SKIP_TAGS = new Set(['script', 'style', 'template', 'noscript']);

function shouldSkipElement(element: Element): boolean {
    return SKIP_TAGS.has(element.tagName.toLowerCase());
}

function generateUniqueOid(globalOids: Set<string>, localOids: Set<string>): string {
    let next: string;
    do {
        next = createOid();
    } while (globalOids.has(next) || localOids.has(next));
    return next;
}

/**
 * Merges class tokens preserving order, dedupes, and ignores empties.
 * HTML uses space-separated raw tokens, no JSX expression containers, so
 * this is much simpler than the JSX `addClassToNode` Tailwind merger but
 * structurally serves the same role.
 */
function mergeClassTokens(existing: string, addition: string): string {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const token of `${existing} ${addition}`.split(/\s+/)) {
        if (!token) continue;
        if (seen.has(token)) continue;
        seen.add(token);
        out.push(token);
    }
    return out.join(' ');
}

/**
 * Replaces an element's text content. For HTML we simplify: drop all
 * existing children, insert one text node. This matches the JSX equivalent
 * which replaces JSX children with a single string literal.
 */
function setElementText(element: Element, text: string): void {
    const textChild: TextNode = {
        nodeName: '#text',
        value: text,
        parentNode: element,
    };
    element.childNodes = [textChild];
}

/**
 * Find an element by its data-oid anywhere in the tree. Used by structural
 * edits, which receive an oid and need to locate the corresponding parse5
 * node. Returns null if the oid isn't present (e.g. references a node that
 * was removed by an earlier edit in the same batch).
 */
function findElementByOid(root: Node, oid: string): Element | null {
    for (const el of walkElements(root)) {
        if (getAttribute(el, EditorAttributes.DATA_WEBLAB_ID) === oid) return el;
    }
    return null;
}

/**
 * Build a fresh element node with the given tag, attributes, and inline
 * text. Used by structural INSERT to materialize new DOM nodes from
 * editor actions. The new element is given a fresh oid so subsequent
 * edits can reference it.
 */
function buildElement(
    parent: Element,
    tagName: string,
    attributes: Record<string, string>,
    textContent: string | null,
    oid: string,
): Element {
    const el: Element = {
        nodeName: tagName.toLowerCase(),
        tagName: tagName.toLowerCase(),
        attrs: [
            ...Object.entries(attributes).map(([name, value]) => ({ name, value })),
            { name: EditorAttributes.DATA_WEBLAB_ID, value: oid },
        ],
        namespaceURI: 'http://www.w3.org/1999/xhtml',
        childNodes: [],
        parentNode: parent,
    } as Element;
    if (textContent != null && textContent !== '') {
        el.childNodes.push({
            nodeName: '#text',
            value: textContent,
            parentNode: el,
        } as TextNode);
    }
    return el;
}

/**
 * Insert a child node into a parent at a position derived from the
 * action's location ("prepend" / "append" / specific index).
 */
function insertChildAt(
    parent: Element,
    child: ChildNode,
    location: { type: string; index?: number },
): void {
    child.parentNode = parent;
    if (location.type === 'prepend') {
        parent.childNodes.unshift(child);
    } else if (location.type === 'index' && typeof location.index === 'number') {
        const idx = Math.max(0, Math.min(location.index, parent.childNodes.length));
        parent.childNodes.splice(idx, 0, child);
    } else {
        // Default + 'append'
        parent.childNodes.push(child);
    }
}

/**
 * Remove a child node from its parent in place. No-op if the child has no
 * parent (already detached).
 */
function detach(node: ChildNode): void {
    const parent = node.parentNode;
    if (!parent || !('childNodes' in parent)) return;
    const idx = parent.childNodes.indexOf(node);
    if (idx >= 0) parent.childNodes.splice(idx, 1);
}

/**
 * Apply a structural edit to the document. Mirrors the JSX-side logic in
 * `code-edit/transform.ts > applyStructureChanges`. Implements INSERT,
 * REMOVE, and MOVE today; GROUP/UNGROUP/IMAGE ops fall back to a console
 * warning until ported.
 */
function applyStructureChange(rootAst: HtmlAst, action: CodeAction): void {
    const root = rootAst.root as unknown as Node;
    switch (action.type) {
        case CodeActionType.INSERT: {
            const targetOid = action.location.targetOid;
            if (!targetOid) return;
            const parent = findElementByOid(root, targetOid);
            if (!parent) return;
            const newEl = buildElement(
                parent,
                action.tagName,
                action.attributes ?? {},
                action.textContent,
                action.oid,
            );
            insertChildAt(parent, newEl, action.location);
            return;
        }
        case CodeActionType.REMOVE: {
            const target = findElementByOid(root, action.oid);
            if (target) detach(target);
            return;
        }
        case CodeActionType.MOVE: {
            const target = findElementByOid(root, action.oid);
            if (!target) return;
            const newParentOid = action.location.targetOid;
            if (!newParentOid) return;
            const newParent = findElementByOid(root, newParentOid);
            if (!newParent) return;
            detach(target);
            insertChildAt(newParent, target, action.location);
            return;
        }
        case CodeActionType.GROUP:
        case CodeActionType.UNGROUP:
        case CodeActionType.INSERT_IMAGE:
        case CodeActionType.REMOVE_IMAGE:
            // Image and group operations require richer logic (asset
            // pipeline, multi-element wrap/unwrap). Tracked as follow-up;
            // editor surfaces a "not yet supported" toast for these on
            // HTML projects.
            console.warn(`[html-pipeline] structural action '${action.type}' not yet implemented`);
            return;
        default: {
            // Exhaustiveness guard — TypeScript would catch a new
            // CodeActionType variant at compile time.
            const _exhaustive: never = action;
            void _exhaustive;
            return;
        }
    }
}

/**
 * HTML editor pipeline. Phase 4 deliverable. Uses parse5 (the same parser
 * powering jsdom and Angular) for source-locating, OID-stamped editing of
 * `.html` files. Designed so the static-html adapter and the Astro adapter
 * (template body, not frontmatter) can both plug in.
 */
export const htmlPipeline: EditorPipeline<HtmlAst> = {
    id: 'html',
    fileMatcher: /\.html?$/i,

    parse(content): HtmlAst | null {
        try {
            // Heuristic: full doctype/html → document; otherwise treat as
            // fragment. Static sites typically have a doctype; `.astro`
            // template bodies typically don't.
            const looksLikeDocument = /^\s*(<!doctype\s+html|<html[\s>])/i.test(content);
            if (looksLikeDocument) {
                return {
                    isDocument: true,
                    root: parse(content, { sourceCodeLocationInfo: true }),
                };
            }
            return {
                isDocument: false,
                root: parseFragment(content, { sourceCodeLocationInfo: true }),
            };
        } catch (e) {
            console.error('html parse failed', e);
            return null;
        }
    },

    injectOids(ast, options): OidInjectionResult<HtmlAst> {
        const globalOids = options?.globalOids ?? new Set<string>();
        const localOids = new Set<string>();
        let modified = false;

        for (const element of walkElements(ast.root)) {
            if (shouldSkipElement(element)) continue;

            const existing = getAttribute(element, EditorAttributes.DATA_WEBLAB_ID);
            if (existing && !localOids.has(existing) && !globalOids.has(existing)) {
                localOids.add(existing);
                continue;
            }
            const newOid = generateUniqueOid(globalOids, localOids);
            setAttribute(element, EditorAttributes.DATA_WEBLAB_ID, newOid);
            localOids.add(newOid);
            modified = true;
        }

        return { ast, modified };
    },

    buildTemplateNodeMap({ ast, filename, branchId }): Map<string, TemplateNode> {
        const map = new Map<string, TemplateNode>();
        for (const element of walkElements(ast.root)) {
            if (shouldSkipElement(element)) continue;
            const oid = getAttribute(element, EditorAttributes.DATA_WEBLAB_ID);
            if (!oid) continue;

            const loc = element.sourceCodeLocation;
            if (!loc) continue;

            // parse5 reports positions as { startLine, startCol, endLine, endCol, startTag?, endTag? }
            const startTag = loc.startTag ?? loc;
            const endTag = loc.endTag ?? null;

            const node: TemplateNode = {
                path: filename,
                branchId,
                startTag: {
                    start: { line: startTag.startLine, column: startTag.startCol },
                    end: { line: startTag.endLine, column: startTag.endCol },
                },
                endTag: endTag
                    ? {
                          start: { line: endTag.startLine, column: endTag.startCol },
                          end: { line: endTag.endLine, column: endTag.endCol },
                      }
                    : null,
                component: null,
                dynamicType: null,
                coreElementType: htmlTagToCoreElementType(element.tagName),
            };
            map.set(oid, node);
        }
        return map;
    },

    applyEdits(ast, edits: Map<string, CodeDiffRequest>) {
        const pendingStructuralChanges: CodeAction[] = [];

        for (const element of walkElements(ast.root)) {
            const oid = getAttribute(element, EditorAttributes.DATA_WEBLAB_ID);
            if (!oid) continue;
            const diff = edits.get(oid);
            if (!diff) continue;

            const { attributes, tagName, textContent, overrideClasses, structureChanges } = diff;

            if (tagName) {
                element.tagName = tagName.toLowerCase();
                element.nodeName = element.tagName;
            }

            if (attributes) {
                for (const [key, raw] of Object.entries(attributes)) {
                    const value = raw == null ? '' : String(raw);
                    // JSX uses `className`; HTML uses `class`. Translate
                    // transparently so callers pass the same diff shape.
                    if (key === 'className' || key === 'class') {
                        if (overrideClasses) {
                            if (value === '') {
                                removeAttribute(element, 'class');
                            } else {
                                setAttribute(element, 'class', value);
                            }
                        } else {
                            const existing = getAttribute(element, 'class') ?? '';
                            setAttribute(element, 'class', mergeClassTokens(existing, value));
                        }
                    } else if (value === '') {
                        removeAttribute(element, key);
                    } else {
                        setAttribute(element, key, value);
                    }
                }
            }

            if (textContent !== undefined && textContent !== null) {
                setElementText(element, textContent);
            }

            if (structureChanges && structureChanges.length > 0) {
                pendingStructuralChanges.push(...structureChanges);
            }
        }

        for (const action of pendingStructuralChanges) {
            applyStructureChange(ast, action);
        }
    },

    generate(ast): string {
        return serialize(ast.root);
    },
};

/**
 * Maps HTML tag names to Onlook's `CoreElementType` enum so the editor's
 * existing UI affordances (button-vs-text-vs-image insertion menus) work
 * for HTML projects. Tags not in this list resolve to null and are treated
 * as generic containers.
 */
function htmlTagToCoreElementType(tagName: string): CoreElementType | null {
    switch (tagName.toLowerCase()) {
        case 'body':
            return CoreElementType.BODY_TAG;
        case 'div':
        case 'section':
        case 'article':
        case 'header':
        case 'footer':
        case 'main':
        case 'nav':
        case 'aside':
            return CoreElementType.COMPONENT_ROOT;
        default:
            return null;
    }
}
