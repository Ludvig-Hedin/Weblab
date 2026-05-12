'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Icons } from '@weblab/ui/icons';
import { NodeIcon } from '@weblab/ui/node-icon';
import { cn } from '@weblab/ui/utils';

import { DesignMockup, DesignMockupMobile } from './design-mockup/design-mockup';

type TabId =
    | 'insert'
    | 'components'
    | 'layers'
    | 'search'
    | 'brand'
    | 'pages'
    | 'images'
    | 'branches';
type ModeId = 'design' | 'code' | 'preview';
type RightTabId = 'style' | 'chat' | 'comments';
type PreviewTheme = 'light' | 'dark';

const MODES: { id: ModeId; label: string }[] = [
    { id: 'design', label: 'Design' },
    { id: 'code', label: 'Code' },
    { id: 'preview', label: 'Preview' },
];

function ModeToggle({
    activeMode,
    onChange,
}: {
    activeMode: ModeId;
    onChange: (m: ModeId) => void;
}) {
    const activeIndex = MODES.findIndex((m) => m.id === activeMode);
    return (
        <div className="flex justify-center">
            <div className="relative">
                <div className="flex h-6 items-center font-normal">
                    {MODES.map((m) => (
                        <button
                            key={m.id}
                            type="button"
                            onClick={() => onChange(m.id)}
                            className={cn(
                                'cursor-pointer bg-transparent px-3 py-1 text-[12px] whitespace-nowrap transition-colors duration-150 ease-in-out',
                                m.id === activeMode
                                    ? 'text-foreground-primary'
                                    : 'text-foreground-secondary hover:text-foreground-primary',
                            )}
                        >
                            {m.label}
                        </button>
                    ))}
                </div>
                <div
                    className="bg-foreground absolute -top-1 h-0.5 transition-all duration-200 ease-out"
                    style={{
                        width: `${100 / MODES.length}%`,
                        left: `${(activeIndex * 100) / MODES.length}%`,
                    }}
                />
            </div>
        </div>
    );
}

const TAB_DEFS: { id: TabId; label: string; icon: keyof typeof Icons }[] = [
    { id: 'insert', label: 'Insert', icon: 'Plus' },
    { id: 'components', label: 'Components', icon: 'Component' },
    { id: 'layers', label: 'Layers', icon: 'Layers' },
    { id: 'search', label: 'Search', icon: 'MagnifyingGlass' },
    { id: 'brand', label: 'Brand', icon: 'Brand' },
    { id: 'pages', label: 'Pages', icon: 'File' },
    { id: 'images', label: 'Images', icon: 'Image' },
    { id: 'branches', label: 'Branches', icon: 'Branch' },
];

const RIGHT_TABS: { id: RightTabId; label: string; icon: keyof typeof Icons }[] = [
    { id: 'style', label: 'Styles', icon: 'Layout' },
    { id: 'chat', label: 'Chat', icon: 'Sparkles' },
    { id: 'comments', label: 'Comments', icon: 'ChatBubble' },
];

const BRANCHES = [
    { id: 'main', name: 'main', active: true, ahead: 0, behind: 0 },
    { id: 'pricing', name: 'feature/pricing', active: false, ahead: 2, behind: 0 },
    { id: 'cms', name: 'feature/cms', active: false, ahead: 0, behind: 3 },
];

const PRESET_SENTENCE = 'Add a pricing section with 3 tiers';

type ChatStep =
    | { kind: 'user'; text: string }
    | { kind: 'reasoning'; text: string }
    | { kind: 'tool'; tool: 'create_file' | 'edit_file'; file: string; detail: string }
    | { kind: 'ai'; text: string };

const CHAT_SCRIPT: ChatStep[] = [
    { kind: 'user', text: PRESET_SENTENCE },
    { kind: 'reasoning', text: "I'll create a Pricing component and add it to the homepage." },
    { kind: 'tool', tool: 'create_file', file: 'Pricing.tsx', detail: 'new file' },
    { kind: 'tool', tool: 'edit_file', file: 'Home.tsx', detail: '1 edit' },
    {
        kind: 'ai',
        text: 'Done. Added a Pricing section with Starter, Pro, and Enterprise tiers below the hero.',
    },
];

const STEP_DELAYS_MS = [600, 1700, 2900, 4100, 5300];
const LOOP_RESTART_MS = 13_000;

interface MockLayer {
    id: string;
    name: string;
    tagName: string;
    level: number;
    isInstance: boolean;
}

const INITIAL_LAYERS: MockLayer[] = [
    { id: 'root', name: 'Home Page', tagName: 'DIV', level: 0, isInstance: false },
    { id: 'nav', name: 'Top Navigation', tagName: 'COMPONENT', level: 1, isInstance: false },
    { id: 'hero', name: 'Hero', tagName: 'COMPONENT', level: 1, isInstance: false },
    { id: 'grid', name: 'Image Grid', tagName: 'DIV', level: 1, isInstance: false },
    { id: 'card-1', name: 'Image Card 1', tagName: 'COMPONENT', level: 2, isInstance: false },
    { id: 'card-2', name: 'Image Card 2', tagName: 'COMPONENT', level: 2, isInstance: false },
    { id: 'card-3', name: 'Image Card 3', tagName: 'COMPONENT', level: 2, isInstance: false },
    { id: 'card-4', name: 'Image Card 4', tagName: 'COMPONENT', level: 2, isInstance: false },
    { id: 'card-5', name: 'Image Card 5', tagName: 'COMPONENT', level: 2, isInstance: false },
    { id: 'card-6', name: 'Image Card 6', tagName: 'COMPONENT', level: 2, isInstance: false },
    { id: 'footer', name: 'Footer', tagName: 'COMPONENT', level: 1, isInstance: false },
];

const PAGES = [
    { id: 'home', name: 'Home', active: true },
    { id: 'about', name: 'About', active: false },
    { id: 'pricing', name: 'Pricing', active: false, badge: 'new' as const },
];

const COMPONENT_CHIPS = ['Button', 'Card', 'Hero', 'Nav', 'Pricing', 'Footer'];

const RESTYLE_COLORS = [
    { id: 'teal', className: 'border-teal-300', swatch: 'bg-teal-300' },
    { id: 'brand', className: 'border-foreground-brand', swatch: 'bg-foreground-brand' },
    { id: 'amber', className: 'border-amber-400', swatch: 'bg-amber-400' },
] as const;

type CodeToken = { t: string; c: string };
type CodeLine = { tokens: CodeToken[] };

const CODE_FILES: Record<string, CodeLine[]> = {
    'Hero.tsx': [
        {
            tokens: [
                { t: 'export default function ', c: 'kw' },
                { t: 'Hero', c: 'fn' },
                { t: '() {', c: 'p' },
            ],
        },
        {
            tokens: [
                { t: '  return ', c: 'kw' },
                { t: '(', c: 'p' },
            ],
        },
        {
            tokens: [
                { t: '    <', c: 'p' },
                { t: 'section', c: 'tag' },
                { t: ' className=', c: 'attr' },
                { t: '"py-32"', c: 'str' },
                { t: '>', c: 'p' },
            ],
        },
        {
            tokens: [
                { t: '      <', c: 'p' },
                { t: 'h1', c: 'tag' },
                { t: ' className=', c: 'attr' },
                { t: '"text-6xl font-light"', c: 'str' },
                { t: '>', c: 'p' },
            ],
        },
        { tokens: [{ t: '        AI visual website builder', c: 'text' }] },
        {
            tokens: [
                { t: '      </', c: 'p' },
                { t: 'h1', c: 'tag' },
                { t: '>', c: 'p' },
            ],
        },
        {
            tokens: [
                { t: '      <', c: 'p' },
                { t: 'Pricing', c: 'comp' },
                { t: ' tiers=', c: 'attr' },
                { t: '{', c: 'p' },
                { t: '3', c: 'num' },
                { t: '} />', c: 'p' },
            ],
        },
        {
            tokens: [
                { t: '    </', c: 'p' },
                { t: 'section', c: 'tag' },
                { t: '>', c: 'p' },
            ],
        },
        { tokens: [{ t: '  )', c: 'p' }] },
        { tokens: [{ t: '}', c: 'p' }] },
    ],
    'Pricing.tsx': [
        {
            tokens: [
                { t: 'export function ', c: 'kw' },
                { t: 'Pricing', c: 'fn' },
                { t: '({ ', c: 'p' },
                { t: 'tiers', c: 'attr' },
                { t: ' }: { ', c: 'p' },
                { t: 'tiers', c: 'attr' },
                { t: ': ', c: 'p' },
                { t: 'number', c: 'kw' },
                { t: ' }) {', c: 'p' },
            ],
        },
        {
            tokens: [
                { t: '  return ', c: 'kw' },
                { t: '(', c: 'p' },
            ],
        },
        {
            tokens: [
                { t: '    <', c: 'p' },
                { t: 'section', c: 'tag' },
                { t: ' className=', c: 'attr' },
                { t: '"grid grid-cols-3 gap-6"', c: 'str' },
                { t: '>', c: 'p' },
            ],
        },
        {
            tokens: [
                { t: '      {[', c: 'p' },
                { t: "'Starter'", c: 'str' },
                { t: ', ', c: 'p' },
                { t: "'Pro'", c: 'str' },
                { t: ', ', c: 'p' },
                { t: "'Enterprise'", c: 'str' },
                { t: '].map((name) => (', c: 'p' },
            ],
        },
        {
            tokens: [
                { t: '        <', c: 'p' },
                { t: 'Card', c: 'comp' },
                { t: ' key=', c: 'attr' },
                { t: '{name}', c: 'p' },
                { t: ' tier=', c: 'attr' },
                { t: '{name}', c: 'p' },
                { t: ' />', c: 'p' },
            ],
        },
        { tokens: [{ t: '      ))}', c: 'p' }] },
        {
            tokens: [
                { t: '    </', c: 'p' },
                { t: 'section', c: 'tag' },
                { t: '>', c: 'p' },
            ],
        },
        { tokens: [{ t: '  )', c: 'p' }] },
        { tokens: [{ t: '}', c: 'p' }] },
    ],
    'Home.tsx': [
        {
            tokens: [
                { t: 'import ', c: 'kw' },
                { t: 'Hero', c: 'comp' },
                { t: ' from ', c: 'kw' },
                { t: "'./Hero'", c: 'str' },
            ],
        },
        {
            tokens: [
                { t: 'import ', c: 'kw' },
                { t: 'Pricing', c: 'comp' },
                { t: ' from ', c: 'kw' },
                { t: "'./Pricing'", c: 'str' },
            ],
        },
        { tokens: [{ t: '', c: 'p' }] },
        {
            tokens: [
                { t: 'export default function ', c: 'kw' },
                { t: 'Home', c: 'fn' },
                { t: '() {', c: 'p' },
            ],
        },
        {
            tokens: [
                { t: '  return ', c: 'kw' },
                { t: '(', c: 'p' },
            ],
        },
        { tokens: [{ t: '    <>', c: 'p' }] },
        {
            tokens: [
                { t: '      <', c: 'p' },
                { t: 'Hero', c: 'comp' },
                { t: ' />', c: 'p' },
            ],
        },
        {
            tokens: [
                { t: '      <', c: 'p' },
                { t: 'Pricing', c: 'comp' },
                { t: ' tiers=', c: 'attr' },
                { t: '{', c: 'p' },
                { t: '3', c: 'num' },
                { t: '} />', c: 'p' },
            ],
        },
        { tokens: [{ t: '    </>', c: 'p' }] },
        { tokens: [{ t: '  )', c: 'p' }] },
        { tokens: [{ t: '}', c: 'p' }] },
    ],
    'page.tsx': [
        {
            tokens: [
                { t: 'import ', c: 'kw' },
                { t: 'Home', c: 'comp' },
                { t: ' from ', c: 'kw' },
                { t: "'@/components/Home'", c: 'str' },
            ],
        },
        { tokens: [{ t: '', c: 'p' }] },
        {
            tokens: [
                { t: 'export default function ', c: 'kw' },
                { t: 'Page', c: 'fn' },
                { t: '() {', c: 'p' },
            ],
        },
        {
            tokens: [
                { t: '  return ', c: 'kw' },
                { t: '<', c: 'p' },
                { t: 'Home', c: 'comp' },
                { t: ' />', c: 'p' },
            ],
        },
        { tokens: [{ t: '}', c: 'p' }] },
    ],
    'layout.tsx': [
        {
            tokens: [
                { t: 'export default function ', c: 'kw' },
                { t: 'Layout', c: 'fn' },
                { t: '({ ', c: 'p' },
                { t: 'children', c: 'attr' },
                { t: ' }) {', c: 'p' },
            ],
        },
        {
            tokens: [
                { t: '  return ', c: 'kw' },
                { t: '<', c: 'p' },
                { t: 'html', c: 'tag' },
                { t: '>', c: 'p' },
                { t: '{children}', c: 'p' },
                { t: '</', c: 'p' },
                { t: 'html', c: 'tag' },
                { t: '>', c: 'p' },
            ],
        },
        { tokens: [{ t: '}', c: 'p' }] },
    ],
    'Footer.tsx': [
        {
            tokens: [
                { t: 'export function ', c: 'kw' },
                { t: 'Footer', c: 'fn' },
                { t: '() {', c: 'p' },
            ],
        },
        {
            tokens: [
                { t: '  return ', c: 'kw' },
                { t: '<', c: 'p' },
                { t: 'footer', c: 'tag' },
                { t: '>© 2026 Villainterest</', c: 'text' },
                { t: 'footer', c: 'tag' },
                { t: '>', c: 'p' },
            ],
        },
        { tokens: [{ t: '}', c: 'p' }] },
    ],
};
type CodeFileName = keyof typeof CODE_FILES;
const FILE_TREE: {
    name: string;
    indent: number;
    isDir?: boolean;
    file?: CodeFileName;
    badge?: string;
}[] = [
    { name: 'app/', indent: 0, isDir: true },
    { name: 'page.tsx', indent: 1, file: 'page.tsx' },
    { name: 'layout.tsx', indent: 1, file: 'layout.tsx' },
    { name: 'components/', indent: 0, isDir: true },
    { name: 'Hero.tsx', indent: 1, file: 'Hero.tsx' },
    { name: 'Pricing.tsx', indent: 1, file: 'Pricing.tsx', badge: 'new' },
    { name: 'Home.tsx', indent: 1, file: 'Home.tsx' },
    { name: 'Footer.tsx', indent: 1, file: 'Footer.tsx' },
];

const TOKEN_COLOR: Record<string, string> = {
    kw: 'text-purple-700 dark:text-purple-300',
    fn: 'text-amber-700 dark:text-amber-200',
    tag: 'text-rose-700 dark:text-rose-300',
    attr: 'text-foreground-secondary',
    str: 'text-emerald-700 dark:text-emerald-300',
    text: 'text-foreground',
    comp: 'text-sky-700 dark:text-sky-300',
    num: 'text-amber-700 dark:text-amber-300',
    p: 'text-foreground-tertiary',
};

function CodeModePanel() {
    const [activeFile, setActiveFile] = useState<CodeFileName>('Hero.tsx');
    const [openTabs, setOpenTabs] = useState<CodeFileName[]>(['Hero.tsx', 'Pricing.tsx']);
    const [dirtyFiles, setDirtyFiles] = useState<Set<CodeFileName>>(new Set(['Hero.tsx']));
    const [selectedLine, setSelectedLine] = useState<number | null>(null);

    const openFile = (file: CodeFileName) => {
        setActiveFile(file);
        setOpenTabs((tabs) => (tabs.includes(file) ? tabs : [...tabs, file]));
    };
    const closeTab = (file: CodeFileName, e: React.MouseEvent | React.KeyboardEvent) => {
        e.stopPropagation();
        setOpenTabs((tabs) => {
            const next = tabs.filter((t) => t !== file);
            if (file === activeFile && next[0]) setActiveFile(next[0]);
            return next;
        });
        setDirtyFiles((d) => {
            const next = new Set(d);
            next.delete(file);
            return next;
        });
    };

    const lines = CODE_FILES[activeFile] ?? [];

    return (
        <div className="bg-background-canvas absolute inset-0 top-11 z-[5] flex">
            {/* Explorer */}
            <div className="border-border-bar bg-background-bar/80 flex w-48 flex-col gap-0.5 border-r p-2 text-[11px]">
                <div className="text-foreground-tertiary mb-1 px-1 text-[10px] tracking-wider uppercase">
                    Explorer
                </div>
                {FILE_TREE.map((f) => {
                    const isActive = f.file === activeFile;
                    return (
                        <button
                            key={f.name + f.indent}
                            type="button"
                            disabled={f.isDir}
                            onClick={() => f.file && openFile(f.file)}
                            className={cn(
                                'flex items-center gap-1.5 rounded px-1.5 py-0.5 text-left',
                                isActive
                                    ? 'bg-background-bar-active text-foreground'
                                    : 'text-foreground-secondary hover:bg-background-secondary',
                                f.isDir && 'cursor-default font-medium',
                            )}
                            style={{ paddingLeft: `${6 + f.indent * 10}px` }}
                        >
                            {f.isDir ? (
                                <Icons.ChevronDown className="h-3 w-3 shrink-0" />
                            ) : (
                                <Icons.File className="h-3 w-3 shrink-0" />
                            )}
                            <span className="truncate font-mono">{f.name}</span>
                            {f.badge && (
                                <span className="bg-foreground-brand/20 text-foreground-brand ml-auto rounded-sm px-1 text-[9px] font-medium uppercase">
                                    {f.badge}
                                </span>
                            )}
                            {f.file && dirtyFiles.has(f.file) && !f.badge && (
                                <span className="bg-foreground-secondary ml-auto h-1.5 w-1.5 rounded-full" />
                            )}
                        </button>
                    );
                })}
            </div>
            {/* Editor with file tabs */}
            <div className="bg-background-canvas flex flex-1 flex-col">
                <div className="border-border-bar bg-background-chrome flex h-8 items-center border-b text-[11px]">
                    {openTabs.map((tab) => {
                        const isActive = tab === activeFile;
                        const isDirty = dirtyFiles.has(tab);
                        return (
                            <div
                                key={tab}
                                role="tab"
                                tabIndex={0}
                                aria-selected={isActive}
                                onClick={() => setActiveFile(tab)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setActiveFile(tab);
                                    }
                                }}
                                className={cn(
                                    'border-border-bar group flex h-full cursor-pointer items-center gap-1.5 border-r px-3 outline-none',
                                    isActive
                                        ? 'bg-background-canvas text-foreground'
                                        : 'text-foreground-secondary hover:bg-background-secondary/60 hover:text-foreground',
                                )}
                            >
                                <Icons.File className="h-3 w-3" />
                                <span className="font-mono">{tab}</span>
                                {isDirty && (
                                    <span className="bg-foreground/70 ml-0.5 h-1.5 w-1.5 rounded-full" />
                                )}
                                <button
                                    type="button"
                                    onClick={(e) => closeTab(tab, e)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            closeTab(tab, e);
                                        }
                                    }}
                                    className="hover:bg-background-secondary text-foreground-tertiary hover:text-foreground ml-0.5 flex h-4 w-4 items-center justify-center rounded"
                                    aria-label={`Close ${tab}`}
                                >
                                    <Icons.CrossL className="h-2.5 w-2.5" />
                                </button>
                            </div>
                        );
                    })}
                    <div className="ml-auto flex items-center gap-2 px-3">
                        <span className="text-foreground-tertiary">UTF-8</span>
                        <span className="text-foreground-tertiary">·</span>
                        <span className="text-foreground-tertiary">TSX</span>
                    </div>
                </div>
                {/* Line area */}
                <div
                    className="font-mono text-[11px] leading-[1.6]"
                    onClick={() => {
                        setDirtyFiles((d) => {
                            const next = new Set(d);
                            next.add(activeFile);
                            return next;
                        });
                    }}
                >
                    {lines.map((line, i) => (
                        <div
                            key={i}
                            onClick={() => setSelectedLine(i)}
                            className={cn(
                                'flex cursor-text items-baseline gap-3 px-3',
                                selectedLine === i
                                    ? 'bg-foreground-brand/15'
                                    : 'hover:bg-background-secondary/40',
                            )}
                        >
                            <span className="text-foreground-tertiary w-5 shrink-0 text-right text-[10px]">
                                {i + 1}
                            </span>
                            <div className="min-w-0 whitespace-pre">
                                {line.tokens.map((tok, j) => (
                                    <span
                                        key={j}
                                        className={TOKEN_COLOR[tok.c] ?? 'text-foreground'}
                                    >
                                        {tok.t}
                                    </span>
                                ))}
                                {selectedLine === i && (
                                    <span className="bg-foreground ml-0.5 inline-block h-3 w-px animate-pulse align-middle" />
                                )}
                            </div>
                        </div>
                    ))}
                </div>
                {/* Status bar */}
                <div className="border-border-bar bg-background-bar/80 mt-auto flex h-6 items-center justify-between border-t px-3 text-[10px]">
                    <div className="text-foreground-tertiary flex items-center gap-3">
                        <span>{lines.length} lines</span>
                        <span>Ln {(selectedLine ?? 0) + 1}, Col 1</span>
                    </div>
                    <div className="text-foreground-tertiary flex items-center gap-2">
                        {dirtyFiles.has(activeFile) ? (
                            <span className="text-amber-700 dark:text-amber-300">● Unsaved</span>
                        ) : (
                            <span className="text-emerald-700 dark:text-emerald-300">✓ Saved</span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function PreviewModePanel({ onExit }: { onExit: () => void }) {
    return (
        <div className="bg-background-canvas absolute inset-0 z-30 flex flex-col items-stretch">
            {/* Exit bar pinned to top of preview */}
            <div className="border-border bg-background-chrome flex h-10 shrink-0 items-center justify-between border-b px-3">
                <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgb(52_211_153)]" />
                    <span className="text-foreground-secondary text-[11px]">Preview</span>
                </div>
                <button
                    type="button"
                    onClick={onExit}
                    className="hover:bg-background-secondary text-foreground-secondary hover:text-foreground flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px]"
                >
                    <Icons.CrossL className="h-3 w-3" />
                    Exit preview
                </button>
            </div>
            <div className="flex flex-1 items-start justify-center overflow-auto pt-8">
                <div className="border-border bg-background-chrome relative w-[80%] max-w-3xl overflow-hidden rounded-lg border shadow-2xl">
                    <div className="border-border bg-background-bar/80 flex h-7 items-center gap-2 border-b px-3">
                        <div className="flex gap-1.5">
                            <button
                                type="button"
                                onClick={onExit}
                                aria-label="Close preview"
                                className="h-2.5 w-2.5 rounded-full bg-rose-400/60 transition-transform hover:scale-125"
                            />
                            <div className="h-2.5 w-2.5 rounded-full bg-amber-300/60" />
                            <div className="h-2.5 w-2.5 rounded-full bg-emerald-400/60" />
                        </div>
                        <div className="border-border bg-background-secondary/60 mx-2 flex h-4 flex-1 items-center gap-1.5 rounded-sm border-[0.5px] px-2">
                            <Icons.LockClosed className="text-foreground-tertiary h-2.5 w-2.5" />
                            <span className="text-foreground-tertiary truncate text-[10px]">
                                villainterest.weblab.app
                            </span>
                        </div>
                    </div>
                    <div className="bg-background-canvas relative aspect-[16/10] overflow-hidden">
                        <DesignMockup />
                    </div>
                </div>
            </div>
        </div>
    );
}

function NotesComponent() {
    const notes = [
        'Implement evil pin creation (mwahaha)',
        "Add 'light mode' (begrudgingly)",
        'Build villain-to-villain messaging (evil DMs)',
        'Create villain collaboration boards',
        'Add villain lair location sharing (evil meetups)',
        'Create devious recommendation page',
    ];

    return (
        <div className="border-border bg-background-chrome mt-10 h-fit w-96 min-w-64 rounded-lg border p-3 backdrop-blur-sm">
            <div className="mb-1 flex items-center gap-2">
                <h3 className="text-foreground-secondary font-mono text-xs">
                    Villainterest - Product Notes
                </h3>
            </div>
            <div className="space-y-2">
                {notes.map((note, index) => (
                    <div key={index} className="flex items-start gap-2 text-[10px]">
                        <div className="bg-foreground-tertiary mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full"></div>
                        <span
                            className={cn(
                                'font-mono leading-relaxed',
                                index < 3
                                    ? 'text-foreground-tertiary line-through'
                                    : 'text-foreground-secondary',
                            )}
                        >
                            {note}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function UserMessage({ text }: { text: string }) {
    return (
        <div className="flex w-full flex-row justify-end px-2">
            <div className="bg-background-secondary text-foreground-secondary border-border ml-8 flex w-[80%] flex-col rounded-lg rounded-br-none border-[0.5px] p-2 shadow-sm">
                <div className="text-xs font-light">{text}</div>
            </div>
        </div>
    );
}

function AiMessage({ text }: { text: string }) {
    return (
        <div className="flex w-full flex-row justify-start px-2">
            <div className="text-foreground-primary mr-8 flex w-[90%] flex-col rounded-lg rounded-bl-none p-1">
                <div className="mt-1 text-xs leading-4.5 font-light">{text}</div>
            </div>
        </div>
    );
}

function ReasoningMessage({ text, active }: { text: string; active: boolean }) {
    return (
        <div className="flex w-full flex-row justify-start px-2">
            <div className="text-foreground-secondary flex items-start gap-1.5 px-1">
                {active ? (
                    <Icons.LoadingSpinner className="mt-0.5 h-3 w-3 shrink-0 animate-spin" />
                ) : (
                    <Icons.Check className="text-foreground-tertiary mt-0.5 h-3 w-3 shrink-0" />
                )}
                <span
                    className={cn(
                        'text-[11px] leading-snug font-light',
                        active &&
                            'animate-shimmer bg-gradient-to-r from-[hsl(var(--foreground-secondary))] via-[hsl(var(--foreground))] to-[hsl(var(--foreground-secondary))] bg-[length:200%_100%] bg-clip-text text-transparent',
                    )}
                >
                    {text}
                </span>
            </div>
        </div>
    );
}

function ToolCallCard({
    tool,
    file,
    detail,
    active,
}: {
    tool: 'create_file' | 'edit_file';
    file: string;
    detail: string;
    active: boolean;
}) {
    return (
        <div className="px-2">
            <div className="border-border bg-background-secondary/60 relative rounded-md border backdrop-blur">
                <div className="text-foreground-secondary flex items-center justify-between px-2 py-1.5">
                    <div className="flex min-w-0 items-center gap-1.5">
                        {active ? (
                            <Icons.LoadingSpinner className="h-3 w-3 shrink-0 animate-spin" />
                        ) : (
                            <Icons.Check className="text-foreground-brand h-3 w-3 shrink-0" />
                        )}
                        <span className="text-foreground-tertiary text-[10px] font-medium tracking-wide uppercase">
                            {tool === 'create_file' ? 'Create' : 'Edit'}
                        </span>
                        <span className="text-foreground-primary truncate font-mono text-[11px]">
                            {file}
                        </span>
                    </div>
                    <span className="text-foreground-tertiary text-[10px]">
                        {active ? '…' : detail}
                    </span>
                </div>
            </div>
        </div>
    );
}

function usePrefersReducedMotion() {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        setReduced(mq.matches);
        const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);
    return reduced;
}

function ScriptedChat() {
    const reduced = usePrefersReducedMotion();
    const [visible, setVisible] = useState(reduced ? CHAT_SCRIPT.length : 0);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (reduced) {
            setVisible(CHAT_SCRIPT.length);
            return;
        }

        let stepTimers: ReturnType<typeof setTimeout>[] = [];
        let loopTimer: ReturnType<typeof setTimeout>;

        const play = () => {
            setVisible(0);
            stepTimers = STEP_DELAYS_MS.map((delay, i) =>
                setTimeout(() => setVisible(i + 1), delay),
            );
            loopTimer = setTimeout(play, LOOP_RESTART_MS);
        };

        play();
        return () => {
            stepTimers.forEach(clearTimeout);
            clearTimeout(loopTimer);
        };
    }, [reduced]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [visible]);

    return (
        <div
            ref={scrollRef}
            className="flex flex-1 flex-col gap-2 overflow-y-auto py-3"
            style={{ scrollbarWidth: 'none' }}
        >
            {CHAT_SCRIPT.slice(0, visible).map((step, idx) => {
                const isLast = idx === visible - 1;
                if (step.kind === 'user') return <UserMessage key={idx} text={step.text} />;
                if (step.kind === 'ai') return <AiMessage key={idx} text={step.text} />;
                if (step.kind === 'reasoning')
                    return <ReasoningMessage key={idx} text={step.text} active={isLast} />;
                return (
                    <ToolCallCard
                        key={idx}
                        tool={step.tool}
                        file={step.file}
                        detail={step.detail}
                        active={isLast}
                    />
                );
            })}
        </div>
    );
}

export function WeblabInterfaceMockup() {
    const [isVisible, setIsVisible] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setIsVisible(true), 1200);
        return () => clearTimeout(timer);
    }, []);

    const [activeTab, setActiveTab] = useState<TabId>('layers');
    const [activeMode, setActiveMode] = useState<ModeId>('design');
    const [layers, setLayers] = useState<MockLayer[]>(INITIAL_LAYERS);
    const [hoveredLayer, setHoveredLayer] = useState<string | null>(null);
    const [selectedLayer, setSelectedLayer] = useState<string>('card-1');
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    const [canvasSelected, setCanvasSelected] = useState<'home' | 'mobile' | null>('home');
    const [activeRightTab, setActiveRightTab] = useState<RightTabId>('chat');
    const [activeTool, setActiveTool] = useState<'cursor' | 'hand' | 'comment'>('cursor');
    const [zoomPct, setZoomPct] = useState(100);
    const [previewTheme, setPreviewTheme] = useState<PreviewTheme>('dark');
    const [leftPanelPinned, setLeftPanelPinned] = useState(true);
    const [comments, setComments] = useState<{ id: number; x: number; y: number; text: string }[]>(
        () => [{ id: Date.now(), x: 32, y: 38, text: 'Make this image larger' }],
    );
    const [openCommentId, setOpenCommentId] = useState<number | null>(null);
    const [restyleColor, setRestyleColor] = useState<(typeof RESTYLE_COLORS)[number]['id']>('teal');
    const [showSaved, setShowSaved] = useState(false);
    const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const triggerSaved = useCallback(() => {
        setShowSaved(true);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setShowSaved(false), 1400);
    }, []);

    const [publishState, setPublishState] = useState<'idle' | 'publishing' | 'published' | 'live'>(
        'live',
    );
    const publishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const publishedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handlePublish = useCallback(() => {
        if (publishTimerRef.current) clearTimeout(publishTimerRef.current);
        if (publishedTimerRef.current) clearTimeout(publishedTimerRef.current);
        setPublishState('publishing');
        publishTimerRef.current = setTimeout(() => {
            setPublishState('published');
            publishedTimerRef.current = setTimeout(() => setPublishState('live'), 1800);
        }, 1200);
    }, []);
    useEffect(() => {
        return () => {
            if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
            if (publishTimerRef.current) clearTimeout(publishTimerRef.current);
            if (publishedTimerRef.current) clearTimeout(publishedTimerRef.current);
        };
    }, []);

    const [isPanning, setIsPanning] = useState(false);
    const [panOffset, setPanOffset] = useState({ x: 60, y: -30 });
    const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

    const handleMouseDown = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('[data-canvas-element]')) return;
        if ((e.target as HTMLElement).closest('[data-restyle-pill]')) return;
        setIsPanning(true);
        setLastMousePos({ x: e.clientX, y: e.clientY });
    };
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isPanning) return;
        const deltaX = e.clientX - lastMousePos.x;
        const deltaY = e.clientY - lastMousePos.y;
        setPanOffset({
            x: Math.max(-600, Math.min(600, panOffset.x + deltaX)),
            y: Math.max(-400, Math.min(400, panOffset.y + deltaY)),
        });
        setLastMousePos({ x: e.clientX, y: e.clientY });
    };
    const handleMouseUp = () => setIsPanning(false);

    const onLayerDragStart = (index: number) => (e: React.DragEvent) => {
        setDragIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        if (e.dataTransfer.setDragImage) {
            const empty = document.createElement('div');
            e.dataTransfer.setDragImage(empty, 0, 0);
        }
    };
    const onLayerDragOver = (index: number) => (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragOverIndex !== index) setDragOverIndex(index);
    };
    const onLayerDrop = (index: number) => (e: React.DragEvent) => {
        e.preventDefault();
        if (dragIndex === null || dragIndex === index) {
            setDragIndex(null);
            setDragOverIndex(null);
            return;
        }
        setLayers((prev) => {
            const next = [...prev];
            const [moved] = next.splice(dragIndex, 1);
            if (!moved) return prev;
            next.splice(index, 0, moved);
            return next;
        });
        setDragIndex(null);
        setDragOverIndex(null);
    };
    const onLayerDragEnd = useCallback(() => {
        setDragIndex(null);
        setDragOverIndex(null);
    }, []);

    const selectedRestyle = RESTYLE_COLORS.find((c) => c.id === restyleColor) ?? RESTYLE_COLORS[0];
    const homeBorderClass = canvasSelected === 'home' ? selectedRestyle.className : 'border-border';
    const selectedLayerData = layers.find((l) => l.id === selectedLayer) ?? layers[0];

    return (
        <div
            className={cn(
                'bg-background-canvas border-border relative mx-auto -mt-10 aspect-[16/10] w-full max-w-6xl overflow-hidden rounded-xl border shadow-2xl transition-all duration-1000 ease-out select-none',
                isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0',
            )}
        >
            {/* Mode-swapped canvas content */}
            {activeMode === 'code' && <CodeModePanel />}
            {activeMode === 'preview' && (
                <PreviewModePanel onExit={() => setActiveMode('design')} />
            )}
            {/* Canvas content (behind chrome) — Design mode */}
            <div
                className={cn(
                    'pointer-events-none absolute inset-0 right-44 z-0 mt-30 flex items-start justify-center gap-12 select-none',
                    activeMode !== 'design' && 'hidden',
                )}
                style={{
                    transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
                    transition: isPanning ? 'none' : 'transform 0.1s ease-out',
                }}
            >
                <NotesComponent />
                <div
                    data-canvas-element
                    className={cn(
                        'pointer-events-auto relative flex flex-col items-center rounded-sm border shadow-xl shadow-black/50 transition-colors',
                        homeBorderClass,
                    )}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => setCanvasSelected('home')}
                >
                    <div className="absolute -top-7 left-1/2 z-50 flex h-6 w-full -translate-x-1/2 flex-row items-center gap-2.5 rounded-lg px-1 text-xs backdrop-blur-lg">
                        <div
                            className={cn(
                                'flex flex-1 flex-row items-center gap-1.5 overflow-hidden text-[12px] text-ellipsis whitespace-nowrap',
                                canvasSelected === 'home'
                                    ? 'text-teal-300'
                                    : 'text-foreground-secondary',
                            )}
                        >
                            Home
                            <Icons.ChevronDown
                                className={cn(
                                    'mb-0.5 h-4 w-4',
                                    canvasSelected === 'home'
                                        ? 'text-teal-400'
                                        : 'text-foreground-secondary',
                                )}
                            />
                        </div>
                    </div>
                    {canvasSelected === 'home' && (
                        <div
                            data-restyle-pill
                            className="border-border bg-background-chrome absolute -top-16 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-md border p-1 shadow-md backdrop-blur"
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <span className="text-foreground-tertiary px-1.5 text-[10px] font-medium tracking-wide uppercase">
                                Border
                            </span>
                            {RESTYLE_COLORS.map((c) => (
                                <button
                                    key={c.id}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setRestyleColor(c.id);
                                        triggerSaved();
                                    }}
                                    className={cn(
                                        'h-4 w-4 rounded-full ring-1 transition-all',
                                        c.swatch,
                                        restyleColor === c.id
                                            ? 'ring-foreground scale-110'
                                            : 'ring-border',
                                    )}
                                    aria-label={`Set border to ${c.id}`}
                                />
                            ))}
                            <span
                                className={cn(
                                    'text-foreground-brand ml-1 flex items-center gap-1 px-1.5 text-[10px] font-medium transition-opacity duration-200',
                                    showSaved ? 'opacity-100' : 'opacity-0',
                                )}
                            >
                                <Icons.Check className="h-3 w-3" />
                                Saved
                            </span>
                        </div>
                    )}
                    <DesignMockup />
                </div>
                <div
                    data-canvas-element
                    className={cn(
                        'pointer-events-auto relative ml-8 flex flex-col items-center rounded-sm border-[0.5px] shadow-xl shadow-black/50 transition-colors',
                        canvasSelected === 'mobile' ? selectedRestyle.className : 'border-border',
                    )}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => setCanvasSelected('mobile')}
                >
                    <div className="absolute -top-7 left-1/2 z-50 flex h-6 w-full -translate-x-1/2 flex-row items-center gap-2.5 rounded-lg px-1 text-xs backdrop-blur-lg">
                        <div className="text-foreground-secondary flex flex-1 flex-row items-center gap-1.5 overflow-hidden text-[12px] text-ellipsis whitespace-nowrap">
                            Home
                            <Icons.ChevronDown className="text-foreground-secondary mb-0.5 h-4 w-4" />
                        </div>
                    </div>
                    <DesignMockupMobile />
                </div>
            </div>

            {/* Top Bar */}
            <div className="border-border bg-background-chrome relative z-10 grid h-11 grid-cols-3 items-center border-b px-2.5 backdrop-blur-xl">
                {/* Left cluster: logo + project breadcrumb + branch + connection */}
                <div className="flex min-w-0 items-center gap-1.5">
                    <Icons.WeblabLogo className="h-4.5 w-4.5 shrink-0" />
                    <span className="text-foreground max-w-[110px] truncate text-[11px] font-medium">
                        Villainterest
                    </span>
                    <Icons.ChevronDown className="text-foreground-tertiary -ml-0.5 h-3.5 w-3.5" />
                    <span className="text-foreground-tertiary mx-0.5 text-[11px]">/</span>
                    <div className="bg-background-secondary/60 border-border/60 flex items-center gap-1 rounded-md border px-1.5 py-0.5">
                        <Icons.Branch className="text-foreground-secondary h-3 w-3" />
                        <span className="text-foreground-secondary text-[10.5px]">main</span>
                    </div>
                    <div className="ml-1 flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgb(52_211_153)]" />
                        <span className="text-[10px] font-medium text-emerald-200">Online</span>
                    </div>
                </div>

                <ModeToggle activeMode={activeMode} onChange={setActiveMode} />

                {/* Right cluster: undo/redo, history, diff, git, CMS, preview, members, avatar, Publish */}
                <div className="flex items-center justify-end gap-0.5">
                    <button
                        className="hover:bg-background-secondary text-foreground-secondary hover:text-foreground rounded-md p-1.5"
                        aria-label="Undo"
                    >
                        <Icons.Reset className="h-3.5 w-3.5" />
                    </button>
                    <button
                        className="hover:bg-background-secondary text-foreground-secondary hover:text-foreground rounded-md p-1.5"
                        aria-label="Redo"
                    >
                        <Icons.Reset className="h-3.5 w-3.5 scale-x-[-1]" />
                    </button>
                    <div className="bg-border/60 mx-1 h-4 w-px" />
                    <button
                        className="hover:bg-background-secondary text-foreground-secondary hover:text-foreground rounded-md p-1.5"
                        aria-label="Version history"
                    >
                        <Icons.CounterClockwiseClock className="h-3.5 w-3.5" />
                    </button>
                    <button
                        className="hover:bg-background-secondary text-foreground-secondary hover:text-foreground rounded-md p-1.5"
                        aria-label="Diff"
                    >
                        <Icons.Code className="h-3.5 w-3.5" />
                    </button>
                    <button
                        className="hover:bg-background-secondary text-foreground-secondary hover:text-foreground rounded-md p-1.5"
                        aria-label="CMS"
                    >
                        <Icons.Cube className="h-3.5 w-3.5" />
                    </button>
                    <button
                        className="hover:bg-background-secondary text-foreground-secondary hover:text-foreground rounded-md p-1.5"
                        aria-label="Preview"
                        onClick={() => setActiveMode('preview')}
                    >
                        <Icons.Play className="h-3.5 w-3.5" />
                    </button>
                    <div className="bg-border/60 mx-1 h-4 w-px" />
                    {/* Members avatar stack */}
                    <div className="mr-1 flex -space-x-1.5">
                        <div className="ring-background-chrome h-5 w-5 rounded-full bg-gradient-to-br from-amber-300 to-rose-400 ring-2" />
                        <div className="ring-background-chrome h-5 w-5 rounded-full bg-gradient-to-br from-sky-300 to-indigo-400 ring-2" />
                    </div>
                    <div className="bg-background-tertiary text-foreground ml-0.5 flex h-6.5 w-6.5 items-center justify-center overflow-hidden rounded-full text-xs">
                        <img
                            src="/assets/profile-picture.png"
                            alt="Profile Picture"
                            className="h-full w-full rounded-full object-cover"
                        />
                    </div>
                    <button
                        onClick={handlePublish}
                        type="button"
                        className={cn(
                            'ml-1.5 flex flex-row items-center gap-1.5 rounded-md border-[1px] px-2.5 py-1 text-xs transition-colors',
                            publishState === 'publishing' &&
                                'border-amber-300/60 bg-amber-300/10 text-amber-200',
                            publishState === 'published' &&
                                'border-emerald-300/70 bg-emerald-500/15 text-emerald-200',
                            (publishState === 'live' || publishState === 'idle') &&
                                'border-teal-200/70 bg-teal-900/40 text-teal-100 hover:bg-teal-900/60',
                        )}
                    >
                        {publishState === 'publishing' && (
                            <>
                                <Icons.LoadingSpinner className="h-3 w-3 animate-spin" />
                                Publishing
                            </>
                        )}
                        {publishState === 'published' && (
                            <>
                                <Icons.Check className="h-3 w-3" />
                                Published
                            </>
                        )}
                        {(publishState === 'live' || publishState === 'idle') && (
                            <>
                                <Icons.Globe className="h-3 w-3" />
                                Publish
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="relative flex h-[calc(100%-2.75rem)]">
                {/* Sidebar rail */}
                <div className="bg-background-chrome border-border-bar flex h-full w-11 flex-col items-center justify-between border-r py-2 backdrop-blur-xl">
                    <div className="flex flex-col items-center gap-0.5">
                        {TAB_DEFS.map((tab) => {
                            const Icon = Icons[tab.icon];
                            const active = tab.id === activeTab;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveTab(tab.id)}
                                    aria-label={tab.label}
                                    className={cn(
                                        'flex h-7.5 w-7.5 cursor-pointer items-center justify-center rounded-md transition-colors',
                                        active
                                            ? 'bg-background-bar-active text-foreground'
                                            : 'hover:bg-background-secondary/60 text-foreground-secondary',
                                    )}
                                >
                                    <Icon className="h-4 w-4" />
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                        <div className="text-foreground-tertiary flex h-6 items-center justify-center text-[10px] tabular-nums">
                            100%
                        </div>
                        <button
                            aria-label="Help"
                            className="text-foreground-secondary hover:bg-background-secondary/60 hover:text-foreground flex h-7 w-7 items-center justify-center rounded-md"
                        >
                            <Icons.QuestionMarkCircled className="h-4 w-4" />
                        </button>
                        <button
                            aria-label="Collapse panel"
                            className="text-foreground-secondary hover:bg-background-secondary/60 hover:text-foreground flex h-7 w-7 items-center justify-center rounded-md"
                        >
                            <Icons.SidebarLeftCollapse className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* Floating bottom toolbar — Design mode only. Anchored to the
                    canvas region so it stays visually centered between the
                    left rail+panel and the right chat panel. */}
                <div
                    className={cn(
                        'pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center',
                        activeMode !== 'design' && 'hidden',
                    )}
                >
                    <div className="border-border-bar bg-background-bar pointer-events-auto flex items-center gap-0.5 rounded-lg border p-1 shadow-xl backdrop-blur-2xl">
                        {/* Selection tools */}
                        <button
                            type="button"
                            onClick={() => setActiveTool('cursor')}
                            aria-label="Select"
                            className={cn(
                                'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
                                activeTool === 'cursor'
                                    ? 'bg-background-bar-active text-foreground'
                                    : 'text-foreground-tertiary hover:bg-background-bar-active hover:text-foreground',
                            )}
                        >
                            <Icons.CursorArrow className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTool('hand')}
                            aria-label="Pan"
                            className={cn(
                                'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
                                activeTool === 'hand'
                                    ? 'bg-background-bar-active text-foreground'
                                    : 'text-foreground-tertiary hover:bg-background-bar-active hover:text-foreground',
                            )}
                        >
                            <Icons.Hand className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTool('comment')}
                            aria-label="Comment"
                            className={cn(
                                'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
                                activeTool === 'comment'
                                    ? 'bg-background-bar-active text-foreground'
                                    : 'text-foreground-tertiary hover:bg-background-bar-active hover:text-foreground',
                            )}
                        >
                            <Icons.ChatBubble className="h-4 w-4" />
                        </button>

                        <div className="bg-border-bar/80 mx-0.5 h-5 w-px" />

                        {/* Zoom controls */}
                        <button
                            type="button"
                            onClick={() => setZoomPct((z) => Math.max(25, Math.round(z / 1.25)))}
                            aria-label="Zoom out"
                            className="text-foreground-tertiary hover:bg-background-bar-active hover:text-foreground flex h-7 w-6 items-center justify-center rounded-md"
                        >
                            <Icons.Minus className="h-3 w-3" />
                        </button>
                        <div className="text-foreground-secondary w-10 text-center text-[11px] tabular-nums">
                            {zoomPct}%
                        </div>
                        <button
                            type="button"
                            onClick={() => setZoomPct((z) => Math.min(300, Math.round(z * 1.25)))}
                            aria-label="Zoom in"
                            className="text-foreground-tertiary hover:bg-background-bar-active hover:text-foreground flex h-7 w-6 items-center justify-center rounded-md"
                        >
                            <Icons.Plus className="h-3 w-3" />
                        </button>

                        <div className="bg-border-bar/80 mx-0.5 h-5 w-px" />

                        {/* Preview theme toggle */}
                        <button
                            type="button"
                            onClick={() =>
                                setPreviewTheme((t) => (t === 'dark' ? 'light' : 'dark'))
                            }
                            aria-label="Toggle preview theme"
                            className="text-foreground-tertiary hover:bg-background-bar-active hover:text-foreground flex h-8 w-8 items-center justify-center rounded-md"
                        >
                            {previewTheme === 'dark' ? (
                                <Icons.Moon className="h-4 w-4" />
                            ) : (
                                <Icons.Sun className="h-4 w-4" />
                            )}
                        </button>

                        <div className="bg-border-bar/80 mx-0.5 h-5 w-px" />

                        {/* Errors console */}
                        <button
                            type="button"
                            aria-label="Errors"
                            className="text-foreground-tertiary hover:bg-background-bar-active hover:text-foreground relative flex h-8 items-center gap-1.5 rounded-md px-2"
                        >
                            <Icons.ExclamationTriangle className="h-3.5 w-3.5" />
                            <span className="text-[10px] tabular-nums">0</span>
                        </button>
                        <button
                            type="button"
                            aria-label="Terminal"
                            className="text-foreground-tertiary hover:bg-background-bar-active hover:text-foreground flex h-8 w-8 items-center justify-center rounded-md"
                        >
                            <Icons.Terminal className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* Expanded Panel */}
                <div className="h-full w-56">
                    <div className="bg-background-chrome border-border-bar flex h-full w-full flex-col items-stretch overflow-hidden border-r backdrop-blur-2xl">
                        <div className="border-border-bar/60 flex h-9 items-center justify-between border-b px-2.5">
                            <span className="text-foreground text-[11px] font-medium">
                                {TAB_DEFS.find((t) => t.id === activeTab)?.label}
                            </span>
                            <button
                                type="button"
                                onClick={() => setLeftPanelPinned((v) => !v)}
                                aria-label={leftPanelPinned ? 'Unpin panel' : 'Pin panel'}
                                className={cn(
                                    'flex h-6 w-6 items-center justify-center rounded-md transition-colors',
                                    leftPanelPinned
                                        ? 'bg-background-bar-active text-foreground'
                                        : 'text-foreground-tertiary hover:bg-background-secondary hover:text-foreground',
                                )}
                            >
                                {leftPanelPinned ? (
                                    <Icons.PinFilled className="h-3 w-3" />
                                ) : (
                                    <Icons.Pin className="h-3 w-3" />
                                )}
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-1.5">
                            {activeTab === 'layers' && (
                                <div className="flex flex-col gap-0.5">
                                    {layers.map((layer, index) => {
                                        const isSelected = selectedLayer === layer.id;
                                        const isHovered = hoveredLayer === layer.id;
                                        const isComponent = layer.tagName === 'COMPONENT';
                                        const isDragging = dragIndex === index;
                                        const isDragOver =
                                            dragOverIndex === index && dragIndex !== null;
                                        return (
                                            <div
                                                key={layer.id}
                                                draggable
                                                onDragStart={onLayerDragStart(index)}
                                                onDragOver={onLayerDragOver(index)}
                                                onDrop={onLayerDrop(index)}
                                                onDragEnd={onLayerDragEnd}
                                                onMouseEnter={() => setHoveredLayer(layer.id)}
                                                onMouseLeave={() => setHoveredLayer(null)}
                                                onClick={() => {
                                                    setSelectedLayer(layer.id);
                                                    setActiveRightTab('style');
                                                }}
                                                className={cn(
                                                    'flex h-5.5 cursor-grab items-center rounded px-1.5 text-xs transition-colors select-none active:cursor-grabbing',
                                                    isSelected &&
                                                        'bg-foreground-brand/90 text-background-primary',
                                                    !isSelected &&
                                                        isHovered &&
                                                        'bg-background-secondary text-foreground',
                                                    !isSelected &&
                                                        !isHovered &&
                                                        isComponent &&
                                                        'text-purple-700 dark:text-purple-300',
                                                    !isSelected &&
                                                        !isHovered &&
                                                        !isComponent &&
                                                        'text-foreground-secondary',
                                                    isDragging && 'opacity-40',
                                                    isDragOver &&
                                                        'border-foreground-brand shadow-foreground-brand/40 -mt-px border-t-2 shadow-[0_-2px_4px_-2px]',
                                                )}
                                                style={{ userSelect: 'none' }}
                                            >
                                                <div style={{ width: `${layer.level * 12}px` }} />
                                                <NodeIcon
                                                    iconClass="w-3 h-3 mr-1.5 shrink-0"
                                                    tagName={layer.tagName}
                                                />
                                                <span className="truncate">{layer.name}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            {activeTab === 'pages' && (
                                <div className="flex flex-col gap-1">
                                    {PAGES.map((p) => (
                                        <div
                                            key={p.id}
                                            className={cn(
                                                'flex h-6 cursor-pointer items-center justify-between rounded px-2 text-xs transition-colors',
                                                p.active
                                                    ? 'bg-background-bar-active text-foreground'
                                                    : 'text-foreground-secondary hover:bg-background-secondary',
                                            )}
                                        >
                                            <span className="flex items-center gap-1.5">
                                                <Icons.File className="h-3 w-3" />
                                                {p.name}
                                            </span>
                                            {p.badge && (
                                                <span className="bg-foreground-brand/20 text-foreground-brand rounded-sm px-1 text-[9px] font-medium uppercase">
                                                    {p.badge}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {activeTab === 'components' && (
                                <div className="grid grid-cols-2 gap-1.5">
                                    {COMPONENT_CHIPS.map((c) => (
                                        <button
                                            key={c}
                                            className="bg-background-secondary/60 hover:bg-background-secondary border-border text-foreground-secondary hover:text-foreground flex aspect-square flex-col items-center justify-center gap-1 rounded-md border-[0.5px] p-1 text-[10px] transition-colors"
                                        >
                                            <Icons.Component className="h-3.5 w-3.5" />
                                            {c}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {activeTab === 'insert' && (
                                <div className="flex flex-col gap-1">
                                    {['Frame', 'Text', 'Image', 'Button'].map((label) => (
                                        <button
                                            key={label}
                                            className="hover:bg-background-secondary text-foreground-secondary hover:text-foreground flex h-6 items-center gap-2 rounded px-2 text-xs"
                                        >
                                            <Icons.Plus className="h-3 w-3" />
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {activeTab === 'search' && (
                                <div className="flex flex-col gap-1.5 p-1">
                                    <div className="border-border bg-background-secondary/40 flex h-6 items-center gap-1.5 rounded-md border px-2">
                                        <Icons.MagnifyingGlass className="text-foreground-tertiary h-3 w-3" />
                                        <span className="text-foreground-tertiary text-[11px]">
                                            Search elements…
                                        </span>
                                    </div>
                                    <p className="text-foreground-tertiary px-1 text-[10px]">
                                        Type to find any layer.
                                    </p>
                                </div>
                            )}
                            {activeTab === 'brand' && (
                                <div className="flex flex-col gap-2 p-1">
                                    <div className="flex items-center gap-1.5">
                                        {[
                                            'bg-foreground',
                                            'bg-foreground-brand',
                                            'bg-teal-400',
                                            'bg-amber-400',
                                            'bg-rose-400',
                                        ].map((c) => (
                                            <div
                                                key={c}
                                                className={cn(
                                                    'ring-border h-5 w-5 rounded-full ring-1',
                                                    c,
                                                )}
                                            />
                                        ))}
                                    </div>
                                    <p className="text-foreground-secondary text-[11px]">Brand</p>
                                </div>
                            )}
                            {activeTab === 'images' && (
                                <div className="grid grid-cols-3 gap-1">
                                    {Array.from({ length: 9 }).map((_, i) => (
                                        <div
                                            key={i}
                                            className="bg-background-secondary/60 border-border aspect-square rounded-sm border-[0.5px]"
                                        />
                                    ))}
                                </div>
                            )}
                            {activeTab === 'branches' && (
                                <div className="flex flex-col gap-1">
                                    {BRANCHES.map((b) => (
                                        <div
                                            key={b.id}
                                            className={cn(
                                                'flex h-6 cursor-pointer items-center justify-between rounded px-2 text-xs transition-colors',
                                                b.active
                                                    ? 'bg-background-bar-active text-foreground'
                                                    : 'text-foreground-secondary hover:bg-background-secondary',
                                            )}
                                        >
                                            <span className="flex items-center gap-1.5">
                                                <Icons.Branch className="h-3 w-3" />
                                                <span className="truncate">{b.name}</span>
                                            </span>
                                            {(b.ahead > 0 || b.behind > 0) && (
                                                <span className="text-foreground-tertiary text-[9px] tabular-nums">
                                                    {b.ahead > 0 && `↑${b.ahead}`}
                                                    {b.behind > 0 && `↓${b.behind}`}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Floating EditorBar — contextual element style toolbar
                    centered between the side panels, shown only in Design mode.
                    Inset values track the left rail (w-11 = 44px) + expanded
                    panel (w-56 = 224px) = 268px on the left, and the right
                    chat panel (w-72 = 288px) on the right. Keep in sync if
                    panel widths change. */}
                <div
                    className={cn(
                        'pointer-events-none absolute top-2 right-[288px] left-[268px] z-20 flex justify-center',
                        activeMode !== 'design' && 'hidden',
                    )}
                >
                    <div className="border-border-bar bg-background-bar pointer-events-auto flex h-8 items-center gap-0.5 rounded-lg border px-1 shadow-lg backdrop-blur-2xl">
                        <div className="flex items-center gap-1 px-1.5">
                            <NodeIcon
                                iconClass="w-3 h-3 shrink-0"
                                tagName={selectedLayerData?.tagName ?? 'COMPONENT'}
                            />
                            <span className="text-foreground max-w-[100px] truncate text-[11px]">
                                {selectedLayerData?.name ?? 'Hero'}
                            </span>
                        </div>
                        <div className="bg-border-bar/80 mx-0.5 h-4 w-px" />
                        <button
                            type="button"
                            className="text-foreground-secondary hover:bg-background-bar-active hover:text-foreground flex h-6 items-center gap-1 rounded px-1.5 text-[10px]"
                        >
                            <div className="bg-foreground-brand ring-border/60 h-2.5 w-2.5 rounded-sm ring-1" />
                            Fill
                        </button>
                        <button
                            type="button"
                            className="text-foreground-secondary hover:bg-background-bar-active hover:text-foreground flex h-6 items-center gap-1 rounded px-1.5 text-[10px]"
                        >
                            <div className="bg-foreground/0 border-foreground/80 h-2.5 w-2.5 rounded-sm border" />
                            Stroke
                        </button>
                        <div className="bg-border-bar/80 mx-0.5 h-4 w-px" />
                        <div className="text-foreground-secondary flex h-6 items-center gap-1 rounded px-1.5 text-[10px]">
                            <Icons.Frame className="h-3 w-3" />
                            <span className="text-foreground tabular-nums">12</span>
                        </div>
                        <div className="text-foreground-secondary flex h-6 items-center gap-1 rounded px-1.5 text-[10px]">
                            <Icons.Square className="h-3 w-3" />
                            <span className="text-foreground tabular-nums">32</span>
                        </div>
                        <div className="bg-border-bar/80 mx-0.5 h-4 w-px" />
                        <button
                            type="button"
                            className="text-foreground-secondary hover:bg-background-bar-active hover:text-foreground flex h-6 w-6 items-center justify-center rounded"
                        >
                            <Icons.AlignLeft className="h-3 w-3" />
                        </button>
                        <button
                            type="button"
                            className="text-foreground-secondary hover:bg-background-bar-active hover:text-foreground flex h-6 w-6 items-center justify-center rounded"
                        >
                            <Icons.AlignCenterHorizontally className="h-3 w-3" />
                        </button>
                        <button
                            type="button"
                            className="text-foreground-secondary hover:bg-background-bar-active hover:text-foreground flex h-6 w-6 items-center justify-center rounded"
                        >
                            <Icons.AlignRight className="h-3 w-3" />
                        </button>
                    </div>
                </div>

                {/* Canvas */}
                <div
                    className={cn(
                        'relative flex flex-1 flex-col items-center justify-start',
                        activeTool === 'cursor' && 'cursor-default',
                        activeTool === 'hand' && 'cursor-grab active:cursor-grabbing',
                        activeTool === 'comment' && 'cursor-crosshair',
                    )}
                    onMouseDown={activeTool === 'hand' ? handleMouseDown : undefined}
                    onMouseMove={activeTool === 'hand' ? handleMouseMove : undefined}
                    onMouseUp={activeTool === 'hand' ? handleMouseUp : undefined}
                    onMouseLeave={activeTool === 'hand' ? handleMouseUp : undefined}
                    onClick={(e) => {
                        if (activeTool !== 'comment') return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = ((e.clientX - rect.left) / rect.width) * 100;
                        const y = ((e.clientY - rect.top) / rect.height) * 100;
                        setComments((c) => [...c, { id: Date.now(), x, y, text: 'New comment' }]);
                        setActiveRightTab('comments');
                    }}
                >
                    {activeMode === 'design' &&
                        comments.map((c) => (
                            <div
                                key={c.id}
                                style={{ left: `${c.x}%`, top: `${c.y}%` }}
                                className="pointer-events-auto absolute -translate-x-1/2 -translate-y-full"
                            >
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenCommentId((id) => (id === c.id ? null : c.id));
                                    }}
                                    className="bg-foreground-brand text-background hover:bg-foreground-brand/90 flex h-6 w-6 items-center justify-center rounded-full rounded-bl-none shadow-lg ring-2 ring-white/20"
                                    aria-label="Comment"
                                >
                                    <Icons.ChatBubble className="h-3 w-3" />
                                </button>
                                {openCommentId === c.id && (
                                    <div className="border-border bg-background-chrome absolute top-7 left-0 z-50 w-44 rounded-md border p-2 shadow-xl">
                                        <p className="text-foreground text-[11px]">{c.text}</p>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setComments((arr) =>
                                                    arr.filter((x) => x.id !== c.id),
                                                );
                                                setOpenCommentId(null);
                                            }}
                                            className="text-foreground-tertiary hover:text-foreground mt-1 text-[10px]"
                                        >
                                            Resolve
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                </div>

                {/* Right Chat Panel — hidden in Preview */}
                <div
                    className={cn(
                        'bg-background-chrome border-border-bar relative flex w-72 flex-col border-l p-0 backdrop-blur-2xl',
                        activeMode === 'preview' && 'hidden',
                    )}
                >
                    <div className="absolute inset-0 flex flex-col">
                        {/* Tabs strip — Style / Chat / Comments. Icon-only when
                            inactive to fit the panel width; active tab shows label. */}
                        <div className="border-border-bar z-20 flex h-11 items-center justify-between gap-1 border-b px-2">
                            <div className="bg-background-tab-strip/70 flex h-8 min-w-0 items-center gap-0 rounded-md p-0.5">
                                {RIGHT_TABS.map((t, i) => {
                                    const Icon = Icons[t.icon];
                                    const active = activeRightTab === t.id;
                                    return (
                                        <React.Fragment key={t.id}>
                                            <button
                                                type="button"
                                                onClick={() => setActiveRightTab(t.id)}
                                                aria-label={t.label}
                                                className={cn(
                                                    'flex h-7 items-center gap-1 rounded-sm border text-[11px] transition-all',
                                                    active
                                                        ? 'bg-background-tab-active border-border-tab-active text-foreground px-2'
                                                        : 'text-foreground-secondary hover:text-foreground border-transparent px-1.5',
                                                )}
                                            >
                                                <Icon className="h-3 w-3" />
                                                {active && <span>{t.label}</span>}
                                            </button>
                                            {i < RIGHT_TABS.length - 1 && (
                                                <div className="bg-border-tab-divider mx-0 h-3 w-px self-center" />
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                            <div className="flex shrink-0 items-center gap-0.5">
                                <button
                                    aria-label="Chat settings"
                                    className="text-foreground-secondary hover:bg-background-bar-active hover:text-foreground flex h-7 w-7 items-center justify-center rounded-md"
                                >
                                    <Icons.DotsHorizontal className="h-3.5 w-3.5" />
                                </button>
                                <button
                                    aria-label="Collapse panel"
                                    className="text-foreground-secondary hover:bg-background-bar-active hover:text-foreground flex h-7 w-7 items-center justify-center rounded-md"
                                >
                                    <Icons.SidebarLeftCollapse className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>
                        {activeRightTab === 'chat' && <ScriptedChat />}
                        {activeRightTab === 'style' && (
                            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
                                <div className="flex items-center gap-2">
                                    <NodeIcon
                                        iconClass="w-3.5 h-3.5 shrink-0"
                                        tagName={selectedLayerData?.tagName ?? 'COMPONENT'}
                                    />
                                    <span className="text-foreground truncate text-xs">
                                        {selectedLayerData?.name ?? 'Hero'}
                                    </span>
                                    <span className="text-foreground-tertiary ml-auto text-[10px]">
                                        {selectedLayerData?.tagName ?? 'COMPONENT'}
                                    </span>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <div className="text-foreground-tertiary text-[10px] tracking-wider uppercase">
                                        Layout
                                    </div>
                                    <div className="grid grid-cols-2 gap-1.5">
                                        <div className="border-border bg-background-secondary/60 flex items-center justify-between rounded px-2 py-1 text-[11px]">
                                            <span className="text-foreground-tertiary">W</span>
                                            <span className="text-foreground">1280</span>
                                        </div>
                                        <div className="border-border bg-background-secondary/60 flex items-center justify-between rounded px-2 py-1 text-[11px]">
                                            <span className="text-foreground-tertiary">H</span>
                                            <span className="text-foreground">auto</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <div className="text-foreground-tertiary text-[10px] tracking-wider uppercase">
                                        Fill
                                    </div>
                                    <div className="border-border bg-background-secondary/60 flex items-center gap-2 rounded px-2 py-1.5 text-[11px]">
                                        <div className="bg-foreground-brand ring-border h-3.5 w-3.5 rounded ring-1" />
                                        <span className="text-foreground font-mono">#4F46E5</span>
                                        <span className="text-foreground-tertiary ml-auto">
                                            100%
                                        </span>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <div className="text-foreground-tertiary text-[10px] tracking-wider uppercase">
                                        Typography
                                    </div>
                                    <div className="border-border bg-background-secondary/60 flex items-center justify-between rounded px-2 py-1.5 text-[11px]">
                                        <span className="text-foreground-tertiary">Font</span>
                                        <span className="text-foreground">Inter · 600</span>
                                    </div>
                                </div>
                            </div>
                        )}
                        {activeRightTab === 'comments' && (
                            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                                <Icons.ChatBubble className="text-foreground-tertiary h-5 w-5" />
                                <span className="text-foreground-secondary text-[11px]">
                                    No comments yet
                                </span>
                                <span className="text-foreground-tertiary text-[10px]">
                                    Click anywhere on the canvas to leave a comment.
                                </span>
                            </div>
                        )}
                        {activeRightTab === 'chat' && (
                            <div className="border-border bg-background-chrome flex flex-col items-start gap-1 border-t px-2.5 py-2">
                                <textarea
                                    value={PRESET_SENTENCE}
                                    readOnly
                                    className="text-foreground-primary placeholder-foreground-tertiary mb-3 h-14 w-full flex-1 resize-none rounded-lg bg-transparent px-0.5 pt-1 text-xs outline-none"
                                    rows={2}
                                    disabled
                                />
                                <div className="flex w-full flex-row items-center justify-between gap-2">
                                    <button
                                        className="flex flex-row items-center gap-2 rounded-lg px-1 py-1.5"
                                        disabled
                                    >
                                        <Icons.Build className="text-foreground-tertiary h-4 w-4" />
                                        <p className="text-foreground-secondary text-xs">Build</p>
                                    </button>
                                    <div className="flex flex-row gap-1">
                                        <button
                                            className="hover:bg-background-secondary rounded-lg px-2 py-1.5"
                                            disabled
                                        >
                                            <Icons.Image className="text-foreground-tertiary h-4 w-4" />
                                        </button>
                                        <button
                                            className="bg-foreground cursor-pointer rounded-full px-2 py-1.5"
                                            disabled
                                        >
                                            <Icons.ArrowRight className="text-background h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
