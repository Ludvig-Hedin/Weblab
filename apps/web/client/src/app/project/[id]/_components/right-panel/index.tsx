'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { EditorMode } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons/index';
import { ResizablePanel } from '@weblab/ui/resizable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@weblab/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import type { Id } from '@convex/_generated/dataModel';
import { useEditorEngine } from '@/components/store/editor';
import { env } from '@/env';
import { transKeys } from '@/i18n/keys';
import { DropdownManagerProvider } from '../editor-bar/hooks/use-dropdown-manager';
import { ChatTab } from './chat-tab';
import { ChatControls } from './chat-tab/controls';
import { FIX_ERRORS_EVENT } from './chat-tab/error';
import { ChatHistory } from './chat-tab/history';
import { ChatPanelDropdown } from './chat-tab/panel-dropdown';

// Style tab is not the default active tab — defer its module load until the
// user switches to it. Each tab is only rendered when its value is active
// (see TabsContent guards below), so this is a pure bundle-split win with no
// UX cost.
//
// Module-scope flag check so the chosen panel is decided once at bundle eval —
// avoids a render-time conditional and lets `dynamic()` keep its lazy chunk.
const StyleTab = env.NEXT_PUBLIC_STYLE_PANEL_V4
    ? dynamic(() => import('./style-tab-v4').then((m) => m.StyleTabV4), {
          ssr: false,
      })
    : env.NEXT_PUBLIC_STYLE_PANEL_V3
      ? dynamic(() => import('./style-tab-v3').then((m) => m.StyleTabV3), {
            ssr: false,
        })
      : dynamic(() => import('./style-tab-v2').then((m) => m.StyleTabV2), {
            ssr: false,
        });
const CommentsTab = dynamic(() => import('./comments-tab').then((m) => m.CommentsTab), {
    ssr: false,
});
const InteractionsTab = dynamic(() => import('./interactions-tab').then((m) => m.InteractionsTab), {
    ssr: false,
});

type RightPanelTab = 'style' | 'interactions' | 'chat';

const DEFAULT_PANEL_WIDTH = 352;
// While the project is being scaffolded from a prompt the chat is the primary
// surface — give it more room than the standard sidebar so the user clearly
// sees the AI picking up their request.
const FIRST_CREATION_PANEL_WIDTH = 460;

// Width bounds mirror the <ResizablePanel> min/max below; restored values are
// clamped to these so a stale or hand-edited localStorage entry can never push
// the panel outside its allowed range.
const PANEL_MIN_WIDTH = 280;
const PANEL_MAX_WIDTH = 560;

// Persist the panel layout so it survives reloads. Plain localStorage (not
// Convex) keeps this device-local and schema-free — it's a UI preference, not
// shared state.
const STORAGE_KEYS = {
    width: 'weblab:right-panel:width',
    collapsed: 'weblab:right-panel:collapsed',
    tab: 'weblab:right-panel:tab',
} as const;

const isRightPanelTab = (value: unknown): value is RightPanelTab =>
    value === 'style' || value === 'interactions' || value === 'chat';

const readStoredWidth = (): number | null => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEYS.width);
        if (raw === null) return null;
        const parsed = Number.parseInt(raw, 10);
        if (!Number.isFinite(parsed)) return null;
        return Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, parsed));
    } catch {
        return null;
    }
};

const readStoredCollapsed = (): boolean | null => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEYS.collapsed);
        if (raw === null) return null;
        return raw === 'true';
    } catch {
        return null;
    }
};

const readStoredTab = (): RightPanelTab | null => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEYS.tab);
        return isRightPanelTab(raw) ? raw : null;
    } catch {
        return null;
    }
};

const writeStored = (key: string, value: string): void => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // Storage can be full or blocked (private mode); persistence is a
        // best-effort enhancement, so swallow and keep the in-memory state.
    }
};

export const RightPanel = observer(() => {
    const editorEngine = useEditorEngine();
    const t = useTranslations();
    const creationRequest = useQuery(api.projectCreateRequests.getPendingRequest, {
        projectId: editorEngine.projectId as Id<'projects'>,
    });
    const isFirstCreation = !!creationRequest;
    const [isChatHistoryOpen, setIsChatHistoryOpen] = useState(false);
    // Initialize with SSR-safe defaults so the server-rendered HTML matches the
    // first client paint (no hydration mismatch). The persisted layout is
    // restored in a mount-only effect below — mirroring the `isMobile` pattern
    // in main.tsx.
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [panelWidth, setPanelWidth] = useState(
        isFirstCreation ? FIRST_CREATION_PANEL_WIDTH : DEFAULT_PANEL_WIDTH,
    );
    const [activeTab, setActiveTab] = useState<RightPanelTab>('chat');
    // `ResizablePanel` only reads `defaultWidth` at mount; to apply a restored
    // width after hydration we push it through `forceWidth` once. Left
    // undefined until the restore effect runs so SSR/first-paint stays at the
    // default and drag-resizing afterwards is never clobbered.
    const [forceWidth, setForceWidth] = useState<number | undefined>(undefined);
    // Guards the persist effects so they don't overwrite stored values with the
    // SSR defaults before the restore effect has had a chance to run.
    const hasRestoredLayout = useRef(false);
    const currentConversation = editorEngine.chat.conversation.current;
    const hasElementSelection = editorEngine.elements.selected.length > 0;
    // Style tab has nothing to act on while editing code — disable it in CODE
    // mode and bounce the user off it if it was the active tab when they
    // entered CODE so they don't land on an empty disabled tab.
    const isCodeMode = editorEngine.state.editorMode === EditorMode.CODE;
    const isCommentMode = editorEngine.state.editorMode === EditorMode.COMMENT;

    useEffect(() => {
        if (isCodeMode && (activeTab === 'style' || activeTab === 'interactions')) {
            setActiveTab('chat');
        }
    }, [isCodeMode, activeTab]);

    useEffect(() => {
        if (isCommentMode) {
            if (editorEngine.state.panelsHidden) {
                editorEngine.state.togglePanelsHidden();
            }
            setIsCollapsed(false);
        }
    }, [isCommentMode, editorEngine.state]);

    useEffect(() => {
        const openChatForFixRequest = () => {
            if (editorEngine.state.panelsHidden) {
                editorEngine.state.togglePanelsHidden();
            }
            setIsCollapsed(false);
            setActiveTab('chat');
        };
        window.addEventListener(FIX_ERRORS_EVENT, openChatForFixRequest);
        return () => window.removeEventListener(FIX_ERRORS_EVENT, openChatForFixRequest);
    }, [editorEngine.state]);

    const prevHasSelection = useRef(hasElementSelection);
    useEffect(() => {
        const gained = hasElementSelection && !prevHasSelection.current;
        prevHasSelection.current = hasElementSelection;
        if (gained && !isCodeMode && activeTab !== 'style') {
            setActiveTab('style');
        }
    }, [hasElementSelection, isCodeMode, activeTab]);

    // ── Restore + persist layout preferences ───────────────────────────────────
    // Restore once, after mount, so server and client first-paint agree.
    useEffect(() => {
        const storedCollapsed = readStoredCollapsed();
        if (storedCollapsed !== null) {
            setIsCollapsed(storedCollapsed);
        }
        const storedTab = readStoredTab();
        if (storedTab !== null) {
            setActiveTab(storedTab);
        }
        // First-creation keeps its wider chat-first width; don't let a stored
        // preference shrink the panel during the initial scaffold.
        if (!isFirstCreation) {
            const storedWidth = readStoredWidth();
            if (storedWidth !== null) {
                setPanelWidth(storedWidth);
                // Push the restored width into the panel (its internal width is
                // locked to the mount-time defaultWidth otherwise).
                setForceWidth(storedWidth);
            }
        }
        hasRestoredLayout.current = true;
        // Mount-only: read persisted state exactly once. `isFirstCreation` is
        // read at mount intentionally (matches the one-shot state init above).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Once `forceWidth` has applied the restored width, clear it so it can't
    // re-clobber a later user drag on a panel remount (e.g. toggling collapse).
    // `defaultWidth={panelWidth}` already carries the correct width on remount.
    useEffect(() => {
        if (forceWidth === undefined) return;
        const timer = setTimeout(() => setForceWidth(undefined), 350);
        return () => clearTimeout(timer);
    }, [forceWidth]);

    // Width changes fire continuously while dragging the resizer, so debounce
    // the write to avoid thrashing localStorage on every pointer move.
    useEffect(() => {
        if (!hasRestoredLayout.current) return;
        const timer = setTimeout(() => {
            writeStored(STORAGE_KEYS.width, String(panelWidth));
        }, 250);
        return () => clearTimeout(timer);
    }, [panelWidth]);

    // Collapse and active-tab change discretely, so write immediately.
    useEffect(() => {
        if (!hasRestoredLayout.current) return;
        writeStored(STORAGE_KEYS.collapsed, String(isCollapsed));
    }, [isCollapsed]);

    useEffect(() => {
        if (!hasRestoredLayout.current) return;
        writeStored(STORAGE_KEYS.tab, activeTab);
    }, [activeTab]);

    const showStyleDot = hasElementSelection && activeTab !== 'style' && !isCodeMode;
    const hasAnyInteractions =
        editorEngine.interactions.isLoaded && editorEngine.interactions.interactions.length > 0;
    const showInteractionsDot = hasAnyInteractions && activeTab !== 'interactions' && !isCodeMode;

    return (
        <div
            className={cn(
                'flex h-full items-start justify-end transition-[width,opacity] duration-200',
                !(isCollapsed || editorEngine.state.panelsHidden) &&
                    'bg-background-chrome group/panel border-border-bar w-full border-l',
            )}
        >
            {isCollapsed || editorEngine.state.panelsHidden ? (
                <div className="mt-3 flex">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label={t(
                                    transKeys.editor.panels.edit.tabs.chat.controls.openPanel,
                                )}
                                className="border-border-bar bg-background-chrome text-foreground-secondary hover:bg-background-bar-active hover:text-foreground-primary h-10 w-10 rounded-l-md rounded-r-none border border-r-0"
                                onClick={() => {
                                    if (editorEngine.state.panelsHidden) {
                                        editorEngine.state.togglePanelsHidden();
                                    }
                                    setIsCollapsed(false);
                                }}
                            >
                                <Icons.SidebarLeftCollapse className="h-4 w-4 scale-x-[-1]" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left" hideArrow>
                            {t(transKeys.editor.panels.edit.tabs.chat.controls.openPanel)}
                        </TooltipContent>
                    </Tooltip>
                </div>
            ) : (
                <ResizablePanel
                    side="right"
                    defaultWidth={panelWidth}
                    minWidth={PANEL_MIN_WIDTH}
                    maxWidth={PANEL_MAX_WIDTH}
                    forceWidth={forceWidth}
                    onWidthChange={setPanelWidth}
                    className="overflow-hidden"
                >
                    <DropdownManagerProvider>
                        {isCommentMode ? (
                            <div className="flex h-full min-w-0 flex-col gap-0">
                                <div className="flex h-10 w-full flex-row items-center border-b px-2">
                                    <div className="flex flex-1 items-center gap-1.5 px-1">
                                        <Icons.ChatBubble className="text-foreground-secondary h-3 w-3" />
                                        <span className="text-foreground-primary text-mini font-medium">
                                            {t(transKeys.editor.panels.edit.tabs.comments.name)}
                                        </span>
                                    </div>
                                    <div className="ml-auto flex items-center gap-0.5">
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label="Exit comments mode"
                                                    className="text-foreground-secondary hover:bg-background-bar-active hover:text-foreground-primary h-8 w-8 rounded-md"
                                                    onClick={() =>
                                                        editorEngine.state.setEditorMode(
                                                            EditorMode.DESIGN,
                                                        )
                                                    }
                                                >
                                                    <Icons.CrossS className="h-4 w-4" />
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent side="bottom" hideArrow>
                                                Exit comments (Esc)
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>
                                </div>
                                <div className="min-h-0 flex-1 overflow-hidden">
                                    <CommentsTab />
                                </div>
                            </div>
                        ) : (
                            <Tabs
                                value={activeTab}
                                onValueChange={(value) => setActiveTab(value as RightPanelTab)}
                                className="flex h-full min-w-0 flex-col gap-0"
                            >
                                <div className="flex h-10 w-full flex-row items-center border-b px-2">
                                    <TabsList className="bg-background-tab-strip h-8 gap-0 rounded-md p-0.5">
                                        {(() => {
                                            // The tooltip explains "Available in Design
                                            // mode" and is only meaningful in CODE mode.
                                            // Wrapping the trigger in Radix's
                                            // `TooltipTrigger asChild` makes it set its
                                            // own tooltip `data-state` on the child,
                                            // clobbering the Tabs `data-state="active"`
                                            // so the active background never shows. So
                                            // only wrap when the tooltip is actually
                                            // needed; otherwise render a bare trigger.
                                            const styleTrigger = (
                                                <TabsTrigger
                                                    value="style"
                                                    disabled={isCodeMode}
                                                    className={cn(
                                                        'data-[state=active]:bg-background-tab-active data-[state=active]:text-mini relative h-7 gap-1.5 rounded-md px-2.5',
                                                        isCodeMode &&
                                                            'cursor-not-allowed opacity-40',
                                                    )}
                                                >
                                                    <Icons.Layout className="h-3 w-3" />
                                                    {t(
                                                        transKeys.editor.panels.edit.tabs.styles
                                                            .name,
                                                    )}
                                                    {showStyleDot && (
                                                        <span className="bg-foreground-brand absolute top-1 right-1 h-1.5 w-1.5 rounded-full" />
                                                    )}
                                                </TabsTrigger>
                                            );
                                            if (!isCodeMode) return styleTrigger;
                                            return (
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        {styleTrigger}
                                                    </TooltipTrigger>
                                                    <TooltipContent side="bottom" hideArrow>
                                                        {t(
                                                            transKeys.editor.panels.edit.tabs.styles
                                                                .availableInDesignMode,
                                                        )}
                                                    </TooltipContent>
                                                </Tooltip>
                                            );
                                        })()}
                                        {(() => {
                                            const interactionsTrigger = (
                                                <TabsTrigger
                                                    value="interactions"
                                                    disabled={isCodeMode}
                                                    className={cn(
                                                        'data-[state=active]:bg-background-tab-active data-[state=active]:border-border-tab-active text-mini relative h-7 gap-1.5 rounded-sm border border-transparent px-2.5',
                                                        isCodeMode &&
                                                            'cursor-not-allowed opacity-40',
                                                    )}
                                                >
                                                    <Icons.CursorArrow className="h-3 w-3" />
                                                    {t(
                                                        transKeys.editor.panels.edit.tabs
                                                            .interactions.name,
                                                    )}
                                                    {showInteractionsDot && (
                                                        <span className="bg-foreground-brand absolute top-1 right-1 h-1.5 w-1.5 rounded-full" />
                                                    )}
                                                </TabsTrigger>
                                            );
                                            if (!isCodeMode) return interactionsTrigger;
                                            return (
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        {interactionsTrigger}
                                                    </TooltipTrigger>
                                                    <TooltipContent side="bottom" hideArrow>
                                                        {t(
                                                            transKeys.editor.panels.edit.tabs
                                                                .interactions.availableInDesignMode,
                                                        )}
                                                    </TooltipContent>
                                                </Tooltip>
                                            );
                                        })()}
                                        <div className="bg-border-tab-divider h-3.5 w-px self-center" />
                                        <TabsTrigger
                                            value="chat"
                                            className="data-[state=active]:bg-background-tab-active data-[state=active]:border-border-tab-active text-mini h-7 gap-1.5 rounded-sm border border-transparent px-2.5"
                                        >
                                            <Icons.Sparkles className="h-3 w-3" />
                                            {t(transKeys.editor.panels.edit.tabs.chat.name)}
                                        </TabsTrigger>
                                    </TabsList>
                                    <div className="ml-auto flex items-center gap-0.5">
                                        {activeTab === 'chat' && (
                                            <>
                                                <ChatControls />
                                                <ChatPanelDropdown
                                                    isChatHistoryOpen={isChatHistoryOpen}
                                                    setIsChatHistoryOpen={setIsChatHistoryOpen}
                                                >
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                aria-label={t(
                                                                    transKeys.editor.panels.edit
                                                                        .tabs.chat.controls
                                                                        .chatSettings,
                                                                )}
                                                                className="text-foreground-secondary hover:bg-background-bar-active hover:text-foreground-primary h-8 w-8 rounded-md"
                                                            >
                                                                <Icons.DotsHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="bottom" hideArrow>
                                                            {t(
                                                                transKeys.editor.panels.edit.tabs
                                                                    .chat.controls.chatSettings,
                                                            )}
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </ChatPanelDropdown>
                                            </>
                                        )}
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label={t(
                                                        transKeys.editor.panels.edit.tabs.chat
                                                            .controls.closePanel,
                                                    )}
                                                    className="text-foreground-secondary hover:bg-background-bar-active hover:text-foreground-primary h-8 w-8 rounded-md"
                                                    onClick={() => setIsCollapsed(true)}
                                                >
                                                    <Icons.SidebarLeftCollapse className="h-4 w-4" />
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent side="bottom" hideArrow>
                                                {t(
                                                    transKeys.editor.panels.edit.tabs.chat.controls
                                                        .closePanel,
                                                )}
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>
                                </div>
                                <ChatHistory
                                    isOpen={isChatHistoryOpen}
                                    onOpenChange={setIsChatHistoryOpen}
                                />

                                <TabsContent
                                    value="style"
                                    className="min-h-0 flex-1 overflow-hidden"
                                >
                                    {/* Only mount when active — the dynamic import
                                        above already keeps it out of the initial
                                        chunk; gating render avoids paying for the
                                        observer subtree on first paint. */}
                                    {activeTab === 'style' && <StyleTab />}
                                </TabsContent>

                                <TabsContent
                                    value="interactions"
                                    className="min-h-0 flex-1 overflow-hidden"
                                >
                                    {activeTab === 'interactions' && <InteractionsTab />}
                                </TabsContent>

                                <TabsContent
                                    value="chat"
                                    className="min-h-0 flex-1 overflow-hidden"
                                >
                                    <div className="flex h-full flex-col overflow-y-auto">
                                        {currentConversation ? (
                                            <ChatTab
                                                conversationId={currentConversation.id}
                                                projectId={editorEngine.projectId}
                                            />
                                        ) : (
                                            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                                                <p className="text-foreground-secondary text-small">
                                                    {t(
                                                        transKeys.editor.panels.edit.tabs.chat
                                                            .noActiveConversation,
                                                    )}
                                                </p>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => {
                                                        void editorEngine.chat.conversation.startNewConversation();
                                                    }}
                                                >
                                                    {t(
                                                        transKeys.editor.panels.edit.tabs.chat
                                                            .startNewConversation,
                                                    )}
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </TabsContent>
                            </Tabs>
                        )}
                    </DropdownManagerProvider>
                </ResizablePanel>
            )}
        </div>
    );
});
