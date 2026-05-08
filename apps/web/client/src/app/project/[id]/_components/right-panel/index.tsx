'use client';

import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons/index';
import { ResizablePanel } from '@weblab/ui/resizable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@weblab/ui/tabs';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import { env } from '@/env';
import { transKeys } from '@/i18n/keys';
import { DropdownManagerProvider } from '../editor-bar/hooks/use-dropdown-manager';
import { ChatTab } from './chat-tab';
import { ChatControls } from './chat-tab/controls';
import { ChatHistory } from './chat-tab/history';
import { ChatPanelDropdown } from './chat-tab/panel-dropdown';
import { CommentsTab } from './comments-tab';
import { StyleTab } from './style-tab';
import { StyleTabV2 } from './style-tab-v2';

type RightPanelTab = 'style' | 'chat' | 'comments';

export const RightPanel = observer(() => {
    const editorEngine = useEditorEngine();
    const t = useTranslations();
    const [isChatHistoryOpen, setIsChatHistoryOpen] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [panelWidth, setPanelWidth] = useState(352);
    const [activeTab, setActiveTab] = useState<RightPanelTab>('chat');
    const currentConversation = editorEngine.chat.conversation.current;
    const hasElementSelection = editorEngine.elements.selected.length > 0;

    // Show a dot on the Style tab when an element is selected but the user hasn't
    // switched to it yet. This is a passive signal — we never force a tab switch.
    const showStyleDot = hasElementSelection && activeTab !== 'style';

    return (
        <div
            className={cn(
                'flex h-full items-start justify-end transition-[width,opacity] duration-200',
                !isCollapsed &&
                    'bg-background-secondary group/panel border-border w-full rounded-tl-xl border-t border-l',
            )}
        >
            {isCollapsed ? (
                <div className="mt-3 flex">
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Open AI chat panel"
                        className="border-border bg-background-secondary text-foreground-secondary hover:bg-background-tertiary hover:text-foreground-primary h-10 w-10 rounded-l-xl rounded-r-none border border-r-0"
                        onClick={() => setIsCollapsed(false)}
                    >
                        <Icons.ChevronRight className="h-4 w-4 rotate-180" />
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
                            <div className="border-border flex h-10 w-full flex-row items-center border-b px-2">
                                <TabsList className="bg-background-tertiary/40 h-7 rounded-md p-0.5">
                                    <TabsTrigger value="style" className="relative gap-1.5">
                                        <Icons.Layout className="h-4 w-4" />
                                        {t(transKeys.editor.panels.edit.tabs.styles.name)}
                                        {showStyleDot && (
                                            <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-blue-400" />
                                        )}
                                    </TabsTrigger>
                                    <TabsTrigger value="chat" className="gap-1.5">
                                        <Icons.Sparkles className="h-4 w-4" />
                                        {t(transKeys.editor.panels.edit.tabs.chat.name)}
                                    </TabsTrigger>
                                    <TabsTrigger value="comments" className="gap-1.5">
                                        <Icons.ChatBubble className="h-4 w-4" />
                                        {t(transKeys.editor.panels.edit.tabs.comments.name)}
                                    </TabsTrigger>
                                </TabsList>
                                <div className="ml-auto flex items-center gap-1">
                                    {activeTab === 'chat' && (
                                        <>
                                            <ChatPanelDropdown
                                                isChatHistoryOpen={isChatHistoryOpen}
                                                setIsChatHistoryOpen={setIsChatHistoryOpen}
                                            >
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label="Chat settings"
                                                    className="text-foreground-secondary hover:bg-background-secondary hover:text-foreground-primary h-8 w-8"
                                                >
                                                    <Icons.ChevronDown className="h-4 w-4" />
                                                </Button>
                                            </ChatPanelDropdown>
                                            <ChatControls />
                                        </>
                                    )}
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label="Close right panel"
                                        className="text-foreground-secondary hover:bg-background-secondary hover:text-foreground-primary h-8 w-8"
                                        onClick={() => setIsCollapsed(true)}
                                    >
                                        <Icons.ChevronRight className="h-4 w-4" />
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
