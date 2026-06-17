// apps/web/client/src/components/ai-prompt-composer/extensions/file-mention.tsx
'use client';

import Mention from '@tiptap/extension-mention';
import { ReactRenderer } from '@tiptap/react';

import type { MentionListRef } from '../mention-list';
import type { MentionConfig, MentionItem } from '../types';
import { MentionList } from '../mention-list';
import { createSuggestionPopupHandle } from './suggestion-popup-state';

export function buildFileMentionExtension(config: MentionConfig) {
    return Mention.configure({
        HTMLAttributes: {
            class: 'bg-accent text-accent-foreground rounded px-1 py-0.5 text-sm font-medium cursor-default select-none',
        },
        renderText({ node }) {
            return `@${node.attrs.id ?? node.attrs.label ?? ''}`;
        },
        renderHTML({ node }) {
            return ['span', { 'data-mention': '' }, `@${node.attrs.label ?? node.attrs.id ?? ''}`];
        },
        deleteTriggerWithBackspace: true,
        suggestion: {
            items: ({ query }) => config.searchFiles(query).catch(() => []),
            render: () => {
                let component: ReactRenderer<MentionListRef> | undefined;
                let popupEl: HTMLDivElement | undefined;
                const popup = createSuggestionPopupHandle();

                return {
                    onStart(props) {
                        component = new ReactRenderer(MentionList, {
                            editor: props.editor,
                            props: {
                                items: props.items as MentionItem[],
                                command: (item: MentionItem) => {
                                    props.command({ id: item.path, label: item.label });
                                    void config.onMentionSelect(item);
                                },
                            },
                        });

                        popupEl = document.createElement('div');
                        popupEl.className =
                            'bg-background-primary border-border absolute z-[100] min-w-[240px] max-w-sm overflow-hidden rounded-lg border shadow-lg';
                        popupEl.appendChild(component.element);
                        document.body.appendChild(popupEl);
                        popup.show();

                        const rect = props.clientRect?.();
                        if (rect) positionPopup(popupEl, rect);
                    },

                    onUpdate(props) {
                        if (!component || !popupEl) return;
                        popup.show();

                        // Re-show if a prior Escape hid the popup but the user
                        // kept typing in the same suggestion session. Mirrors
                        // the slash-commands extension — destroying the
                        // renderer here stranded the session invisible until
                        // the trigger char was retyped. onExit performs the
                        // real teardown.
                        popupEl.style.display = '';

                        component.updateProps({
                            items: props.items as MentionItem[],
                            command: (item: MentionItem) => {
                                props.command({ id: item.path, label: item.label });
                                void config.onMentionSelect(item);
                            },
                        });

                        const rect = props.clientRect?.();
                        if (rect) positionPopup(popupEl, rect);
                    },

                    onKeyDown(props) {
                        if (!component || !popupEl) return false;
                        if (props.event.key === 'Escape') {
                            // Hide (don't destroy) so the menu can reappear if
                            // the user keeps typing. Real teardown happens in
                            // onExit when the suggestion session ends.
                            popupEl.style.display = 'none';
                            popup.hide();
                            return true;
                        }
                        return component.ref?.onKeyDown({ event: props.event }) ?? false;
                    },

                    onExit() {
                        popupEl?.remove();
                        component?.destroy();
                        popup.hide();
                    },
                };
            },
        },
    });
}

function positionPopup(el: HTMLDivElement, rect: DOMRect) {
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const popupHeight = Math.min(el.offsetHeight || 264, 264);

    if (spaceBelow >= popupHeight || spaceBelow >= spaceAbove) {
        el.style.top = `${rect.bottom + window.scrollY + 4}px`;
    } else {
        el.style.top = `${rect.top + window.scrollY - popupHeight - 4}px`;
    }
    el.style.left = `${Math.max(8, Math.min(rect.left + window.scrollX, window.innerWidth - (el.offsetWidth || 240)))}px`;
    el.style.position = 'absolute';
}
