'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Icons } from '@weblab/ui/icons';
import { NodeIcon } from '@weblab/ui/node-icon';
import { cn } from '@weblab/ui/utils';

import type { DesignMockupOverrides, DesignMockupStep } from './design-mockup/design-mockup';
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
type ModeId = 'design' | 'code' | 'preview' | 'cms';
type RightTabId = 'style' | 'chat' | 'comments';
type PreviewTheme = 'light' | 'dark';

const MODES: { id: ModeId; label: string }[] = [
    { id: 'design', label: 'Design' },
    { id: 'code', label: 'Code' },
    { id: 'cms', label: 'CMS' },
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
                                'cursor-pointer bg-transparent px-2.5 py-1 text-[11px] whitespace-nowrap transition-colors duration-150 ease-in-out',
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

const RIGHT_TABS: {
    id: RightTabId;
    label: string;
    icon: keyof typeof Icons;
}[] = [
    { id: 'style', label: 'Styles', icon: 'Layout' },
    { id: 'chat', label: 'Chat', icon: 'Sparkles' },
    { id: 'comments', label: 'Comments', icon: 'ChatBubble' },
];

const BRANCHES = [
    { id: 'main', name: 'main', active: true, ahead: 0, behind: 0 },
    {
        id: 'pricing',
        name: 'feature/pricing',
        active: false,
        ahead: 2,
        behind: 0,
    },
    { id: 'cms', name: 'feature/cms', active: false, ahead: 0, behind: 3 },
];

type ChatStep =
    | { kind: 'user'; text: string }
    | { kind: 'reasoning'; text: string }
    | {
          kind: 'tool';
          tool: 'create_file' | 'edit_file';
          file: string;
          detail: string;
      }
    | { kind: 'ai'; text: string };

type CanvasEffect = 'pricing' | 'hero' | 'restyle';

interface ChatRound {
    prompt: string;
    reasoning: string;
    tools: { tool: 'create_file' | 'edit_file'; file: string; detail: string }[];
    ai: string;
    effect: CanvasEffect;
}

const CHAT_ROUNDS: ChatRound[] = [
    {
        prompt: 'Add a pricing section with 3 tiers',
        reasoning: "I'll create a Pricing component and add it to the homepage.",
        tools: [
            { tool: 'create_file', file: 'Pricing.tsx', detail: 'new file' },
            { tool: 'edit_file', file: 'Home.tsx', detail: '1 edit' },
        ],
        ai: 'Done. Added a Pricing section with Starter, Pro, and Enterprise tiers below the hero.',
        effect: 'pricing',
    },
    {
        prompt: 'Make the hero headline larger',
        reasoning: 'Bumping the h1 to text-7xl and tightening the leading.',
        tools: [{ tool: 'edit_file', file: 'Hero.tsx', detail: '2 edits' }],
        ai: 'Updated. The hero headline is now text-7xl with tighter leading.',
        effect: 'hero',
    },
    {
        prompt: 'Style the image cards with a teal accent border',
        reasoning: 'Applying border-teal-300 to the Card component.',
        tools: [{ tool: 'edit_file', file: 'Card.tsx', detail: '1 edit' }],
        ai: 'Cards now have a teal accent border on hover and selection.',
        effect: 'restyle',
    },
];

// Per-phase timings (ms) inside a single round.
const TYPE_CHAR_MS = 32; // composer typewriter speed
const POST_TYPE_PAUSE_MS = 450; // pause after fully typed, before "send"
const SEND_TO_REASONING_MS = 400;
const REASONING_TO_TOOL_MS = 1400;
const TOOL_STAGGER_MS = 900;
const TOOLS_TO_AI_MS = 700;
const AI_CHAR_MS = 14; // AI typewriter speed
const ROUND_END_HOLD_MS = 2200; // pause after AI fully revealed before next round

interface MockLayer {
    id: string;
    name: string;
    tagName: string;
    level: number;
    isInstance: boolean;
}

const INITIAL_LAYERS: MockLayer[] = [
    { id: 'root', name: 'Home Page', tagName: 'DIV', level: 0, isInstance: false },
    { id: 'nav', name: 'Top Navigation', tagName: 'COMPONENT', level: 1, isInstance: true },
    { id: 'nav-logo', name: 'Logo', tagName: 'DIV', level: 2, isInstance: false },
    { id: 'nav-links', name: 'Nav Links', tagName: 'DIV', level: 2, isInstance: false },
    { id: 'nav-cta', name: 'Get started', tagName: 'BUTTON', level: 2, isInstance: false },
    { id: 'hero', name: 'Hero', tagName: 'COMPONENT', level: 1, isInstance: true },
    { id: 'hero-title', name: 'Headline', tagName: 'H1', level: 2, isInstance: false },
    { id: 'hero-sub', name: 'Subhead', tagName: 'P', level: 2, isInstance: false },
    { id: 'hero-cta-row', name: 'CTA Row', tagName: 'DIV', level: 2, isInstance: false },
    {
        id: 'hero-cta-primary',
        name: 'Start scheming',
        tagName: 'BUTTON',
        level: 3,
        isInstance: false,
    },
    {
        id: 'hero-cta-secondary',
        name: 'Watch demo',
        tagName: 'BUTTON',
        level: 3,
        isInstance: false,
    },
    { id: 'logos', name: 'Logo Strip', tagName: 'DIV', level: 1, isInstance: false },
    { id: 'pricing', name: 'Pricing', tagName: 'COMPONENT', level: 1, isInstance: true },
    { id: 'card-starter', name: 'Starter', tagName: 'COMPONENT', level: 2, isInstance: true },
    { id: 'card-pro', name: 'Pro', tagName: 'COMPONENT', level: 2, isInstance: true },
    { id: 'card-pro-price', name: '$12 / mo', tagName: 'SPAN', level: 3, isInstance: false },
    { id: 'card-enterprise', name: 'Enterprise', tagName: 'COMPONENT', level: 2, isInstance: true },
    { id: 'footer', name: 'Footer', tagName: 'COMPONENT', level: 1, isInstance: true },
];

const PAGES = [
    { id: 'home', name: 'Home', active: true },
    { id: 'about', name: 'About', active: false },
    { id: 'pricing', name: 'Pricing', active: false, badge: 'new' as const },
];

const COMPONENT_CHIPS = ['Button', 'Card', 'Hero', 'Nav', 'Pricing', 'Footer'];

const RESTYLE_COLORS = [
    { id: 'teal', className: 'border-teal-300', swatch: 'bg-teal-300' },
    {
        id: 'brand',
        className: 'border-foreground-brand',
        swatch: 'bg-foreground-brand',
    },
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
        <div className="bg-background-canvas absolute inset-0 top-12 z-[5] flex">
            {/* Explorer */}
            <div className="border-border-bar bg-background-bar/80 flex w-48 flex-col gap-0.5 border-r p-2 text-[11px]">
                <div className="text-foreground-tertiary mb-1 px-1 text-[10px]">Explorer</div>
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
                                <span className="bg-foreground-brand/20 text-foreground-brand ml-auto rounded-sm px-1 text-[9px] font-medium">
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

type PreviewBreakpoint = 'Desktop' | 'Tablet' | 'Mobile';

const PREVIEW_BREAKPOINTS: {
    id: PreviewBreakpoint;
    width: number;
    height: number;
}[] = [
    { id: 'Desktop', width: 1440, height: 900 },
    { id: 'Tablet', width: 768, height: 1024 },
    { id: 'Mobile', width: 390, height: 844 },
];

function PreviewModePanel({ onExit }: { onExit: () => void }) {
    const [breakpoint, setBreakpoint] = useState<PreviewBreakpoint>('Desktop');
    const [breakpointMenuOpen, setBreakpointMenuOpen] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const [fullscreen, setFullscreen] = useState(false);
    const active = PREVIEW_BREAKPOINTS.find((b) => b.id === breakpoint)!;

    // Visual scale only. Heights drive Tablet/Mobile so they don't overflow.
    const frameStyle: React.CSSProperties = fullscreen
        ? { width: '100%', height: '100%' }
        : breakpoint === 'Desktop'
          ? { width: 'min(92%, 900px)', aspectRatio: '16 / 10', maxHeight: '100%' }
          : breakpoint === 'Tablet'
            ? { height: '90%', aspectRatio: '3 / 4' }
            : { height: '90%', aspectRatio: '9 / 19' };

    return (
        <div className="bg-background-canvas absolute inset-0 z-30 flex flex-col items-stretch">
            {/* Tool chrome — matches real preview-overlay, not a fake browser. */}
            <div className="border-border-bar bg-background-chrome relative z-10 flex h-11 shrink-0 items-center gap-1 border-b px-3">
                {/* Left: navigation actions */}
                <div className="flex flex-1 items-center gap-0.5">
                    <button
                        type="button"
                        onClick={onExit}
                        className="hover:bg-background-bar-active text-foreground-secondary hover:text-foreground-primary flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px]"
                    >
                        <Icons.ArrowLeft className="h-3.5 w-3.5" />
                        <span>Close</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setReloadKey((k) => k + 1)}
                        className="hover:bg-background-bar-active text-foreground-secondary hover:text-foreground-primary flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px]"
                    >
                        <Icons.Reload
                            key={reloadKey}
                            className="h-3.5 w-3.5 [animation:spin_0.5s_ease-out_1]"
                        />
                        <span>Reload</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setFullscreen((v) => !v)}
                        className="hover:bg-background-bar-active text-foreground-secondary hover:text-foreground-primary flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px]"
                    >
                        <Icons.Corners className="h-3.5 w-3.5" />
                        <span>{fullscreen ? 'Exit fullscreen' : 'Fullscreen'}</span>
                    </button>
                </div>

                {/* Center: breakpoint dropdown + W/H */}
                {!fullscreen && (
                    <div className="flex items-center gap-1.5">
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setBreakpointMenuOpen((v) => !v)}
                                onBlur={() => setTimeout(() => setBreakpointMenuOpen(false), 120)}
                                className="bg-background-bar-active text-foreground-primary flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px]"
                            >
                                <span>{breakpoint}</span>
                                <Icons.ChevronDown className="text-foreground-tertiary h-3 w-3" />
                            </button>
                            {breakpointMenuOpen && (
                                <div className="border-border bg-background-chrome absolute top-full left-1/2 z-50 mt-1 flex w-[140px] -translate-x-1/2 flex-col rounded-md border p-1 shadow-xl">
                                    {PREVIEW_BREAKPOINTS.map((bp) => (
                                        <button
                                            key={bp.id}
                                            type="button"
                                            onMouseDown={() => {
                                                setBreakpoint(bp.id);
                                                setBreakpointMenuOpen(false);
                                            }}
                                            className={cn(
                                                'hover:bg-background-bar-active flex items-center gap-2 rounded-sm px-2 py-1 text-left text-[11px]',
                                                bp.id === breakpoint
                                                    ? 'text-foreground-primary'
                                                    : 'text-foreground-secondary',
                                            )}
                                        >
                                            <span className="flex-1">{bp.id}</span>
                                            <span className="text-foreground-tertiary tabular-nums">
                                                {bp.width}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="bg-background-bar-active text-foreground-primary flex h-7 items-center gap-1 rounded-md px-2 text-[11px] tabular-nums">
                            <span className="w-9 text-right">{active.width}</span>
                            <span className="text-foreground-tertiary text-[10px] font-medium">
                                W
                            </span>
                        </div>
                        <div className="bg-background-bar-active text-foreground-primary flex h-7 items-center gap-1 rounded-md px-2 text-[11px] tabular-nums">
                            <span className="w-9 text-right">{active.height}</span>
                            <span className="text-foreground-tertiary text-[10px] font-medium">
                                H
                            </span>
                        </div>
                    </div>
                )}

                {/* Right: Publish */}
                <div className="flex flex-1 items-center justify-end">
                    <button
                        type="button"
                        className="bg-foreground text-background flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium"
                    >
                        <Icons.Globe className="h-3.5 w-3.5" />
                        <span>Publish</span>
                    </button>
                </div>
            </div>

            {/* Preview area */}
            <div className="bg-background-canvas relative flex flex-1 items-center justify-center overflow-hidden p-6">
                <div
                    key={reloadKey}
                    className="bg-background-secondary border-border/40 group relative overflow-hidden rounded-md border shadow-2xl shadow-black/50 transition-[width,max-width,aspect-ratio] duration-300 ease-out"
                    style={frameStyle}
                >
                    <div className="h-full w-full overflow-hidden">
                        {breakpoint === 'Mobile' ? <DesignMockupMobile /> : <DesignMockup />}
                    </div>
                    {/* Drag handle hints — visual only */}
                    {!fullscreen && (
                        <>
                            <div className="bg-foreground-tertiary/30 absolute top-1/2 -left-1 h-12 w-1 -translate-y-1/2 rounded-full opacity-0 transition-opacity group-hover:opacity-100" />
                            <div className="bg-foreground-tertiary/30 absolute top-1/2 -right-1 h-12 w-1 -translate-y-1/2 rounded-full opacity-0 transition-opacity group-hover:opacity-100" />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

type CmsTab = 'collections' | 'fields' | 'sources';

const CMS_COLLECTIONS = [
    {
        id: 'lairs',
        name: 'Lairs',
        count: 12,
        updated: '2m ago',
        slug: '/lairs',
        fields: 6,
    },
    {
        id: 'henchmen',
        name: 'Henchmen',
        count: 47,
        updated: '1h ago',
        slug: '/team',
        fields: 4,
    },
    {
        id: 'mood-board',
        name: 'Mood Board',
        count: 124,
        updated: 'Yesterday',
        slug: '/inspiration',
        fields: 3,
    },
    {
        id: 'tools',
        name: 'Evil Tools',
        count: 31,
        updated: '3d ago',
        slug: '/arsenal',
        fields: 5,
    },
];

const CMS_ENTRIES = [
    {
        id: 1,
        title: 'Volcano lair — sublevel 7',
        status: 'Published',
        updated: 'May 18',
    },
    {
        id: 2,
        title: 'Underwater glass vault',
        status: 'Published',
        updated: 'May 16',
    },
    {
        id: 3,
        title: 'Brutalist mountain bunker',
        status: 'Draft',
        updated: 'May 14',
    },
    {
        id: 4,
        title: 'Floating cloud fortress',
        status: 'Published',
        updated: 'May 12',
    },
    {
        id: 5,
        title: 'Forgotten library reading room',
        status: 'Scheduled',
        updated: 'May 22',
    },
];

const CMS_FIELDS = [
    { name: 'title', type: 'Text', required: true },
    { name: 'cover', type: 'Image', required: true },
    { name: 'body', type: 'Rich Text', required: false },
    { name: 'capacity', type: 'Number', required: false },
    { name: 'tags', type: 'Multi-select', required: false },
    { name: 'published_at', type: 'Date', required: false },
];

function CmsModePanel({ onExit }: { onExit: () => void }) {
    const [activeTab, setActiveTab] = useState<CmsTab>('collections');
    const [activeCollection, setActiveCollection] = useState<string>('lairs');
    return (
        <div className="bg-background absolute inset-0 top-12 z-30 flex flex-col">
            {/* Header */}
            <div className="border-border bg-background-chrome flex h-11 shrink-0 items-center justify-between border-b px-3">
                <div className="bg-background-tab-strip/70 flex h-8 items-center gap-0 rounded-md p-0.5">
                    {[
                        {
                            id: 'collections' as const,
                            label: 'Collections',
                            icon: 'ListBullet' as const,
                        },
                        { id: 'fields' as const, label: 'Fields', icon: 'Tokens' as const },
                        {
                            id: 'sources' as const,
                            label: 'Sources',
                            icon: 'Layers' as const,
                        },
                    ].map((tab, idx, arr) => {
                        const Icon = Icons[tab.icon];
                        const isActive = activeTab === tab.id;
                        return (
                            <React.Fragment key={tab.id}>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab(tab.id)}
                                    className={cn(
                                        'flex h-7 items-center gap-1.5 rounded-sm border px-2.5 text-[11px] transition-colors',
                                        isActive
                                            ? 'bg-background-tab-active border-border-tab-active text-foreground'
                                            : 'text-foreground-secondary hover:text-foreground border-transparent',
                                    )}
                                >
                                    <Icon className="h-3 w-3" />
                                    {tab.label}
                                </button>
                                {idx < arr.length - 1 && (
                                    <div className="bg-border-tab-divider h-3 w-px self-center" />
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
                <button
                    type="button"
                    onClick={onExit}
                    className="hover:bg-background-secondary text-foreground-secondary hover:text-foreground flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px]"
                >
                    <Icons.CrossL className="h-3 w-3" />
                    Close CMS
                </button>
            </div>

            {activeTab === 'collections' && (
                <div className="flex flex-1 overflow-hidden">
                    {/* Collection list */}
                    <div className="border-border bg-background-bar/40 flex w-56 shrink-0 flex-col border-r">
                        <div className="border-border-bar/60 flex h-9 items-center justify-between border-b px-3">
                            <span className="text-foreground-tertiary text-[10px] font-medium tracking-wide uppercase">
                                Collections
                            </span>
                            <button
                                type="button"
                                aria-label="New collection"
                                className="text-foreground-tertiary hover:bg-background-secondary hover:text-foreground flex h-5 w-5 items-center justify-center rounded"
                            >
                                <Icons.Plus className="h-3 w-3" />
                            </button>
                        </div>
                        <div className="flex flex-col gap-0.5 p-1.5">
                            {CMS_COLLECTIONS.map((c) => {
                                const isActive = c.id === activeCollection;
                                return (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => setActiveCollection(c.id)}
                                        className={cn(
                                            'flex flex-col items-stretch rounded px-2 py-1.5 text-left text-[11px] transition-colors',
                                            isActive
                                                ? 'bg-background-bar-active text-foreground'
                                                : 'text-foreground-secondary hover:bg-background-secondary',
                                        )}
                                    >
                                        <div className="flex items-center gap-1.5">
                                            <Icons.Cube className="h-3 w-3 shrink-0" />
                                            <span className="truncate font-medium">{c.name}</span>
                                            <span className="text-foreground-tertiary ml-auto text-[10px] tabular-nums">
                                                {c.count}
                                            </span>
                                        </div>
                                        <div className="text-foreground-tertiary mt-0.5 ml-4.5 truncate font-mono text-[9px]">
                                            {c.slug}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Entries table */}
                    <div className="flex flex-1 flex-col">
                        <div className="border-border bg-background-chrome flex h-10 items-center justify-between border-b px-3">
                            <div className="flex items-center gap-2">
                                <Icons.Cube className="text-foreground-secondary h-3.5 w-3.5" />
                                <span className="text-foreground text-[12px] font-medium capitalize">
                                    {CMS_COLLECTIONS.find((c) => c.id === activeCollection)?.name}
                                </span>
                                <span className="text-foreground-tertiary text-[10px]">
                                    {CMS_COLLECTIONS.find((c) => c.id === activeCollection)?.count}{' '}
                                    entries
                                </span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="border-border bg-background-secondary/60 flex h-6 items-center gap-1.5 rounded-md border px-2">
                                    <Icons.MagnifyingGlass className="text-foreground-tertiary h-3 w-3" />
                                    <span className="text-foreground-tertiary text-[10px]">
                                        Search…
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    className="border-border bg-foreground/95 text-background flex h-6 items-center gap-1 rounded-md border px-2 text-[10px] font-medium"
                                >
                                    <Icons.Plus className="h-3 w-3" />
                                    New entry
                                </button>
                            </div>
                        </div>
                        <div className="border-border bg-background-bar/40 grid h-7 shrink-0 grid-cols-[1fr_5rem_5rem_2rem] items-center border-b px-3 text-[10px]">
                            <span className="text-foreground-tertiary">Title</span>
                            <span className="text-foreground-tertiary">Status</span>
                            <span className="text-foreground-tertiary">Updated</span>
                            <span></span>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {CMS_ENTRIES.map((e) => (
                                <div
                                    key={e.id}
                                    className="border-border/60 hover:bg-background-secondary/40 grid h-9 cursor-pointer grid-cols-[1fr_5rem_5rem_2rem] items-center border-b px-3 text-[11px]"
                                >
                                    <span className="text-foreground truncate">{e.title}</span>
                                    <span
                                        className={cn(
                                            'inline-flex items-center gap-1 text-[10px]',
                                            e.status === 'Published' &&
                                                'text-emerald-600 dark:text-emerald-300',
                                            e.status === 'Draft' && 'text-foreground-tertiary',
                                            e.status === 'Scheduled' &&
                                                'text-amber-600 dark:text-amber-300',
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                'h-1.5 w-1.5 rounded-full',
                                                e.status === 'Published' && 'bg-emerald-400',
                                                e.status === 'Draft' && 'bg-foreground-tertiary',
                                                e.status === 'Scheduled' && 'bg-amber-400',
                                            )}
                                        />
                                        {e.status}
                                    </span>
                                    <span className="text-foreground-tertiary text-[10px] tabular-nums">
                                        {e.updated}
                                    </span>
                                    <Icons.ChevronDown className="text-foreground-tertiary h-3 w-3 -rotate-90" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'fields' && (
                <div className="flex flex-1 flex-col overflow-y-auto p-4">
                    <div className="text-foreground-tertiary mb-2 text-[10px] font-medium tracking-wide uppercase">
                        Schema — {CMS_COLLECTIONS.find((c) => c.id === activeCollection)?.name}
                    </div>
                    <div className="border-border bg-background-chrome max-w-2xl overflow-hidden rounded-md border">
                        {CMS_FIELDS.map((f, i) => (
                            <div
                                key={f.name}
                                className={cn(
                                    'grid grid-cols-[1.5fr_1fr_5rem_2rem] items-center gap-3 px-3 py-2 text-[11px]',
                                    i < CMS_FIELDS.length - 1 && 'border-border/60 border-b',
                                )}
                            >
                                <div className="flex items-center gap-2">
                                    <Icons.Tokens className="text-foreground-tertiary h-3 w-3" />
                                    <span className="text-foreground font-mono">{f.name}</span>
                                </div>
                                <span className="text-foreground-secondary text-[10px]">
                                    {f.type}
                                </span>
                                {f.required ? (
                                    <span className="text-[10px] text-amber-600 dark:text-amber-300">
                                        Required
                                    </span>
                                ) : (
                                    <span className="text-foreground-tertiary text-[10px]">
                                        Optional
                                    </span>
                                )}
                                <Icons.DotsHorizontal className="text-foreground-tertiary h-3 w-3" />
                            </div>
                        ))}
                    </div>
                    <button
                        type="button"
                        className="border-border bg-background-secondary/40 hover:bg-background-secondary text-foreground-secondary mt-2 flex h-8 max-w-2xl items-center justify-center gap-1.5 rounded-md border border-dashed text-[11px]"
                    >
                        <Icons.Plus className="h-3 w-3" />
                        Add field
                    </button>
                </div>
            )}

            {activeTab === 'sources' && (
                <div className="flex flex-1 flex-col gap-3 p-4">
                    <div className="text-foreground-tertiary text-[10px] font-medium tracking-wide uppercase">
                        Connected sources
                    </div>
                    <div className="grid max-w-2xl grid-cols-2 gap-2">
                        {[
                            {
                                name: 'Supabase',
                                status: 'Connected',
                                icon: 'Layers' as const,
                            },
                            { name: 'Notion', status: 'Connected', icon: 'File' as const },
                            {
                                name: 'Airtable',
                                status: 'Not connected',
                                icon: 'Component' as const,
                            },
                            {
                                name: 'Sanity',
                                status: 'Not connected',
                                icon: 'Cube' as const,
                            },
                        ].map((s) => {
                            const Icon = Icons[s.icon] as React.FC<{ className?: string }>;
                            const isConnected = s.status === 'Connected';
                            return (
                                <div
                                    key={s.name}
                                    className="border-border bg-background-chrome flex items-center justify-between gap-2 rounded-md border p-3"
                                >
                                    <div className="flex items-center gap-2">
                                        <Icon className="text-foreground-secondary h-4 w-4" />
                                        <div className="flex flex-col">
                                            <span className="text-foreground text-[12px]">
                                                {s.name}
                                            </span>
                                            <span
                                                className={cn(
                                                    'text-[10px]',
                                                    isConnected
                                                        ? 'text-emerald-600 dark:text-emerald-300'
                                                        : 'text-foreground-tertiary',
                                                )}
                                            >
                                                {s.status}
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        className={cn(
                                            'rounded-md px-2 py-1 text-[10px] font-medium',
                                            isConnected
                                                ? 'text-foreground-tertiary hover:bg-background-secondary'
                                                : 'bg-foreground/95 text-background',
                                        )}
                                    >
                                        {isConnected ? 'Manage' : 'Connect'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

function UserMessage({ text }: { text: string }) {
    return (
        <div className="animate-in fade-in slide-in-from-bottom-1 flex w-full flex-row justify-end px-2 duration-300">
            <div className="bg-background-secondary text-foreground-secondary border-border ml-8 flex w-[80%] flex-col rounded-lg rounded-br-none border-[0.5px] p-2 shadow-sm">
                <div className="text-xs font-light">{text}</div>
            </div>
        </div>
    );
}

function AiMessage({ text, typewriter = false }: { text: string; typewriter?: boolean }) {
    const reduced = usePrefersReducedMotion();
    const [revealed, setRevealed] = useState(typewriter && !reduced ? 0 : text.length);

    useEffect(() => {
        if (!typewriter || reduced) {
            setRevealed(text.length);
            return;
        }
        setRevealed(0);
        let i = 0;
        const id = setInterval(() => {
            i += 1;
            setRevealed(i);
            if (i >= text.length) clearInterval(id);
        }, AI_CHAR_MS);
        return () => clearInterval(id);
    }, [text, typewriter, reduced]);

    const isFullyRevealed = revealed >= text.length;

    return (
        <div className="animate-in fade-in flex w-full flex-row justify-start px-2 duration-500">
            <div className="text-foreground-primary mr-8 flex w-[90%] flex-col rounded-lg rounded-bl-none p-1">
                <div className="mt-1 text-xs leading-4.5 font-light">
                    {text.slice(0, revealed)}
                    {!isFullyRevealed && (
                        <span className="bg-foreground/70 ml-0.5 inline-block h-3 w-px animate-pulse align-middle" />
                    )}
                </div>
            </div>
        </div>
    );
}

function ReasoningMessage({ text, active }: { text: string; active: boolean }) {
    return (
        <div className="animate-in fade-in flex w-full flex-row justify-start px-2 duration-400">
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
                            'animate-shimmer bg-gradient-to-r from-[var(--foreground-secondary)] via-[var(--foreground)] to-[var(--foreground-secondary)] bg-[length:200%_100%] bg-clip-text text-transparent',
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
        <div className="animate-in fade-in slide-in-from-bottom-1 px-2 duration-300">
            <div className="border-border bg-background-secondary/60 relative rounded-md border backdrop-blur">
                <div className="text-foreground-secondary flex items-center justify-between px-2 py-1.5">
                    <div className="flex min-w-0 items-center gap-1.5">
                        {active ? (
                            <Icons.LoadingSpinner className="h-3 w-3 shrink-0 animate-spin" />
                        ) : (
                            <Icons.Check className="text-foreground-brand h-3 w-3 shrink-0" />
                        )}
                        <span className="text-foreground-tertiary text-[10px] font-medium">
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

function ScriptedChat({ messages }: { messages: ChatStep[] }) {
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    return (
        <div
            ref={scrollRef}
            className="flex flex-1 flex-col gap-2 overflow-y-auto py-3"
            style={{ scrollbarWidth: 'none' }}
        >
            {messages.map((step, idx) => {
                const isLast = idx === messages.length - 1;
                if (step.kind === 'user') return <UserMessage key={idx} text={step.text} />;
                if (step.kind === 'ai')
                    return <AiMessage key={idx} text={step.text} typewriter={isLast} />;
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

interface ChatSequenceState {
    messages: ChatStep[];
    composerText: string;
    composerTyping: boolean; // true while typing OR before send (cursor visible)
}

function useChatSequence(onCanvasEffect: (effect: CanvasEffect) => void): ChatSequenceState {
    const reduced = usePrefersReducedMotion();
    const [messages, setMessages] = useState<ChatStep[]>([]);
    const [composerText, setComposerText] = useState('');
    const [composerTyping, setComposerTyping] = useState(true);
    const effectRef = useRef(onCanvasEffect);
    effectRef.current = onCanvasEffect;

    useEffect(() => {
        if (reduced) {
            const last = CHAT_ROUNDS[CHAT_ROUNDS.length - 1]!;
            setMessages([
                { kind: 'user', text: last.prompt },
                ...last.tools.map((t) => ({ kind: 'tool' as const, ...t })),
                { kind: 'ai', text: last.ai },
            ]);
            setComposerText('');
            setComposerTyping(false);
            effectRef.current(last.effect);
            return;
        }

        let cancelled = false;
        const timers: ReturnType<typeof setTimeout>[] = [];
        const intervals: ReturnType<typeof setInterval>[] = [];
        const after = (fn: () => void, delay: number) => {
            const id = setTimeout(() => {
                if (!cancelled) fn();
            }, delay);
            timers.push(id);
            return id;
        };

        const playRound = (idx: number) => {
            if (cancelled) return;
            const round = CHAT_ROUNDS[idx]!;

            // 1. Typewriter prompt into composer.
            setComposerText('');
            setComposerTyping(true);
            let charIdx = 0;
            const typeId = setInterval(() => {
                if (cancelled) {
                    clearInterval(typeId);
                    return;
                }
                charIdx += 1;
                setComposerText(round.prompt.slice(0, charIdx));
                if (charIdx >= round.prompt.length) {
                    clearInterval(typeId);

                    // 2. Pause, then "send": clear composer + push user message.
                    after(() => {
                        setComposerText('');
                        setComposerTyping(false);
                        setMessages((m) => [...m, { kind: 'user', text: round.prompt }]);

                        // 3. Reasoning shimmer.
                        after(() => {
                            setMessages((m) => [
                                ...m,
                                { kind: 'reasoning', text: round.reasoning },
                            ]);
                        }, SEND_TO_REASONING_MS);

                        // 4. Tool calls stagger in.
                        round.tools.forEach((tool, i) => {
                            after(
                                () => {
                                    setMessages((m) => [...m, { kind: 'tool', ...tool }]);
                                    // Trigger canvas effect on last tool.
                                    if (i === round.tools.length - 1) {
                                        effectRef.current(round.effect);
                                    }
                                },
                                SEND_TO_REASONING_MS + REASONING_TO_TOOL_MS + i * TOOL_STAGGER_MS,
                            );
                        });

                        // 5. AI response.
                        const aiDelay =
                            SEND_TO_REASONING_MS +
                            REASONING_TO_TOOL_MS +
                            round.tools.length * TOOL_STAGGER_MS +
                            TOOLS_TO_AI_MS;
                        after(() => {
                            setMessages((m) => [...m, { kind: 'ai', text: round.ai }]);
                        }, aiDelay);

                        // 6. After AI fully typewrites + hold → next round or restart.
                        const aiRevealMs = round.ai.length * AI_CHAR_MS;
                        const totalEnd = aiDelay + aiRevealMs + ROUND_END_HOLD_MS;
                        after(() => {
                            if (idx + 1 >= CHAT_ROUNDS.length) {
                                // Reset for full loop.
                                setMessages([]);
                                playRound(0);
                            } else {
                                playRound(idx + 1);
                            }
                        }, totalEnd);
                    }, POST_TYPE_PAUSE_MS);
                }
            }, TYPE_CHAR_MS);
            intervals.push(typeId);
        };

        playRound(0);
        return () => {
            cancelled = true;
            timers.forEach(clearTimeout);
            intervals.forEach(clearInterval);
        };
    }, [reduced]);

    return { messages, composerText, composerTyping };
}

function StyleSection({
    title,
    icon,
    children,
    defaultOpen = true,
}: {
    title: string;
    icon: keyof typeof Icons;
    children: React.ReactNode;
    defaultOpen?: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);
    const Icon = Icons[icon];
    return (
        <div className="border-border-bar/50 border-b last:border-b-0">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="text-foreground-secondary hover:text-foreground flex w-full items-center justify-between px-2.5 py-1.5 text-[10px] font-medium tracking-wide uppercase transition-colors"
            >
                <span className="flex items-center gap-1.5">
                    <Icon className="text-foreground-tertiary h-3 w-3" />
                    {title}
                </span>
                <Icons.ChevronDown
                    className={cn(
                        'text-foreground-tertiary h-3 w-3 transition-transform',
                        !open && '-rotate-90',
                    )}
                />
            </button>
            {open && <div className="flex flex-col gap-1.5 px-2.5 pb-3">{children}</div>}
        </div>
    );
}

function StyleField({
    label,
    value,
    mono,
    swatch,
    trailing,
}: {
    label: string;
    value: string;
    mono?: boolean;
    swatch?: string;
    trailing?: string;
}) {
    return (
        <div className="border-border bg-background-secondary/60 flex h-7 items-center gap-1.5 rounded px-2 text-[11px]">
            {swatch && <div className={cn('ring-border h-3 w-3 rounded-sm ring-1', swatch)} />}
            <span className="text-foreground-tertiary w-9 shrink-0 text-[10px]">{label}</span>
            <span className={cn('text-foreground flex-1 truncate text-right', mono && 'font-mono')}>
                {value}
            </span>
            {trailing && <span className="text-foreground-tertiary text-[10px]">{trailing}</span>}
        </div>
    );
}

function StylePanel({ selectedLayer }: { selectedLayer?: MockLayer }) {
    return (
        <div className="flex flex-1 flex-col overflow-y-auto">
            <div className="border-border-bar/50 flex items-center gap-2 border-b px-2.5 py-2">
                <NodeIcon
                    iconClass="w-3.5 h-3.5 shrink-0"
                    tagName={selectedLayer?.tagName ?? 'COMPONENT'}
                />
                <span className="text-foreground truncate text-xs">
                    {selectedLayer?.name ?? 'Hero'}
                </span>
                <span className="text-foreground-tertiary ml-auto font-mono text-[9px]">
                    {selectedLayer?.tagName ?? 'COMPONENT'}
                </span>
            </div>
            <StyleSection title="Layout" icon="Layout">
                <div className="grid grid-cols-2 gap-1.5">
                    <StyleField label="W" value="1280" />
                    <StyleField label="H" value="auto" />
                </div>
                <div className="grid grid-cols-3 gap-1">
                    {(['Row', 'Col', 'Grid'] as const).map((d, i) => (
                        <button
                            key={d}
                            type="button"
                            className={cn(
                                'border-border bg-background-secondary/60 hover:bg-background-secondary text-foreground-secondary flex h-7 items-center justify-center rounded text-[10px]',
                                i === 1 && 'text-foreground bg-background-bar-active',
                            )}
                        >
                            {d}
                        </button>
                    ))}
                </div>
            </StyleSection>
            <StyleSection title="Spacing" icon="Frame">
                <div className="grid grid-cols-2 gap-1.5">
                    <StyleField label="Pad" value="32 · 24" />
                    <StyleField label="Gap" value="12" />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                    <StyleField label="Mx" value="auto" />
                    <StyleField label="My" value="0" />
                </div>
            </StyleSection>
            <StyleSection title="Fill" icon="Brand">
                <StyleField
                    label="Color"
                    value="#4F46E5"
                    mono
                    swatch="bg-foreground-brand"
                    trailing="100%"
                />
                <button
                    type="button"
                    className="text-foreground-tertiary hover:text-foreground flex h-6 items-center gap-1 px-1 text-[10px]"
                >
                    <Icons.Plus className="h-2.5 w-2.5" />
                    Add layer
                </button>
            </StyleSection>
            <StyleSection title="Border" icon="Square">
                <div className="grid grid-cols-2 gap-1.5">
                    <StyleField label="Width" value="1" />
                    <StyleField label="Radius" value="12" />
                </div>
                <StyleField label="Color" value="#1F1F22" mono swatch="bg-neutral-900" />
            </StyleSection>
            <StyleSection title="Typography" icon="TextAlignLeft">
                <StyleField label="Font" value="Inter · 600" />
                <div className="grid grid-cols-2 gap-1.5">
                    <StyleField label="Size" value="14" />
                    <StyleField label="Line" value="1.4" />
                </div>
                <div className="grid grid-cols-4 gap-1">
                    {(['L', 'C', 'R', 'J'] as const).map((a, i) => (
                        <button
                            key={a}
                            type="button"
                            className={cn(
                                'border-border bg-background-secondary/60 hover:bg-background-secondary text-foreground-secondary flex h-6 items-center justify-center rounded text-[10px]',
                                i === 1 && 'text-foreground bg-background-bar-active',
                            )}
                        >
                            {a}
                        </button>
                    ))}
                </div>
            </StyleSection>
            <StyleSection title="Effects" icon="Sparkles" defaultOpen={false}>
                <StyleField label="Shadow" value="md · 30%" />
                <StyleField label="Blur" value="0" />
                <StyleField label="Opacity" value="100" trailing="%" />
            </StyleSection>
            <StyleSection title="Position" icon="Layers" defaultOpen={false}>
                <div className="grid grid-cols-2 gap-1.5">
                    <StyleField label="X" value="0" />
                    <StyleField label="Y" value="0" />
                </div>
                <StyleField label="Z" value="auto" />
            </StyleSection>
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
    const [selectedLayer, setSelectedLayer] = useState<string>('hero-title');
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    const [canvasSelected, setCanvasSelected] = useState<'home' | 'mobile' | null>('home');
    const [activeRightTab, setActiveRightTab] = useState<RightTabId>('chat');
    const [activeTool, setActiveTool] = useState<'cursor' | 'hand' | 'comment'>('cursor');
    const [zoomPct, setZoomPct] = useState(75);
    const [previewTheme, setPreviewTheme] = useState<PreviewTheme>('dark');
    const [leftPanelPinned, setLeftPanelPinned] = useState(true);
    const [comments, setComments] = useState<
        {
            id: number;
            x: number;
            y: number;
            text: string;
            author?: string;
            authorColor?: string;
            typingTo?: number;
        }[]
    >(() => [
        {
            id: 1001,
            x: 18,
            y: 16,
            text: 'Make this headline bigger',
            author: 'Mira',
            authorColor: 'bg-pink-500',
        },
        {
            id: 1002,
            x: 72,
            y: 22,
            text: 'Love the new italic — keep it',
            author: 'Kai',
            authorColor: 'bg-purple-500',
        },
    ]);
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

    const [chatModelLabel, setChatModelLabel] = useState('Sonnet 4.6');
    const CHAT_MODELS = ['Sonnet 4.6', 'Opus 4.8', 'GPT-5'];
    const [chatComposerMode, setChatComposerMode] = useState<'Build' | 'Ask' | 'Plan'>('Build');
    const [modeMenuOpen, setModeMenuOpen] = useState(false);
    const [modelMenuOpen, setModelMenuOpen] = useState(false);
    const [imageAttached, setImageAttached] = useState(false);
    const [voiceRecording, setVoiceRecording] = useState(false);
    const [undoKey, setUndoKey] = useState(0);
    const [redoKey, setRedoKey] = useState(0);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [diffOpen, setDiffOpen] = useState(false);
    const [chatComposerOpen, setChatComposerOpen] = useState(false);
    const [presence, setPresence] = useState([
        {
            id: 'm',
            name: 'Mira',
            bg: 'bg-pink-500',
            text: 'text-pink-500',
            border: 'border-pink-500',
            x: 68,
            y: 14,
        },
        {
            id: 'k',
            name: 'Kai',
            bg: 'bg-purple-500',
            text: 'text-purple-500',
            border: 'border-purple-500',
            x: 84,
            y: 72,
        },
        {
            id: 's',
            name: 'Sam',
            bg: 'bg-blue-500',
            text: 'text-blue-500',
            border: 'border-blue-500',
            x: 35,
            y: 52,
        },
    ]);

    // Collaborative actions — only the Hero is "resized" by the active
    // teammate (Mira). Other teammates instead make non-disruptive edits
    // (Kai recolors the Pro card border, Sam tweaks the Starter price).
    // The owner cursor snaps to the target element so it reads as a
    // deliberate, natural collaborative edit instead of a constantly
    // dancing resize handle.
    type CollabAction =
        | {
              kind: 'resize';
              id: string;
              ownerId: string;
              x: number;
              y: number;
              w: number;
              h: number;
          }
        | {
              kind: 'recolor';
              id: string;
              ownerId: string;
              x: number;
              y: number;
              w: number;
              h: number;
              proAccent: string;
          }
        | {
              kind: 'edit-text';
              id: string;
              ownerId: string;
              x: number;
              y: number;
              w: number;
              h: number;
              starterPrice: number;
          };
    const COLLAB_ACTIONS = useRef<CollabAction[]>([
        { kind: 'resize', id: 'hero', ownerId: 'm', x: 22, y: 12, w: 56, h: 22 },
        {
            kind: 'recolor',
            id: 'pro-card',
            ownerId: 'k',
            x: 36,
            y: 70,
            w: 28,
            h: 26,
            proAccent: 'border-purple-400',
        },
        {
            kind: 'edit-text',
            id: 'starter-card',
            ownerId: 's',
            x: 6,
            y: 70,
            w: 28,
            h: 26,
            starterPrice: 5,
        },
    ]).current;
    const [activeActionIdx, setActiveActionIdx] = useState(0);
    useEffect(() => {
        const id = setInterval(() => {
            setActiveActionIdx((i) => (i + 1) % COLLAB_ACTIONS.length);
        }, 4800);
        return () => clearInterval(id);
    }, [COLLAB_ACTIONS.length]);
    const activeCollabAction = COLLAB_ACTIONS[activeActionIdx];

    // Mockup overrides — driven both by chat effects and live collab actions.
    const mockupOverrides: DesignMockupOverrides = {
        ...(activeCollabAction?.kind === 'recolor'
            ? { proAccent: activeCollabAction.proAccent }
            : {}),
        ...(activeCollabAction?.kind === 'edit-text'
            ? { starterPrice: activeCollabAction.starterPrice }
            : {}),
    };

    // Drives the SaaS landing-page mockup — current chat round highlights
    // the section being edited (pricing pulses, hero scales up, cards get
    // an accent border) so the canvas actually reflects the prompt.
    const [currentStep, setCurrentStep] = useState<DesignMockupStep>(null);

    // Chat sequence drives canvas demo: each round triggers a visible canvas change.
    const handleCanvasEffect = useCallback(
        (effect: CanvasEffect) => {
            setCanvasSelected('home');
            setCurrentStep(effect);
            if (effect === 'pricing') {
                setLayers((prev) => {
                    if (prev.some((l) => l.id === 'pricing')) return prev;
                    const footerIdx = prev.findIndex((l) => l.id === 'footer');
                    const inserted: MockLayer = {
                        id: 'pricing',
                        name: 'Pricing Section',
                        tagName: 'COMPONENT',
                        level: 1,
                        isInstance: false,
                    };
                    if (footerIdx < 0) return [...prev, inserted];
                    const next = [...prev];
                    next.splice(footerIdx, 0, inserted);
                    return next;
                });
                setSelectedLayer('pricing');
                setRestyleColor('brand');
                triggerSaved();
            } else if (effect === 'hero') {
                setSelectedLayer('hero-title');
                setRestyleColor('amber');
                triggerSaved();
            } else if (effect === 'restyle') {
                setSelectedLayer('card-pro');
                setRestyleColor('teal');
                triggerSaved();
            }
        },
        [triggerSaved],
    );
    const {
        messages: chatMessages,
        composerText,
        composerTyping,
    } = useChatSequence(handleCanvasEffect);

    const [isPanning, setIsPanning] = useState(false);
    const [isSpacePanning, setIsSpacePanning] = useState(false);
    const [panOffset, setPanOffset] = useState({ x: 20, y: 10 });
    const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
    const canvasRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = canvasRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            e.preventDefault();
            const delta = -e.deltaY;
            setZoomPct((z) => Math.max(25, Math.min(300, Math.round(z + delta * 0.6))));
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, []);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.code !== 'Space' || e.repeat) return;
            const t = e.target as HTMLElement;
            if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
            e.preventDefault();
            setIsSpacePanning(true);
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.code !== 'Space') return;
            setIsSpacePanning(false);
            setIsPanning(false);
        };
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
        };
    }, []);

    useEffect(() => {
        const waypoints = [
            [
                { x: 68, y: 14 },
                { x: 42, y: 32 },
                { x: 55, y: 58 },
                { x: 76, y: 44 },
                { x: 32, y: 25 },
            ],
            [
                { x: 84, y: 72 },
                { x: 62, y: 80 },
                { x: 48, y: 65 },
                { x: 70, y: 50 },
                { x: 85, y: 85 },
            ],
            [
                { x: 35, y: 52 },
                { x: 22, y: 38 },
                { x: 50, y: 28 },
                { x: 18, y: 70 },
                { x: 40, y: 60 },
            ],
        ];
        const indices = [0, 0, 0];
        const timers: ReturnType<typeof setInterval>[] = [];
        waypoints.forEach((pts, i) => {
            const t = setInterval(
                () => {
                    indices[i] = ((indices[i] ?? 0) + 1) % pts.length;
                    const pos = pts[indices[i]]!;
                    setPresence((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...pos } : p)));
                },
                2400 + i * 1100,
            );
            timers.push(t);
        });
        return () => timers.forEach(clearInterval);
    }, []);

    // Live typing comment — Sam writes a comment in real time, then it
    // settles into the comment list. Loops so the canvas always feels
    // alive without spawning endless bubbles.
    useEffect(() => {
        const fullText = "Bump the 'Choose plan' button up a touch";
        let cancelled = false;
        let charTimer: ReturnType<typeof setInterval> | null = null;
        let restartTimer: ReturnType<typeof setTimeout> | null = null;

        const start = () => {
            if (cancelled) return;
            const id = Date.now();
            setComments((prev) => [
                ...prev,
                {
                    id,
                    x: 50,
                    y: 86,
                    text: '',
                    author: 'Sam',
                    authorColor: 'bg-blue-500',
                    typingTo: fullText.length,
                },
            ]);
            setOpenCommentId(id);
            let i = 0;
            charTimer = setInterval(() => {
                if (cancelled) return;
                i += 1;
                setComments((prev) =>
                    prev.map((c) => (c.id === id ? { ...c, text: fullText.slice(0, i) } : c)),
                );
                if (i >= fullText.length && charTimer) {
                    clearInterval(charTimer);
                    charTimer = null;
                    // Settle: drop typing flag, then auto-close after pause.
                    setComments((prev) =>
                        prev.map((c) => (c.id === id ? { ...c, typingTo: undefined } : c)),
                    );
                    restartTimer = setTimeout(() => {
                        if (cancelled) return;
                        setOpenCommentId((cur) => (cur === id ? null : cur));
                        // Long pause, then remove + start a new round.
                        restartTimer = setTimeout(() => {
                            if (cancelled) return;
                            setComments((prev) => prev.filter((c) => c.id !== id));
                            start();
                        }, 6000);
                    }, 2400);
                }
            }, 55);
        };

        const initial = setTimeout(start, 5200);
        return () => {
            cancelled = true;
            clearTimeout(initial);
            if (charTimer) clearInterval(charTimer);
            if (restartTimer) clearTimeout(restartTimer);
        };
    }, []);

    const handleMouseDown = (e: React.MouseEvent) => {
        const isMiddle = e.button === 1;
        if (!isMiddle && activeTool !== 'hand' && !isSpacePanning) return;
        if (!isMiddle && (e.target as HTMLElement).closest('[data-canvas-element]')) return;
        if (!isMiddle && (e.target as HTMLElement).closest('[data-restyle-pill]')) return;
        if (isMiddle) e.preventDefault();
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
                'bg-background-canvas border-border relative aspect-[16/10] w-full overflow-hidden rounded-t-[12px] rounded-b-none border border-b-0 shadow-2xl transition-all duration-1000 ease-out select-none',
                isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0',
            )}
        >
            {/* Mode-swapped canvas content */}
            {activeMode === 'code' && <CodeModePanel />}
            {activeMode === 'preview' && (
                <PreviewModePanel onExit={() => setActiveMode('design')} />
            )}
            {activeMode === 'cms' && <CmsModePanel onExit={() => setActiveMode('design')} />}
            {/* Canvas content (behind chrome) — Design mode */}
            <div
                className={cn(
                    'pointer-events-none absolute inset-0 right-44 z-0 mt-30 flex items-start justify-center gap-12 select-none',
                    activeMode !== 'design' && 'hidden',
                )}
                style={{
                    transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomPct / 100})`,
                    transformOrigin: '50% 0%',
                    transition: isPanning ? 'none' : 'transform 0.15s ease-out',
                }}
            >
                <div
                    data-canvas-element
                    className={cn(
                        'pointer-events-auto relative flex flex-col items-center rounded-sm border shadow-xl shadow-black/50 transition-colors',
                        homeBorderClass,
                    )}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        setCanvasSelected('home');
                        if (activeTool === 'comment') {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const x = ((e.clientX - rect.left) / rect.width) * 100;
                            const y = ((e.clientY - rect.top) / rect.height) * 100;
                            setComments((prev) => [
                                ...prev,
                                { id: Date.now(), x, y, text: 'New comment' },
                            ]);
                            setActiveRightTab('comments');
                            setActiveTool('cursor');
                        }
                    }}
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
                            <span className="text-foreground-tertiary px-1.5 text-[10px] font-medium">
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
                    <DesignMockup
                        step={currentStep}
                        accent={selectedRestyle.className}
                        overrides={mockupOverrides}
                        theme={previewTheme}
                    />
                    {/* Comments anchored to the artboard so they pan/zoom
                        with it. Bubble opens on hover (or while a teammate
                        is typing); click acts as pin. */}
                    {comments.map((c) => {
                        const isTyping = typeof c.typingTo === 'number';
                        const isOpen = openCommentId === c.id;
                        const bubbleColor = c.authorColor ?? 'bg-foreground-brand';
                        return (
                            <div
                                key={c.id}
                                style={{ left: `${c.x}%`, top: `${c.y}%` }}
                                className="pointer-events-auto absolute z-20 -translate-x-1/2 -translate-y-full"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                                onMouseEnter={() => setOpenCommentId(c.id)}
                                onMouseLeave={() => {
                                    if (!isTyping) {
                                        setOpenCommentId((id) => (id === c.id ? null : id));
                                    }
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenCommentId((id) => (id === c.id ? null : c.id));
                                    }}
                                    className={cn(
                                        'text-background flex h-6 w-6 items-center justify-center rounded-full rounded-bl-none shadow-lg ring-2 ring-white/20 transition-transform hover:scale-105',
                                        bubbleColor,
                                    )}
                                    aria-label={`Comment from ${c.author ?? 'You'}`}
                                >
                                    {isTyping ? (
                                        <span className="flex items-center gap-0.5">
                                            <span className="h-1 w-1 animate-pulse rounded-full bg-white" />
                                            <span
                                                className="h-1 w-1 animate-pulse rounded-full bg-white"
                                                style={{ animationDelay: '120ms' }}
                                            />
                                            <span
                                                className="h-1 w-1 animate-pulse rounded-full bg-white"
                                                style={{ animationDelay: '240ms' }}
                                            />
                                        </span>
                                    ) : (
                                        <Icons.ChatBubble className="h-3 w-3" />
                                    )}
                                </button>
                                {(isOpen || isTyping) && (
                                    <div className="border-border bg-background-chrome absolute top-7 left-0 z-50 w-48 rounded-md border p-2 shadow-xl">
                                        <div className="mb-1 flex items-center gap-1.5">
                                            <span
                                                className={cn('h-3 w-3 rounded-full', bubbleColor)}
                                            />
                                            <span className="text-foreground text-[10px] font-medium">
                                                {c.author ?? 'You'}
                                            </span>
                                            <span className="text-foreground-tertiary ml-auto text-[9px]">
                                                {isTyping ? 'typing…' : 'just now'}
                                            </span>
                                        </div>
                                        <p className="text-foreground-secondary text-[11px] leading-snug">
                                            {c.text}
                                            {isTyping && (
                                                <span className="bg-foreground/70 ml-0.5 inline-block h-3 w-px animate-pulse align-middle" />
                                            )}
                                        </p>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {/* Active collaborative action — only the resize kind
                        renders the four-handle selection box on the Hero.
                        Recolor/edit-text actions show a subtle outline +
                        the owner cursor on the target, so changes read as
                        a natural edit instead of a moving resize box. */}
                    {activeCollabAction &&
                        (() => {
                            const action = activeCollabAction;
                            const owner = presence.find((p) => p.id === action.ownerId);
                            if (!owner) return null;
                            const isResize = action.kind === 'resize';
                            return (
                                <div
                                    className="pointer-events-none absolute z-[15]"
                                    style={{
                                        left: `${action.x}%`,
                                        top: `${action.y}%`,
                                        width: `${action.w}%`,
                                        height: `${action.h}%`,
                                        transition:
                                            'left 0.55s cubic-bezier(0.22, 1, 0.36, 1), top 0.55s cubic-bezier(0.22, 1, 0.36, 1), width 0.55s cubic-bezier(0.22, 1, 0.36, 1), height 0.55s cubic-bezier(0.22, 1, 0.36, 1)',
                                    }}
                                >
                                    <div
                                        className={cn(
                                            'absolute inset-0 rounded-[2px]',
                                            isResize
                                                ? 'border-[1.5px]'
                                                : 'border-[1px] border-dashed opacity-70',
                                            owner.border,
                                        )}
                                    />
                                    {isResize &&
                                        [
                                            { left: 0, top: 0 },
                                            { left: '100%', top: 0 },
                                            { left: 0, top: '100%' },
                                            { left: '100%', top: '100%' },
                                        ].map((c, i) => (
                                            <div
                                                key={i}
                                                className={cn(
                                                    'absolute h-1.5 w-1.5 rounded-sm border border-white shadow-sm',
                                                    owner.bg,
                                                )}
                                                style={{
                                                    left: c.left,
                                                    top: c.top,
                                                    transform: 'translate(-50%, -50%)',
                                                }}
                                            />
                                        ))}
                                </div>
                            );
                        })()}
                    {/* Live collaborator cursors — fake presence. Active
                        owner cursor snaps to its action target; others keep
                        wandering via waypoints. */}
                    {presence.map((p) => {
                        const action = activeCollabAction;
                        const isOwner = action?.ownerId === p.id;
                        const isResize = isOwner && action?.kind === 'resize';
                        const x = isOwner && action ? action.x + action.w : p.x;
                        const y =
                            isOwner && action
                                ? isResize
                                    ? action.y + action.h
                                    : action.y + action.h / 2
                                : p.y;
                        return (
                            <div
                                key={p.id}
                                className="pointer-events-none absolute z-20 -translate-x-[2px] -translate-y-[2px]"
                                style={{
                                    left: `${x}%`,
                                    top: `${y}%`,
                                    transition:
                                        'left 0.9s cubic-bezier(0.25, 0.1, 0.25, 1), top 0.9s cubic-bezier(0.25, 0.1, 0.25, 1)',
                                }}
                            >
                                <svg
                                    className={cn(
                                        'h-5 w-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]',
                                        p.text,
                                    )}
                                    viewBox="0 0 16 16"
                                    fill="currentColor"
                                >
                                    <path d="M2 2 L14 7 L8.5 9 L7 14 Z" />
                                </svg>
                                <span
                                    className={cn(
                                        'ml-1.5 inline-block rounded-md px-1.5 py-px text-[9px] font-medium text-white ring-1 ring-white/10',
                                        p.bg,
                                    )}
                                >
                                    {p.name}
                                </span>
                            </div>
                        );
                    })}
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
                    <DesignMockupMobile theme={previewTheme} />
                </div>
            </div>

            {/* Top Bar */}
            <div className="border-border bg-background-chrome relative z-10 grid h-12 grid-cols-3 items-center border-b px-3 backdrop-blur-xl">
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
                </div>

                <ModeToggle activeMode={activeMode} onChange={setActiveMode} />

                {/* Right cluster: undo/redo, history, diff, git, CMS, preview, members, avatar, Publish */}
                <div className="flex items-center justify-end gap-0.5">
                    <button
                        onClick={() => {
                            setUndoKey((k) => k + 1);
                            triggerSaved();
                        }}
                        className="hover:bg-background-secondary text-foreground-secondary hover:text-foreground rounded-md p-1.5"
                        aria-label="Undo"
                    >
                        <Icons.Reset
                            key={`u${undoKey}`}
                            className="h-3.5 w-3.5 [animation:spin_0.4s_ease-out_1]"
                        />
                    </button>
                    <button
                        onClick={() => {
                            setRedoKey((k) => k + 1);
                            triggerSaved();
                        }}
                        className="hover:bg-background-secondary text-foreground-secondary hover:text-foreground rounded-md p-1.5"
                        aria-label="Redo"
                    >
                        <Icons.Reset
                            key={`r${redoKey}`}
                            className="h-3.5 w-3.5 scale-x-[-1] [animation:spin_0.4s_ease-out_1]"
                        />
                    </button>
                    <div className="bg-border/60 mx-1 h-4 w-px" />
                    <button
                        onClick={() => setHistoryOpen((v) => !v)}
                        className={cn(
                            'hover:bg-background-secondary hover:text-foreground rounded-md p-1.5',
                            historyOpen
                                ? 'bg-background-secondary text-foreground'
                                : 'text-foreground-secondary',
                        )}
                        aria-label="Version history"
                    >
                        <Icons.CounterClockwiseClock className="h-3.5 w-3.5" />
                    </button>
                    <button
                        onClick={() => setDiffOpen((v) => !v)}
                        className={cn(
                            'hover:bg-background-secondary hover:text-foreground relative rounded-md p-1.5',
                            diffOpen
                                ? 'bg-background-secondary text-foreground'
                                : 'text-foreground-secondary',
                        )}
                        aria-label="Diff"
                    >
                        <Icons.Code className="h-3.5 w-3.5" />
                        <span className="absolute -top-0.5 -right-0.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-emerald-500 px-1 text-[8px] font-medium text-white">
                            3
                        </span>
                    </button>
                    <div className="bg-border/60 mx-1 h-4 w-px" />
                    {/* Preview toggle — muted outlined, sits before members */}
                    <button
                        type="button"
                        onClick={() =>
                            setActiveMode((m) => (m === 'preview' ? 'design' : 'preview'))
                        }
                        className={cn(
                            'mr-1 flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] transition-colors',
                            activeMode === 'preview'
                                ? 'border-border bg-background-secondary text-foreground'
                                : 'border-border/60 text-foreground-secondary hover:bg-background-secondary hover:text-foreground',
                        )}
                    >
                        <Icons.EyeOpen className="h-3 w-3" />
                        Preview
                    </button>
                    {/* Members avatar stack — matches presence cursor colors */}
                    <div className="mr-1 flex -space-x-1.5">
                        <div className="ring-background-chrome h-5 w-5 rounded-full bg-pink-500 ring-2" />
                        <div className="ring-background-chrome h-5 w-5 rounded-full bg-purple-500 ring-2" />
                        <div className="ring-background-chrome h-5 w-5 rounded-full bg-blue-500 ring-2" />
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
            <div className="relative flex h-[calc(100%-3rem)]">
                {/* Sidebar rail */}
                <div className="bg-background-chrome border-border-bar flex h-full w-12 flex-col items-center justify-between border-r py-2 backdrop-blur-xl">
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
                                        'flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition-colors',
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
                            <span className="text-foreground flex items-center gap-1.5 text-[11px] font-medium">
                                {TAB_DEFS.find((t) => t.id === activeTab)?.label}
                                {activeTab === 'layers' && (
                                    <span className="text-foreground-tertiary text-[9px] tabular-nums">
                                        {layers.length}
                                    </span>
                                )}
                            </span>
                            <div className="flex items-center gap-0.5">
                                <button
                                    type="button"
                                    aria-label="Filter"
                                    className="text-foreground-tertiary hover:bg-background-secondary hover:text-foreground flex h-6 w-6 items-center justify-center rounded-md"
                                >
                                    <Icons.MagnifyingGlass className="h-3 w-3" />
                                </button>
                                <button
                                    type="button"
                                    aria-label="Add"
                                    className="text-foreground-tertiary hover:bg-background-secondary hover:text-foreground flex h-6 w-6 items-center justify-center rounded-md"
                                >
                                    <Icons.Plus className="h-3 w-3" />
                                </button>
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
                        </div>
                        {activeTab === 'layers' && (
                            <div className="border-border-bar/40 flex items-center gap-1 border-b px-2.5 py-1.5 text-[10px]">
                                <span className="text-foreground-tertiary">Home</span>
                                <Icons.ChevronDown className="text-foreground-tertiary h-2.5 w-2.5 -rotate-90" />
                                <span className="text-foreground-secondary truncate">
                                    {selectedLayerData?.name ?? 'Hero'}
                                </span>
                            </div>
                        )}
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
                                        const hasChildren =
                                            layers[index + 1] !== undefined &&
                                            layers[index + 1]!.level > layer.level;
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
                                                    'group flex h-5.5 cursor-grab items-center rounded px-1 text-xs transition-colors select-none active:cursor-grabbing',
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
                                                <div style={{ width: `${layer.level * 10}px` }} />
                                                {hasChildren ? (
                                                    <Icons.ChevronDown className="mr-0.5 h-2.5 w-2.5 shrink-0 opacity-70" />
                                                ) : (
                                                    <span className="mr-0.5 inline-block h-2.5 w-2.5 shrink-0" />
                                                )}
                                                <NodeIcon
                                                    iconClass="w-3 h-3 mr-1.5 shrink-0"
                                                    tagName={layer.tagName}
                                                />
                                                <span className="truncate">{layer.name}</span>
                                                {layer.isInstance && (
                                                    <span
                                                        className={cn(
                                                            'ml-auto h-1.5 w-1.5 shrink-0 rounded-full',
                                                            isSelected
                                                                ? 'bg-background-primary/70'
                                                                : 'bg-purple-400/70',
                                                        )}
                                                        title="Instance"
                                                    />
                                                )}
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
                                                <span className="bg-foreground-brand/20 text-foreground-brand rounded-sm px-1 text-[9px] font-medium">
                                                    {p.badge}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {activeTab === 'components' && (
                                <div className="flex flex-col gap-2">
                                    <div className="border-border bg-background-secondary/40 flex h-6 items-center gap-1.5 rounded-md border px-2">
                                        <Icons.MagnifyingGlass className="text-foreground-tertiary h-3 w-3" />
                                        <span className="text-foreground-tertiary text-[10px]">
                                            Search components
                                        </span>
                                    </div>
                                    <div>
                                        <div className="text-foreground-tertiary mb-1 px-1 text-[9px] font-medium tracking-wide uppercase">
                                            Project · {COMPONENT_CHIPS.length}
                                        </div>
                                        <div className="grid grid-cols-2 gap-1.5">
                                            {COMPONENT_CHIPS.map((c) => (
                                                <button
                                                    key={c}
                                                    className="bg-background-secondary/60 hover:bg-background-secondary border-border text-foreground-secondary hover:text-foreground flex aspect-square flex-col items-center justify-center gap-1 rounded-md border-[0.5px] p-1 text-[10px] transition-colors"
                                                >
                                                    <Icons.Component className="h-3.5 w-3.5 text-purple-400" />
                                                    {c}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                            {activeTab === 'insert' && (
                                <div className="flex flex-col gap-2">
                                    <div>
                                        <div className="text-foreground-tertiary mb-1 px-1 text-[9px] font-medium tracking-wide uppercase">
                                            Primitives
                                        </div>
                                        <div className="grid grid-cols-2 gap-1">
                                            {[
                                                { label: 'Frame', icon: 'Frame' as const },
                                                { label: 'Text', icon: 'TextAlignLeft' as const },
                                                { label: 'Image', icon: 'Image' as const },
                                                { label: 'Button', icon: 'Plus' as const },
                                            ].map((item) => {
                                                const Icon = Icons[item.icon];
                                                return (
                                                    <button
                                                        key={item.label}
                                                        className="border-border bg-background-secondary/60 hover:bg-background-secondary text-foreground-secondary hover:text-foreground flex aspect-square flex-col items-center justify-center gap-1 rounded-md border-[0.5px] text-[10px]"
                                                    >
                                                        <Icon className="h-3.5 w-3.5" />
                                                        {item.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-foreground-tertiary mb-1 px-1 text-[9px] font-medium tracking-wide uppercase">
                                            Layout
                                        </div>
                                        <div className="flex flex-col gap-0.5">
                                            {['Section', 'Container', 'Grid', 'Stack'].map((l) => (
                                                <button
                                                    key={l}
                                                    className="hover:bg-background-secondary text-foreground-secondary hover:text-foreground flex h-6 items-center gap-2 rounded px-1.5 text-[11px]"
                                                >
                                                    <Icons.Layout className="h-3 w-3" />
                                                    {l}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
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

                {/* Canvas — captures wheel zoom + pan tool */}
                <div
                    ref={canvasRef}
                    className={cn(
                        'relative flex flex-1 flex-col items-center justify-start',
                        activeTool === 'cursor' && !isSpacePanning && 'cursor-default',
                        (activeTool === 'hand' || isSpacePanning) && !isPanning && 'cursor-grab',
                        (activeTool === 'hand' || isSpacePanning) && isPanning && 'cursor-grabbing',
                        activeTool === 'comment' && !isSpacePanning && 'cursor-crosshair',
                    )}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                />

                {/* Zoom-to-fit floating chip — appears when zoomed off 100% */}
                {activeMode === 'design' && zoomPct !== 75 && (
                    <button
                        type="button"
                        onClick={() => {
                            setZoomPct(75);
                            setPanOffset({ x: 20, y: 10 });
                        }}
                        className="border-border-bar bg-background-bar text-foreground-secondary hover:bg-background-bar-active hover:text-foreground absolute right-[300px] bottom-16 z-30 flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] shadow-md backdrop-blur-2xl"
                    >
                        <Icons.Frame className="h-3 w-3" />
                        Reset view
                    </button>
                )}

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
                        <div className="border-border-bar z-20 flex h-10 items-center justify-between gap-1 border-b px-2">
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
                        {activeRightTab === 'chat' && <ScriptedChat messages={chatMessages} />}
                        {activeRightTab === 'style' && (
                            <StylePanel selectedLayer={selectedLayerData} />
                        )}
                        {activeRightTab === 'comments' && (
                            <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-2">
                                {comments.length === 0 && (
                                    <div className="text-foreground-tertiary mt-12 flex flex-col items-center gap-1.5 text-center">
                                        <Icons.ChatBubble className="h-5 w-5" />
                                        <span className="text-foreground-secondary text-[11px]">
                                            No comments yet
                                        </span>
                                        <span className="text-[10px]">
                                            Pick the comment tool and click the canvas.
                                        </span>
                                    </div>
                                )}
                                {comments.map((c) => (
                                    <button
                                        type="button"
                                        key={c.id}
                                        onClick={() => setOpenCommentId(c.id)}
                                        className={cn(
                                            'border-border hover:bg-background-secondary/60 flex flex-col items-stretch gap-1 rounded-md border p-2 text-left transition-colors',
                                            openCommentId === c.id && 'bg-background-secondary/60',
                                        )}
                                    >
                                        <div className="flex items-center gap-1.5">
                                            <div className="bg-foreground-brand h-4 w-4 rounded-full rounded-bl-none" />
                                            <span className="text-foreground text-[11px] font-medium">
                                                You
                                            </span>
                                            <span className="text-foreground-tertiary ml-auto text-[9px]">
                                                just now
                                            </span>
                                        </div>
                                        <p className="text-foreground-secondary text-[11px] leading-snug">
                                            {c.text}
                                        </p>
                                    </button>
                                ))}
                            </div>
                        )}
                        {activeRightTab === 'chat' && (
                            <div className="px-2 pb-2">
                                <div
                                    className={cn(
                                        'bg-background-secondary border-foreground-primary/5 focus-within:border-border flex flex-col rounded-[8px] border transition-colors duration-200',
                                        chatComposerOpen && 'border-border bg-background-bar',
                                    )}
                                >
                                    {/* Context pill row */}
                                    <div className="flex flex-wrap items-center gap-1 px-2 pt-1.5">
                                        <span className="border-foreground-brand/30 bg-foreground-brand/15 text-foreground flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px]">
                                            <Icons.File className="text-foreground-brand h-2.5 w-2.5" />
                                            Hero.tsx
                                            <button
                                                type="button"
                                                aria-label="Remove context"
                                                onClick={(e) => e.stopPropagation()}
                                                className="text-foreground-tertiary hover:text-foreground -mr-0.5 ml-0.5"
                                            >
                                                <Icons.CrossL className="h-2 w-2" />
                                            </button>
                                        </span>
                                        {imageAttached && (
                                            <span className="flex items-center gap-1 rounded-sm border border-pink-500/30 bg-pink-500/10 px-1.5 py-0.5 text-[10px] text-pink-300">
                                                <Icons.Image className="h-2.5 w-2.5" />
                                                screenshot.png
                                                <button
                                                    type="button"
                                                    aria-label="Remove image"
                                                    onClick={() => setImageAttached(false)}
                                                    className="-mr-0.5 ml-0.5 text-pink-300/70 hover:text-pink-200"
                                                >
                                                    <Icons.CrossL className="h-2 w-2" />
                                                </button>
                                            </span>
                                        )}
                                        <button
                                            type="button"
                                            className="text-foreground-tertiary hover:text-foreground inline-flex h-5 items-center gap-0.5 rounded px-1 text-[10px]"
                                            aria-label="Add context"
                                        >
                                            <Icons.Plus className="h-2.5 w-2.5" />@ add
                                        </button>
                                    </div>
                                    <div
                                        role="textbox"
                                        aria-readonly="true"
                                        tabIndex={0}
                                        onFocus={() => setChatComposerOpen(true)}
                                        onBlur={() => setChatComposerOpen(false)}
                                        onClick={() => setChatComposerOpen(true)}
                                        className="text-foreground-primary relative min-h-[44px] w-full cursor-text resize-none rounded-md bg-transparent px-2 py-1.5 text-[12px] leading-snug outline-none"
                                    >
                                        {composerText || (
                                            <span className="text-foreground-primary/50">
                                                Describe what you want to build
                                            </span>
                                        )}
                                        {composerTyping && (
                                            <span className="bg-foreground/70 ml-0.5 inline-block h-3 w-px animate-pulse align-middle" />
                                        )}
                                    </div>
                                    {/* Bottom controls — mirrors real composer */}
                                    <div className="flex w-full items-center justify-between gap-1 px-1.5 pt-0.5 pb-1.5">
                                        <div className="flex min-w-0 items-center gap-0.5">
                                            <div className="relative">
                                                <button
                                                    type="button"
                                                    aria-label="Mode menu"
                                                    onClick={() => {
                                                        setModeMenuOpen((v) => !v);
                                                        setModelMenuOpen(false);
                                                    }}
                                                    onBlur={() =>
                                                        setTimeout(
                                                            () => setModeMenuOpen(false),
                                                            120,
                                                        )
                                                    }
                                                    className={cn(
                                                        'text-foreground-tertiary hover:bg-background-tertiary hover:text-foreground-primary flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px]',
                                                        modeMenuOpen &&
                                                            'bg-background-tertiary text-foreground-primary',
                                                    )}
                                                >
                                                    {chatComposerMode === 'Build' && (
                                                        <Icons.Build className="h-3 w-3" />
                                                    )}
                                                    {chatComposerMode === 'Ask' && (
                                                        <Icons.Ask className="h-3 w-3" />
                                                    )}
                                                    {chatComposerMode === 'Plan' && (
                                                        <Icons.Plan className="h-3 w-3" />
                                                    )}
                                                    <span>{chatComposerMode}</span>
                                                    <Icons.ChevronDown className="h-2.5 w-2.5" />
                                                </button>
                                                {modeMenuOpen && (
                                                    <div className="border-border bg-background-chrome absolute bottom-full left-0 z-50 mb-1 flex w-[140px] flex-col rounded-md border p-1 shadow-xl">
                                                        {(['Build', 'Ask', 'Plan'] as const).map(
                                                            (m) => {
                                                                const ModeIcon =
                                                                    m === 'Build'
                                                                        ? Icons.Build
                                                                        : m === 'Ask'
                                                                          ? Icons.Ask
                                                                          : Icons.Plan;
                                                                const active =
                                                                    chatComposerMode === m;
                                                                return (
                                                                    <button
                                                                        key={m}
                                                                        type="button"
                                                                        onMouseDown={() => {
                                                                            setChatComposerMode(m);
                                                                            setModeMenuOpen(false);
                                                                        }}
                                                                        className={cn(
                                                                            'hover:bg-background-bar-active flex items-center gap-2 rounded-sm px-2 py-1 text-left text-[11px]',
                                                                            active
                                                                                ? 'text-foreground-primary'
                                                                                : 'text-foreground-secondary',
                                                                        )}
                                                                    >
                                                                        <ModeIcon className="h-3 w-3" />
                                                                        <span className="flex-1">
                                                                            {m}
                                                                        </span>
                                                                        {active && (
                                                                            <Icons.Check className="text-foreground-brand h-3 w-3" />
                                                                        )}
                                                                    </button>
                                                                );
                                                            },
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="relative">
                                                <button
                                                    type="button"
                                                    aria-label="Model"
                                                    onClick={() => {
                                                        setModelMenuOpen((v) => !v);
                                                        setModeMenuOpen(false);
                                                    }}
                                                    onBlur={() =>
                                                        setTimeout(
                                                            () => setModelMenuOpen(false),
                                                            120,
                                                        )
                                                    }
                                                    className={cn(
                                                        'text-foreground-tertiary hover:bg-background-tertiary hover:text-foreground-primary flex h-6 min-w-0 items-center gap-1 rounded-md px-1.5 text-[11px]',
                                                        modelMenuOpen &&
                                                            'bg-background-tertiary text-foreground-primary',
                                                    )}
                                                >
                                                    <span className="max-w-[64px] truncate">
                                                        {chatModelLabel}
                                                    </span>
                                                    <Icons.ChevronDown className="h-2.5 w-2.5 shrink-0" />
                                                </button>
                                                {modelMenuOpen && (
                                                    <div className="border-border bg-background-chrome absolute bottom-full left-0 z-50 mb-1 flex w-[160px] flex-col rounded-md border p-1 shadow-xl">
                                                        {CHAT_MODELS.map((m) => {
                                                            const active = chatModelLabel === m;
                                                            return (
                                                                <button
                                                                    key={m}
                                                                    type="button"
                                                                    onMouseDown={() => {
                                                                        setChatModelLabel(m);
                                                                        setModelMenuOpen(false);
                                                                    }}
                                                                    className={cn(
                                                                        'hover:bg-background-bar-active flex items-center gap-2 rounded-sm px-2 py-1 text-left text-[11px]',
                                                                        active
                                                                            ? 'text-foreground-primary'
                                                                            : 'text-foreground-secondary',
                                                                    )}
                                                                >
                                                                    <Icons.Sparkles className="text-foreground-tertiary h-3 w-3" />
                                                                    <span className="flex-1 truncate">
                                                                        {m}
                                                                    </span>
                                                                    {active && (
                                                                        <Icons.Check className="text-foreground-brand h-3 w-3" />
                                                                    )}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                aria-label="Attach image"
                                                onClick={() => setImageAttached((v) => !v)}
                                                className={cn(
                                                    'hover:bg-background-tertiary hover:text-foreground-primary flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
                                                    imageAttached
                                                        ? 'text-foreground-primary bg-background-tertiary/60'
                                                        : 'text-foreground-tertiary',
                                                )}
                                            >
                                                <Icons.Image className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-0.5">
                                            <button
                                                type="button"
                                                aria-label="Voice"
                                                onClick={() => setVoiceRecording((v) => !v)}
                                                className={cn(
                                                    'hover:bg-background-tertiary flex h-6 w-6 items-center justify-center rounded-md',
                                                    voiceRecording
                                                        ? 'bg-pink-500/15 text-pink-300'
                                                        : 'text-foreground-tertiary hover:text-foreground-primary',
                                                )}
                                            >
                                                {voiceRecording ? (
                                                    <span className="h-2 w-2 animate-pulse rounded-full bg-pink-400" />
                                                ) : (
                                                    <Icons.Microphone className="h-3.5 w-3.5" />
                                                )}
                                            </button>
                                            <button
                                                type="button"
                                                aria-label="Send"
                                                className="bg-foreground text-background hover:bg-foreground/90 flex h-6 w-6 items-center justify-center rounded-full"
                                            >
                                                <Icons.ArrowRight className="h-3 w-3" />
                                            </button>
                                        </div>
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
