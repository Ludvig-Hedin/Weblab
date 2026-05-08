'use client';

import { useState } from 'react';
import { observer } from 'mobx-react-lite';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import { Canvas } from './canvas';
import { ChatTab } from './right-panel/chat-tab';
import { CommentsTab } from './right-panel/comments-tab';
import { TopBar } from './top-bar';

type MobileTab = 'chat' | 'comments' | 'preview';

const MIN_SCALE = 0.1;
const MAX_SCALE = 3;
const ZOOM_FACTOR = 1.25;

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
        <div className="bg-background flex h-[100dvh] w-screen flex-col overflow-hidden">
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
                            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                                <p className="text-foreground-secondary text-small">
                                    No active conversation
                                </p>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        void editorEngine.chat.conversation.startNewConversation();
                                    }}
                                >
                                    Start a new conversation
                                </Button>
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
                        className="bg-background-weblab relative h-full w-full overflow-hidden"
                    >
                        <Canvas />
                        <div className="border-border bg-background-primary absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border px-1 py-1 shadow-xl">
                            <button
                                type="button"
                                onClick={() => {
                                    editorEngine.canvas.scale = Math.max(
                                        MIN_SCALE,
                                        editorEngine.canvas.scale / ZOOM_FACTOR,
                                    );
                                }}
                                aria-label="Zoom out"
                                className="text-foreground-tertiary hover:text-foreground-hover hover:bg-background-tertiary/50 flex h-8 w-8 items-center justify-center rounded-full"
                            >
                                <Icons.Minus className="h-4 w-4" />
                            </button>
                            <span className="text-foreground-secondary text-mini min-w-10 text-center tabular-nums">
                                {Math.round(editorEngine.canvas.scale * 100)}%
                            </span>
                            <button
                                type="button"
                                onClick={() => {
                                    editorEngine.canvas.scale = Math.min(
                                        MAX_SCALE,
                                        editorEngine.canvas.scale * ZOOM_FACTOR,
                                    );
                                }}
                                aria-label="Zoom in"
                                className="text-foreground-tertiary hover:text-foreground-hover hover:bg-background-tertiary/50 flex h-8 w-8 items-center justify-center rounded-full"
                            >
                                <Icons.Plus className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div
                className="border-border bg-background flex-shrink-0 border-t"
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
                                    'text-mini flex flex-1 flex-col items-center gap-1 py-3 transition-colors',
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
