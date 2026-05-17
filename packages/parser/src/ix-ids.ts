import { customAlphabet } from 'nanoid';

import { EditorAttributes } from '@weblab/constants';
import { VALID_DATA_ATTR_CHARS } from '@weblab/utility';

import type { T } from './packages';
import { isReactFragment } from './helpers';
import { t, traverse } from './packages';

const generateIxIdSuffix = customAlphabet(VALID_DATA_ATTR_CHARS, 7);

export function createIxId(): string {
    return `ix_${generateIxIdSuffix()}`;
}

function generateUniqueIxId(globalIxIds: Set<string>, localIxIds: Set<string>): string {
    let newId: string;
    do {
        newId = createIxId();
    } while (globalIxIds.has(newId) || localIxIds.has(newId));
    return newId;
}

function readIxIdAttr(
    attributes: (T.JSXAttribute | T.JSXSpreadAttribute)[],
): { index: number; value: string | null } | null {
    for (let i = 0; i < attributes.length; i++) {
        const attr = attributes[i];
        if (
            attr &&
            t.isJSXAttribute(attr) &&
            attr.name.name === EditorAttributes.DATA_WEBLAB_IX_ID
        ) {
            const value = attr.value;
            if (value && t.isStringLiteral(value) && value.value.trim().length > 0) {
                return { index: i, value: value.value };
            }
            return { index: i, value: null };
        }
    }
    return null;
}

/**
 * Walk the AST, dedupe `data-wb-ix` collisions. A collision occurs when:
 *  - the same id appears more than once in this file, or
 *  - the same id is already known to exist in another file (globalIxIds).
 *
 * Returns a `rewrites` map of `{oldIxId -> newIxId}` so the caller can update
 * `.weblab/interactions.json` entries that referenced the rewritten id.
 *
 * Missing ix-ids are NOT auto-generated — ix-ids are stamped lazily when the
 * editor wires an element into an interaction. Empty/invalid ix-id attributes
 * are stripped so they don't accumulate.
 */
export function preserveIxIds(
    ast: T.File,
    globalIxIds = new Set<string>(),
): { ast: T.File; modified: boolean; rewrites: Map<string, string> } {
    let modified = false;
    const localIxIds = new Set<string>();
    const rewrites = new Map<string, string>();

    traverse(ast, {
        JSXOpeningElement(path) {
            if (isReactFragment(path.node)) {
                return;
            }

            const attributes = path.node.attributes;
            const found = readIxIdAttr(attributes);
            if (!found) {
                return;
            }

            if (found.value === null) {
                attributes.splice(found.index, 1);
                modified = true;
                return;
            }

            const existing = found.value;
            const collidesLocally = localIxIds.has(existing);
            const collidesGlobally = globalIxIds.has(existing);

            if (collidesLocally || collidesGlobally) {
                const newIxId = generateUniqueIxId(globalIxIds, localIxIds);
                const attr = attributes[found.index] as T.JSXAttribute;
                attr.value = t.stringLiteral(newIxId);
                localIxIds.add(newIxId);
                rewrites.set(existing, newIxId);
                modified = true;
            } else {
                localIxIds.add(existing);
            }
        },
    });

    return { ast, modified, rewrites };
}

export function collectIxIdsFromAst(ast: T.File): Set<string> {
    const ids = new Set<string>();
    traverse(ast, {
        JSXOpeningElement(path) {
            if (isReactFragment(path.node)) {
                return;
            }
            const found = readIxIdAttr(path.node.attributes);
            if (found?.value) {
                ids.add(found.value);
            }
        },
    });
    return ids;
}

/**
 * Walk the AST and return `oid -> ixId` for every element that carries both
 * attributes. Used by the file-system metadata index to know which JSX element
 * owns each ix-id so the editor can look up element location by ix-id alone.
 */
export function getOidToIxIdMap(ast: T.File): Map<string, string> {
    const map = new Map<string, string>();
    traverse(ast, {
        JSXOpeningElement(path) {
            if (isReactFragment(path.node)) {
                return;
            }

            let oidValue: string | null = null;
            let ixIdValue: string | null = null;

            for (const attr of path.node.attributes) {
                if (!t.isJSXAttribute(attr)) continue;
                const name = attr.name.name;
                if (typeof name !== 'string') continue;
                if (!attr.value || !t.isStringLiteral(attr.value)) continue;
                if (name === EditorAttributes.DATA_WEBLAB_ID) {
                    oidValue = attr.value.value;
                } else if (name === EditorAttributes.DATA_WEBLAB_IX_ID) {
                    ixIdValue = attr.value.value;
                }
            }

            if (oidValue && ixIdValue) {
                map.set(oidValue, ixIdValue);
            }
        },
    });
    return map;
}
