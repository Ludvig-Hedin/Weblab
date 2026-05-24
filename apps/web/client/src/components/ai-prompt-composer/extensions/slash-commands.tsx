// apps/web/client/src/components/ai-prompt-composer/extensions/slash-commands.tsx
'use client';

import { Extension } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import Suggestion from '@tiptap/suggestion';

import type { SlashListRef } from '../slash-list';
import type { SlashCommand } from '../types';
import { SlashList } from '../slash-list';

export function buildSlashCommandsExtension(commands: SlashCommand[]) {
    return Extension.create({
        name: 'slashCommands',

        addProseMirrorPlugins() {
            return [
                Suggestion({
                    editor: this.editor,
                    char: '/',
                    allowSpaces: false,
                    startOfLine: false,
                    items: ({ query }) => {
                        const q = query.toLowerCase();
                        return commands.filter(
                            (cmd) =>
                                cmd.name.toLowerCase().includes(q) ||
                                cmd.label.toLowerCase().includes(q) ||
                                cmd.keywords?.some((k) => k.toLowerCase().includes(q)),
                        );
                    },
                    render: () => {
                        let component: ReactRenderer<SlashListRef> | undefined;
                        let popupEl: HTMLDivElement | undefined;

                        return {
                            onStart(props) {
                                component = new ReactRenderer(SlashList, {
                                    editor: props.editor,
                                    props: {
                                        items: props.items,
                                        command: (item: SlashCommand) => {
                                            props.command(item);
                                            item.action();
                                        },
                                    },
                                });

                                popupEl = document.createElement('div');
                                popupEl.className =
                                    'bg-background-primary border-border absolute z-[100] min-w-[280px] max-w-sm overflow-hidden rounded-lg border shadow-lg';
                                popupEl.appendChild(component.element);
                                document.body.appendChild(popupEl);

                                const rect = props.clientRect?.();
                                if (rect) positionPopup(popupEl, rect);
                            },

                            onUpdate(props) {
                                if (!component || !popupEl) return;

                                component.updateProps({
                                    items: props.items,
                                    command: (item: SlashCommand) => {
                                        props.command(item);
                                        item.action();
                                    },
                                });

                                const rect = props.clientRect?.();
                                if (rect) positionPopup(popupEl, rect);
                            },

                            onKeyDown(props) {
                                if (!component || !popupEl) return false;
                                if (props.event.key === 'Escape') {
                                    popupEl.remove();
                                    component.destroy();
                                    popupEl = undefined;
                                    component = undefined;
                                    return true;
                                }
                                return component.ref?.onKeyDown({ event: props.event }) ?? false;
                            },

                            onExit() {
                                popupEl?.remove();
                                component?.destroy();
                            },
                        };
                    },
                }),
            ];
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
    el.style.left = `${Math.max(8, Math.min(rect.left + window.scrollX, window.innerWidth - (el.offsetWidth || 280)))}px`;
    el.style.position = 'absolute';
}
