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

// Below this width the header row (3 tab labels + New Chat label + settings +
// collapse) no longer fits and the collapse button gets clipped. When narrow we
// drop to icon-only for inactive tabs and the New Chat button so the collapse
// toggle stays reachable at every width down to PANEL_MIN_WIDTH.
const PANEL_NARROW_WIDTH = 456;

// The "New chat" text label (and framework chip) only fit without crowding the
// header very near full width. Show them from 95% of the panel's max width and
// up; below that the New Chat control collapses to icon-only. Kept separate
// from PANEL_NARROW_WIDTH so the tab labels still appear at narrower widths.
const PANEL_NEW_CHAT_LABEL_WIDTH = Math.round(PANEL_MAX_WIDTH * 0.95); // 532

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
    // Guard the empty-projectId boot window: `useQuery` with a blank id cast
    // to `Id<'projects'>` would fire an invalid query during engine init.
    // 'skip' until the engine has a real projectId (Convex 'skip' sentinel).
    const creationRequest = useQuery(
        api.projectCreateRequests.getPendingRequest,
        editorEngine.projectId ? { projectId: editorEngine.projectId as Id<'projects'> } : 'skip',
    );
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

    // When narrow, only the active tab keeps its text label; inactive tabs and
    // the New Chat button collapse to icon-only so the header never overflows.
    const isNarrow = panelWidth < PANEL_NARROW_WIDTH;
    // New Chat keeps its text label only near full width (see constant above).
    const isChatControlsCompact = panelWidth < PANEL_NEW_CHAT_LABEL_WIDTH;
    // TEMP: the right panel's own collapse/open toggle is hidden — the left
    // panel's toggle now controls BOTH panels via `panelsHidden`. So the right
    // panel's collapsed state is driven by panelsHidden alone (its local
    // `isCollapsed` is ignored for rendering, though still persisted).
    // Revert: `const rightCollapsed = isCollapsed || editorEngine.state.panelsHidden;`
    // and uncomment the two toggle buttons below.
    const rightCollapsed = editorEngine.state.panelsHidden;
    const styleLabel = t(transKeys.editor.panels.edit.tabs.styles.name);
    const interactionsLabel = t(transKeys.editor.panels.edit.tabs.interactions.name);
    const chatLabel = t(transKeys.editor.panels.edit.tabs.chat.name);

    return (
        <div
            className={cn(
                'flex h-full items-start justify-end transition-[width,opacity] duration-200',
                // Revert: `!(isCollapsed || editorEngine.state.panelsHidden)`
                !rightCollapsed &&
                    'bg-background-chrome group/panel border-border-bar w-full border-l',
            )}
        >
            {/* TEMP: right panel toggle hidden — the left panel's toggle now
                controls both panels via `panelsHidden`, so the right panel
                renders nothing when collapsed/hidden. Original collapsed-state
                open button preserved verbatim for revert (restore it as the
                truthy `?` branch of the ternary below, i.e. `rightCollapsed ? (
                <button-block> ) : (`):
            <div className="mt-1 mr-2 flex">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t(
                                transKeys.editor.panels.edit.tabs.chat.controls.openPanel,
                            )}
                            className="border-border-bar bg-background-chrome text-foreground-secondary hover:bg-background-bar-active hover:text-foreground-primary h-8 w-8 rounded-md border shadow-sm"
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
            */}
            {rightCollapsed ? null : (
                <ResizablePanel
                    side="right"
                    defaultWidth={panelWidth}
                    minWidth={PANEL_MIN_WIDTH}
                    maxWidth={PANEL_MAX_WIDTH}
                    forceWidth={forceWidth}
                    onWidthChange={setPanelWidth}
                    // Short slide+fade so expanding the panel reads as a smooth
                    // open rather than a hard pop (tailwindcss-animate; plays once
                    // when the open panel mounts).
                    className="animate-in fade-in slide-in-from-right-2 overflow-hidden duration-200"
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
                                    <TabsList className="bg-background-tab-strip h-8 min-w-0 gap-0 rounded-md p-0.5">
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
                                            const showStyleLabel =
                                                !isNarrow || activeTab === 'style';
                                            const styleTrigger = (
                                                <TabsTrigger
                                                    value="style"
                                                    disabled={isCodeMode}
                                                    aria-label={styleLabel}
                                                    title={showStyleLabel ? undefined : styleLabel}
                                                    className={cn(
                                                        'data-[state=active]:bg-background-tab-active data-[state=active]:text-mini relative h-7 gap-1.5 rounded-md',
                                                        showStyleLabel
                                                            ? 'px-2.5'
                                                            : 'w-7 flex-none px-0',
                                                        isCodeMode &&
                                                            'cursor-not-allowed opacity-40',
                                                    )}
                                                >
                                                    <Icons.Layout className="h-3 w-3 shrink-0" />
                                                    {showStyleLabel && styleLabel}
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
                                            const showInteractionsLabel =
                                                !isNarrow || activeTab === 'interactions';
                                            const interactionsTrigger = (
                                                <TabsTrigger
                                                    value="interactions"
                                                    disabled={isCodeMode}
                                                    aria-label={interactionsLabel}
                                                    title={
                                                        showInteractionsLabel
                                                            ? undefined
                                                            : interactionsLabel
                                                    }
                                                    className={cn(
                                                        'data-[state=active]:bg-background-tab-active data-[state=active]:border-border-tab-active text-mini relative h-7 gap-1.5 rounded-sm border border-transparent',
                                                        showInteractionsLabel
                                                            ? 'px-2.5'
                                                            : 'w-7 flex-none px-0',
                                                        isCodeMode &&
                                                            'cursor-not-allowed opacity-40',
                                                    )}
                                                >
                                                    <Icons.CursorArrow className="h-3 w-3 shrink-0" />
                                                    {showInteractionsLabel && interactionsLabel}
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
                                            aria-label={chatLabel}
                                            title={
                                                !isNarrow || activeTab === 'chat'
                                                    ? undefined
                                                    : chatLabel
                                            }
                                            className={cn(
                                                'data-[state=active]:bg-background-tab-active data-[state=active]:border-border-tab-active text-mini h-7 gap-1.5 rounded-sm border border-transparent',
                                                !isNarrow || activeTab === 'chat'
                                                    ? 'px-2.5'
                                                    : 'w-7 flex-none px-0',
                                            )}
                                        >
                                            <Icons.Sparkles className="h-3 w-3 shrink-0" />
                                            {(!isNarrow || activeTab === 'chat') && chatLabel}
                                        </TabsTrigger>
                                    </TabsList>
                                    <div className="ml-auto flex shrink-0 items-center gap-0.5">
                                        {activeTab === 'chat' && (
                                            <>
                                                <ChatControls
                                                    compact={isChatControlsCompact}
                                                    onOpenHistory={() => setIsChatHistoryOpen(true)}
                                                />
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
                                        {/* TEMP: right panel close button hidden — the
                                            left panel's toggle controls both panels.
                                            Revert: uncomment this block.
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
                                        */}
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
