'use client';

import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { EditorMode } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons/index';
import { ResizablePanel } from '@weblab/ui/resizable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@weblab/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import { env } from '@/env';
import { transKeys } from '@/i18n/keys';
import { api } from '@/trpc/react';
import { DropdownManagerProvider } from '../editor-bar/hooks/use-dropdown-manager';
import { ChatTab } from './chat-tab';
import { ChatControls } from './chat-tab/controls';
import { ChatHistory } from './chat-tab/history';
import { ChatPanelDropdown } from './chat-tab/panel-dropdown';
import { CommentsTab } from './comments-tab';
import { StyleTab } from './style-tab';
import { StyleTabV2 } from './style-tab-v2';

type RightPanelTab = 'style' | 'chat' | 'comments';

const DEFAULT_PANEL_WIDTH = 352;
// While the project is being scaffolded from a prompt the chat is the primary
// surface — give it more room than the standard sidebar so the user clearly
// sees the AI picking up their request.
const FIRST_CREATION_PANEL_WIDTH = 460;

export const RightPanel = observer(() => {
    const editorEngine = useEditorEngine();
    const t = useTranslations();
    const { data: creationRequest } = api.project.createRequest.getPendingRequest.useQuery({
        projectId: editorEngine.projectId,
    });
    const isFirstCreation = !!creationRequest;
    const [isChatHistoryOpen, setIsChatHistoryOpen] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [panelWidth, setPanelWidth] = useState(
        isFirstCreation ? FIRST_CREATION_PANEL_WIDTH : DEFAULT_PANEL_WIDTH,
    );
    const [activeTab, setActiveTab] = useState<RightPanelTab>('chat');
    const currentConversation = editorEngine.chat.conversation.current;
    const hasElementSelection = editorEngine.elements.selected.length > 0;
    // Style tab has nothing to act on while editing code — disable it in CODE
    // mode and bounce the user off it if it was the active tab when they
    // entered CODE so they don't land on an empty disabled tab.
    const isCodeMode = editorEngine.state.editorMode === EditorMode.CODE;

    useEffect(() => {
        if (isCodeMode && activeTab === 'style') {
            setActiveTab('chat');
        }
    }, [isCodeMode, activeTab]);

    // Show a dot on the Style tab when an element is selected but the user hasn't
    // switched to it yet. This is a passive signal — we never force a tab switch.
    const showStyleDot = hasElementSelection && activeTab !== 'style' && !isCodeMode;

    return (
        <div
            className={cn(
                'flex h-full items-start justify-end transition-[width,opacity] duration-200',
                !isCollapsed &&
                    'bg-background-secondary group/panel border-border-bar w-full border-l',
            )}
        >
            {isCollapsed ? (
                <div className="mt-3 flex">
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Open AI chat panel"
                        className="border-border-bar bg-background-secondary text-foreground-secondary hover:bg-background-bar-active hover:text-foreground-primary h-10 w-10 rounded-l-md rounded-r-none border border-r-0"
                        onClick={() => setIsCollapsed(false)}
                    >
                        <Icons.SidebarLeftCollapse className="h-4 w-4 scale-x-[-1]" />
                    </Button>
                </div>
            ) : (
                <ResizablePanel
                    side="right"
                    defaultWidth={panelWidth}
                    minWidth={280}
                    maxWidth={560}
                    onWidthChange={setPanelWidth}
                    className="overflow-hidden"
                >
                    <DropdownManagerProvider>
                        <Tabs
                            value={activeTab}
                            onValueChange={(value) => setActiveTab(value as RightPanelTab)}
                            className="flex h-full flex-col gap-0"
                        >
                            <div className="border-border-bar flex h-14 w-full flex-row items-center border-b px-2">
                                <TabsList className="bg-background-tab-strip h-9 gap-0 rounded-md p-0.5">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <TabsTrigger
                                                value="style"
                                                disabled={isCodeMode}
                                                className={cn(
                                                    'data-[state=active]:bg-background-tab-active data-[state=active]:border-border-tab-active text-mini relative h-8 gap-1.5 rounded-sm border border-transparent px-2.5',
                                                    isCodeMode && 'cursor-not-allowed opacity-40',
                                                )}
                                            >
                                                <Icons.Layout className="h-3.5 w-3.5" />
                                                {t(transKeys.editor.panels.edit.tabs.styles.name)}
                                                {showStyleDot && (
                                                    <span className="bg-foreground-brand absolute top-1 right-1 h-1.5 w-1.5 rounded-full" />
                                                )}
                                            </TabsTrigger>
                                        </TooltipTrigger>
                                        {isCodeMode && (
                                            <TooltipContent side="bottom" hideArrow>
                                                Available in Design mode
                                            </TooltipContent>
                                        )}
                                    </Tooltip>
                                    {/* 14px-tall, 1px-wide divider between tabs (border-tab-divider). */}
                                    <div className="bg-border-tab-divider h-3.5 w-px self-center" />
                                    <TabsTrigger
                                        value="chat"
                                        className="data-[state=active]:bg-background-tab-active data-[state=active]:border-border-tab-active text-mini h-8 gap-1.5 rounded-sm border border-transparent px-2.5"
                                    >
                                        <Icons.Sparkles className="h-3.5 w-3.5" />
                                        {t(transKeys.editor.panels.edit.tabs.chat.name)}
                                    </TabsTrigger>
                                    <div className="bg-border-tab-divider h-3.5 w-px self-center" />
                                    <TabsTrigger
                                        value="comments"
                                        className="data-[state=active]:bg-background-tab-active data-[state=active]:border-border-tab-active text-mini h-8 gap-1.5 rounded-sm border border-transparent px-2.5"
                                    >
                                        <Icons.ChatBubble className="h-3.5 w-3.5" />
                                        {t(transKeys.editor.panels.edit.tabs.comments.name)}
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
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label="Chat settings"
                                                    className="text-foreground-secondary hover:bg-background-bar-active hover:text-foreground-primary h-8 w-8 rounded-md"
                                                >
                                                    <Icons.DotsHorizontal className="h-4 w-4" />
                                                </Button>
                                            </ChatPanelDropdown>
                                        </>
                                    )}
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label="Close right panel"
                                        className="text-foreground-secondary hover:bg-background-bar-active hover:text-foreground-primary h-8 w-8 rounded-md"
                                        onClick={() => setIsCollapsed(true)}
                                    >
                                        <Icons.SidebarLeftCollapse className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                            <ChatHistory
                                isOpen={isChatHistoryOpen}
                                onOpenChange={setIsChatHistoryOpen}
                            />

                            <TabsContent value="style" className="min-h-0 flex-1 overflow-hidden">
                                {env.NEXT_PUBLIC_STYLE_PANEL_V2 ? <StyleTabV2 /> : <StyleTab />}
                            </TabsContent>

                            <TabsContent value="chat" className="min-h-0 flex-1 overflow-hidden">
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

                            <TabsContent
                                value="comments"
                                className="min-h-0 flex-1 overflow-hidden"
                            >
                                <CommentsTab />
                            </TabsContent>
                        </Tabs>
                    </DropdownManagerProvider>
                </ResizablePanel>
            )}
        </div>
    );
});
