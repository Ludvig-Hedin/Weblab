'use client';

import { useEffect, useState } from 'react';

import type { DomElement } from '@weblab/models';

import { useEditorEngine } from '@/components/store/editor';

/** How many ancestors to check when the selection sits inside a link or button. */
const MAX_ANCESTOR_DEPTH = 8;

export type LinkTargetState =
    | { status: 'none' }
    | { status: 'loading' }
    | { status: 'found'; element: DomElement };

/** DOM tags the Link tab can act on. */
const LINK_TAGS = new Set(['a', 'button']);

const isLinkTag = (tagName: string) => LINK_TAGS.has(tagName.toLowerCase());

/**
 * Finds the nearest `<a>` or `<button>` at or above the single selected
 * element. The Link tab uses it to decide whether it is enabled and which
 * element it edits.
 *
 * Must be called from an `observer` component so selection changes re-run it.
 */
export function useLinkTarget(): LinkTargetState {
    const editorEngine = useEditorEngine();
    const selectedList = editorEngine.elements.selected;
    const selected = selectedList.length === 1 ? selectedList[0] : undefined;
    const frameView = selected ? editorEngine.frames.get(selected.frameId)?.view : null;
    const [state, setState] = useState<LinkTargetState>({ status: 'none' });

    useEffect(() => {
        if (!selected) {
            setState({ status: 'none' });
            return;
        }
        if (isLinkTag(selected.tagName)) {
            setState({ status: 'found', element: selected });
            return;
        }
        if (!frameView) {
            setState({ status: 'loading' });
            return;
        }
        let cancelled = false;
        setState({ status: 'loading' });
        void (async () => {
            let current: DomElement = selected;
            for (let depth = 0; depth < MAX_ANCESTOR_DEPTH; depth++) {
                let parent: DomElement | null = null;
                try {
                    parent = await frameView.getParentElement(current.domId);
                } catch {
                    parent = null;
                }
                if (cancelled) return;
                if (!parent || parent.tagName === 'body' || parent.tagName === 'html') break;
                if (isLinkTag(parent.tagName)) {
                    setState({ status: 'found', element: parent });
                    return;
                }
                current = parent;
            }
            if (!cancelled) setState({ status: 'none' });
        })();
        return () => {
            cancelled = true;
        };
    }, [selected, frameView]);

    return state;
}
