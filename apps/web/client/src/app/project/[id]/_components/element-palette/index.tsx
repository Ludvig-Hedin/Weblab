'use client';

import { observer } from 'mobx-react-lite';

import { InsertMode } from '@weblab/models';
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandShortcut,
} from '@weblab/ui/command';
import { Icons } from '@weblab/ui/icons';

import { useEditorEngine } from '@/components/store/editor';

interface PaletteItem {
    group: string;
    mode: InsertMode;
    label: string;
    icon: keyof typeof Icons;
    shortcut?: string;
    keywords: string[];
}

export const ELEMENT_PALETTE_ITEMS: PaletteItem[] = [
    {
        group: 'Layout',
        mode: InsertMode.INSERT_DIV,
        label: 'Div',
        icon: 'Square',
        shortcut: 'F',
        keywords: ['box', 'container', 'block', 'frame'],
    },
    {
        group: 'Layout',
        mode: InsertMode.INSERT_FLEX_DIV,
        label: 'Flex Div',
        icon: 'BoxModel',
        shortcut: '⇧F',
        keywords: ['row', 'column', 'flexbox', 'stack'],
    },
    {
        group: 'Basic',
        mode: InsertMode.INSERT_TEXT,
        label: 'Text',
        icon: 'Text',
        shortcut: 'T',
        keywords: ['paragraph', 'copy', 'p'],
    },
    {
        group: 'Basic',
        mode: InsertMode.INSERT_HEADING,
        label: 'Heading',
        icon: 'H1',
        keywords: ['h1', 'h2', 'title', 'header'],
    },
    {
        group: 'Basic',
        mode: InsertMode.INSERT_BUTTON,
        label: 'Button',
        icon: 'Button',
        shortcut: 'B',
        keywords: ['cta', 'action', 'submit'],
    },
    {
        group: 'Basic',
        mode: InsertMode.INSERT_LINK,
        label: 'Link',
        icon: 'Link',
        keywords: ['a', 'anchor', 'href', 'url'],
    },
    {
        group: 'Form',
        mode: InsertMode.INSERT_INPUT,
        label: 'Input',
        icon: 'Input',
        keywords: ['field', 'form', 'textbox', 'text input'],
    },
    {
        group: 'Media',
        mode: InsertMode.INSERT_IMAGE,
        label: 'Image',
        icon: 'Image',
        keywords: ['picture', 'photo', 'asset', 'img'],
    },
];

const GROUPS = ['Layout', 'Basic', 'Form', 'Media'] as const;

export const ElementPalette = observer(() => {
    const editorEngine = useEditorEngine();
    const open = editorEngine.state.elementPaletteOpen;

    const close = () => editorEngine.state.setElementPaletteOpen(false);

    const choose = (mode: InsertMode) => {
        editorEngine.state.setInsertMode(mode);
        close();
    };

    return (
        <CommandDialog
            open={open}
            onOpenChange={(o) => editorEngine.state.setElementPaletteOpen(o)}
            title="Add element"
            description="Search for an element to add to the canvas, then click or drag to place it."
        >
            <CommandInput placeholder="Add an element…" autoFocus />
            <CommandList>
                <CommandEmpty>No elements found.</CommandEmpty>
                {GROUPS.map((groupName) => {
                    const items = ELEMENT_PALETTE_ITEMS.filter((i) => i.group === groupName);
                    if (items.length === 0) return null;
                    return (
                        <CommandGroup key={groupName} heading={groupName}>
                            {items.map((item) => {
                                const Icon = Icons[item.icon];
                                return (
                                    <CommandItem
                                        key={item.mode}
                                        value={`${item.label} ${item.keywords.join(' ')}`}
                                        onSelect={() => choose(item.mode)}
                                    >
                                        {Icon ? <Icon /> : null}
                                        <span>{item.label}</span>
                                        {item.shortcut ? (
                                            <CommandShortcut>{item.shortcut}</CommandShortcut>
                                        ) : null}
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    );
                })}
            </CommandList>
        </CommandDialog>
    );
});
