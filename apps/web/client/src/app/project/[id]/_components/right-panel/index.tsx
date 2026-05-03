'use client';

import { useEffect, useState } from 'react';
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
import { ChatTab } from './chat-tab';
import { ChatControls } from './chat-tab/controls';
import { ChatHistory } from './chat-tab/history';
import { ChatPanelDropdown } from './chat-tab/panel-dropdown';
import { DropdownManagerProvider } from '../editor-bar/hooks/use-dropdown-manager';
import { StyleTab } from './style-tab';
import { StyleTabV2 } from './style-tab-v2';
import { CommentsTab } from './comments-tab';

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

    useEffect(() => {
        if (hasElementSelection && activeTab !== 'comments') {
            setActiveTab('style');
        }
    }, [hasElementSelection]);

    return (
        <div
            className={cn(
                'flex h-full items-start justify-end transition-[width,opacity] duration-200',
                !isCollapsed &&
                    'bg-background/95 group/panel w-full rounded-tl-xl border-[0.5px] shadow backdrop-blur-xl',
            )}
        >
            {isCollapsed ? (
                <div className="mt-3 flex">
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Open AI chat panel"
                        className="border-border bg-background/95 text-foreground-secondary hover:bg-background-secondary hover:text-foreground-primary h-10 w-10 rounded-l-xl rounded-r-none border border-r-0 shadow"
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
                            <div className="border-border flex h-10 w-full flex-row items-center border-b p-1">
                                <TabsList className="h-8 rounded-lg bg-background-secondary">
                                    <TabsTrigger value="style" className="gap-1.5">
                                        <Icons.Layout className="h-4 w-4" />
                                        {t(transKeys.editor.panels.edit.tabs.styles.name)}
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
                                    {currentConversation && (
                                        <ChatTab
                                            conversationId={currentConversation.id}
                                            projectId={editorEngine.projectId}
                                        />
                                    )}
                                </div>
                            </TabsContent>

                            <TabsContent value="comments" className="min-h-0 flex-1 overflow-hidden">
                                <CommentsTab />
                            </TabsContent>
                        </Tabs>
                    </DropdownManagerProvider>
                </ResizablePanel>
            )}
        </div>
    );
});
