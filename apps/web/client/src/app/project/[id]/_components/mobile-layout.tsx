'use client';

import { useState } from 'react';
import { observer } from 'mobx-react-lite';

import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import { Canvas } from './canvas';
import { ChatTab } from './right-panel/chat-tab';
import { CommentsTab } from './right-panel/comments-tab';
import { TopBar } from './top-bar';

type MobileTab = 'chat' | 'comments' | 'preview';

const TABS: { id: MobileTab; icon: keyof typeof Icons; label: string }[] = [
    { id: 'chat', icon: 'Sparkles', label: 'Chat' },
    { id: 'comments', icon: 'ChatBubble', label: 'Comments' },
    { id: 'preview', icon: 'Desktop', label: 'Preview' },
];

export const MobileLayout = observer(() => {
    const editorEngine = useEditorEngine();
    const [activeTab, setActiveTab] = useState<MobileTab>('chat');
    const currentConversation = editorEngine.chat.conversation.current;

    return (
        <div className="flex h-[100dvh] w-screen flex-col overflow-hidden bg-background">
            <div className="w-full flex-shrink-0">
                <TopBar />
            </div>

            <div className="min-h-0 flex-1">
                {activeTab === 'chat' && (
                    <div
                        id="mobile-tabpanel-chat"
                        role="tabpanel"
                        aria-labelledby="mobile-tab-chat"
                        className="flex h-full flex-col overflow-hidden"
                    >
                        {currentConversation ? (
                            <ChatTab
                                conversationId={currentConversation.id}
                                projectId={editorEngine.projectId}
                            />
                        ) : (
                            <div className="flex h-full items-center justify-center text-sm text-foreground-secondary">
                                No active conversation
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'comments' && (
                    <div
                        id="mobile-tabpanel-comments"
                        role="tabpanel"
                        aria-labelledby="mobile-tab-comments"
                        className="h-full overflow-hidden"
                    >
                        <CommentsTab />
                    </div>
                )}

                {activeTab === 'preview' && (
                    <div
                        id="mobile-tabpanel-preview"
                        role="tabpanel"
                        aria-labelledby="mobile-tab-preview"
                        className="relative h-full w-full overflow-hidden bg-background-onlook"
                    >
                        <Canvas />
                    </div>
                )}
            </div>

            <div
                className="flex-shrink-0 border-t border-border bg-background"
                style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            >
                <div className="flex" role="tablist" aria-label="Project mobile navigation">
                    {TABS.map(({ id, icon, label }) => {
                        const Icon = Icons[icon];
                        const tabId = `mobile-tab-${id}`;
                        const panelId = `mobile-tabpanel-${id}`;
                        return (
                            <button
                                key={id}
                                id={tabId}
                                role="tab"
                                aria-selected={activeTab === id}
                                aria-controls={panelId}
                                onClick={() => setActiveTab(id)}
                                className={cn(
                                    'flex flex-1 flex-col items-center gap-1 py-3 text-xs transition-colors',
                                    activeTab === id
                                        ? 'text-foreground-primary'
                                        : 'text-foreground-tertiary hover:text-foreground-secondary',
                                )}
                            >
                                <Icon className="h-5 w-5" />
                                <span>{label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
});
