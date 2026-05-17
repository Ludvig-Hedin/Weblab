'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import type {
    ChatMessage,
    ChatModel,
    ChatSuggestion,
    ImageMessageContext,
    LocalModelOption,
    QueuedMessage,
    ReasoningEffort,
} from '@weblab/models';
import { ChatType } from '@weblab/models';
import { MessageContextType } from '@weblab/models/chat';
import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';
import { compressImageInBrowser, convertToBase64DataUrl } from '@weblab/utility';

import type { SuggestionsRef } from '../suggestions';
import type { SendMessage } from '@/app/project/[id]/_hooks/use-chat';
import type {
    MentionConfig,
    MentionItem,
    SlashCommand,
} from '@/components/ai-prompt-composer/types';
import type { Editor } from '@tiptap/react';
import { AiPromptComposer } from '@/components/ai-prompt-composer';
import { ChatModeToggle } from '@/components/ai-prompt-composer/chat-mode-toggle';
import { ModelSelector } from '@/components/ai-prompt-composer/model-picker/model-selector';
import { useEditorEngine } from '@/components/store/editor';
import { FOCUS_CHAT_INPUT_EVENT } from '@/components/store/editor/chat';
import { useProjectCapabilitiesContext } from '@/hooks/use-project-capabilities-context';
import { transKeys } from '@/i18n/keys';
import { useAiAvailability } from '@/services/offline/ai-availability';
import { api } from '@/trpc/react';
import { validateImageLimit } from '../context-pills/helpers';
import { InputContextPills } from '../context-pills/input-context-pills';
import { Suggestions } from '../suggestions';
import { ActionButtons } from './action-buttons';
import { ChatContextWindow } from './chat-context';
import { QueueItems } from './queue-items';

interface ChatInputProps {
    messages: ChatMessage[];
    isStreaming: boolean;
    onStop: () => Promise<void>;
    onSendMessage: SendMessage;
    queuedMessages: QueuedMessage[];
    removeFromQueue: (id: string) => void;
    editQueuedMessage: (id: string, content: string) => void;
    moveQueuedMessage: (id: string, direction: 'up' | 'down') => void;
    reorderQueuedMessages: (
        sourceId: string,
        targetId: string,
        position: 'before' | 'after',
    ) => void;
    model: ChatModel;
    onModelChange: (model: ChatModel) => void;
    localModels: LocalModelOption[];
    localModelsLoading: boolean;
    reasoningEffort: ReasoningEffort;
    onReasoningEffortChange: (effort: ReasoningEffort) => void;
}

const imageDragDataSchema = z.object({
    type: z.literal('image'),
    originPath: z.string(),
    fileName: z.string(),
    mimeType: z.string(),
});

export const ChatInput = observer(
    ({
        messages,
        isStreaming,
        onStop,
        onSendMessage,
        queuedMessages,
        removeFromQueue,
        editQueuedMessage,
        moveQueuedMessage,
        reorderQueuedMessages,
        model,
        onModelChange,
        localModels,
        localModelsLoading,
        reasoningEffort,
        onReasoningEffortChange,
    }: ChatInputProps) => {
        const editorEngine = useEditorEngine();
        const t = useTranslations();
        const editorRef = useRef<Editor | null>(null);
        const [isComposing, setIsComposing] = useState(false);
        const chatMode = editorEngine.state.chatMode;
        const currentConversation = editorEngine.chat.conversation.current;
        const aiAvailability = useAiAvailability(model);
        const { canUseAi: hasAiCap } = useProjectCapabilitiesContext();
        // Viewer / reviewer projects: AI is read-only. We OR this with the
        // runtime availability flag so quota / offline messages still apply.
        const aiAllowed = aiAvailability.canUseAi && hasAiCap;
        const [inputValue, setInputValue] = useState('');
        const [suggestions, setSuggestions] = useState<ChatSuggestion[]>(
            () => currentConversation?.suggestions ?? [],
        );
        const lastSuggestionSignatureRef = useRef<string | null>(null);
        const fileListCacheRef = useRef<{ items: MentionItem[]; timestamp: number } | null>(null);
        // Index into userMessageHistory for Up/Down-arrow prompt recall. -1 = not navigating.
        const historyIndexRef = useRef<number>(-1);
        const lastUsageMessage = useMemo(
            () => messages.findLast((msg) => msg.metadata?.usage),
            [messages],
        );

        // Most-recent-first list of past USER message texts for Up/Down-arrow recall.
        const userMessageHistory = useMemo(() => {
            const out: string[] = [];
            for (let i = messages.length - 1; i >= 0; i--) {
                const msg = messages[i];
                if (msg?.role !== 'user') continue;
                const text = msg.parts
                    .map((part) => (part.type === 'text' ? part.text : ''))
                    .join('')
                    .trim();
                if (text.length > 0) out.push(text);
            }
            return out;
        }, [messages]);
        const { mutate: generateSuggestions, isPending: isGeneratingSuggestions } =
            api.chat.suggestions.generate.useMutation({
                onSuccess: (nextSuggestions) => {
                    setSuggestions(nextSuggestions);
                },
                onError: () => {
                    // Clear the dedupe signature so the next identical-state
                    // tick is allowed to retry. Without this, a single
                    // transient network blip permanently silences
                    // suggestions for the rest of the conversation.
                    lastSuggestionSignatureRef.current = null;
                },
            });

        const focusInput = () => {
            requestAnimationFrame(() => {
                editorRef.current?.commands.focus();
            });
        };

        useEffect(() => {
            if (editorRef.current && !isStreaming) {
                focusInput();
            }
        }, [isStreaming, messages]);

        useEffect(() => {
            const focusHandler = () => {
                if (editorRef.current && !isStreaming) {
                    focusInput();
                }
            };

            window.addEventListener(FOCUS_CHAT_INPUT_EVENT, focusHandler);
            return () => window.removeEventListener(FOCUS_CHAT_INPUT_EVENT, focusHandler);
        }, [isStreaming]);

        useEffect(() => {
            setSuggestions(currentConversation?.suggestions ?? []);
        }, [currentConversation]);

        useEffect(() => {
            if (isStreaming || messages.length < 2 || isGeneratingSuggestions) {
                return;
            }

            if (!currentConversation) {
                return;
            }

            const messageInputs = messages
                .map((message) => ({
                    role: message.role,
                    content: message.parts
                        .map((part) => (part.type === 'text' ? part.text : ''))
                        .join('')
                        .trim(),
                }))
                .filter(
                    (
                        message,
                    ): message is {
                        role: 'user' | 'assistant' | 'system';
                        content: string;
                    } =>
                        (message.role === 'user' ||
                            message.role === 'assistant' ||
                            message.role === 'system') &&
                        message.content.length > 0,
                );

            if (messageInputs.length < 2) {
                return;
            }

            const signature = `${currentConversation.id}:${messageInputs.length}:${messageInputs.at(-1)?.content}`;
            if (lastSuggestionSignatureRef.current === signature) {
                return;
            }

            lastSuggestionSignatureRef.current = signature;
            generateSuggestions({
                conversationId: currentConversation.id,
                messages: messageInputs,
            });
        }, [
            currentConversation,
            generateSuggestions,
            isGeneratingSuggestions,
            isStreaming,
            messages,
        ]);

        useEffect(() => {
            const handleGlobalKeyDown = (e: KeyboardEvent) => {
                if (e.key === 'Enter' && suggestionRef.current?.handleEnterSelection()) {
                    e.preventDefault();
                    e.stopPropagation();
                    // Stop the event from bubbling to the canvas
                    e.stopImmediatePropagation();
                    // Handle the suggestion selection
                    suggestionRef.current.handleEnterSelection();
                }
            };

            // Capture phase to intercept before it reaches the canvas
            window.addEventListener('keydown', handleGlobalKeyDown, true);
            return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
        }, []);

        const inputEmpty = !inputValue || inputValue.trim().length === 0;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Tab') {
                const handled = suggestionRef.current?.handleTabNavigation(e.shiftKey);
                if (handled) {
                    // Suggestions handled the Tab — block default focus traversal.
                    e.preventDefault();
                    e.stopPropagation();
                }
                // Otherwise let the browser move focus to the next focusable element.
                return;
            } else if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
                e.preventDefault();
                e.stopPropagation();

                if (suggestionRef.current?.handleEnterSelection()) {
                    setTimeout(() => editorRef.current?.commands.focus(), 0);
                    return;
                }

                if (!inputEmpty) {
                    void sendMessage();
                }
                return;
            }

            // Prompt history navigation (issue #34).
            // Only act when the editor is empty (initial Up) or already navigating history.
            if (e.key === 'ArrowUp') {
                const navigatingHistory = historyIndexRef.current >= 0;
                if (!navigatingHistory && !inputEmpty) {
                    // Editor has user-typed content — let caret move normally.
                    return;
                }
                if (userMessageHistory.length === 0) {
                    // Nothing to recall — let caret move normally.
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                const nextIndex = Math.min(
                    historyIndexRef.current + 1,
                    userMessageHistory.length - 1,
                );
                historyIndexRef.current = nextIndex;
                const recalled = userMessageHistory[nextIndex] ?? '';
                setInputValue(recalled);
                return;
            }

            if (e.key === 'ArrowDown') {
                if (historyIndexRef.current < 0) {
                    // Not navigating history — let caret move normally.
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                const nextIndex = historyIndexRef.current - 1;
                historyIndexRef.current = nextIndex;
                if (nextIndex < 0) {
                    setInputValue('');
                } else {
                    setInputValue(userMessageHistory[nextIndex] ?? '');
                }
                return;
            }

            if (e.key === 'Escape') {
                if (historyIndexRef.current >= 0 || !inputEmpty) {
                    // Clear and reset history navigation state.
                    historyIndexRef.current = -1;
                    setInputValue('');
                    e.preventDefault();
                    e.stopPropagation();
                }
                return;
            }

            // Any other key (typing, backspace, etc.) ends history navigation.
            historyIndexRef.current = -1;
        };

        async function sendMessage() {
            if (!hasAiCap) {
                // Defensive: hook gating may flicker; server is the trust
                // boundary but we don't want a keyboard-enter to surprise
                // viewers with a FORBIDDEN toast.
                return;
            }
            if (inputEmpty) {
                console.warn('Empty message');
                return;
            }
            const savedInput = inputValue.trim();
            try {
                await onSendMessage(savedInput, chatMode);
                setInputValue('');
            } catch (error) {
                console.error('Error sending message', error);
                toast.error('Failed to send message. Please try again.');
                setInputValue(savedInput);
            }
        }

        const getPlaceholderText = () => {
            if (!hasAiCap) {
                return 'Viewer access — AI is read-only';
            }
            if (!aiAvailability.canUseAi) {
                return aiAvailability.message;
            }
            if (chatMode === ChatType.ASK) {
                return t(transKeys.editor.panels.edit.tabs.chat.askPlaceholder);
            }
            if (chatMode === ChatType.PLAN) {
                return t(transKeys.editor.panels.edit.tabs.chat.planPlaceholder);
            }
            return t(transKeys.editor.panels.edit.tabs.chat.input.placeholder);
        };

        const extractImageFiles = (items: DataTransferItemList | DataTransferItem[]): File[] => {
            return Array.from(items)
                .filter((item) => item.type.startsWith('image/'))
                .map((item) => item.getAsFile())
                .filter((file): file is File => file !== null);
        };

        const handlePaste = (e: ClipboardEvent) => {
            if (!e.clipboardData) return;
            const imageFiles = extractImageFiles(e.clipboardData.items);
            if (imageFiles.length > 0) {
                e.preventDefault();
                void handleImageEvents(imageFiles, 'Pasted image');
            }
        };

        const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.currentTarget.removeAttribute('data-weblab-dragging-image');

            // First, check for internal drag-and-drop from image panel
            const jsonData = e.dataTransfer.getData('application/json');
            if (jsonData) {
                try {
                    const parsedData: unknown = JSON.parse(jsonData);
                    const result = imageDragDataSchema.safeParse(parsedData);

                    if (result.success) {
                        const data = result.data;
                        const currentImages = editorEngine.chat.context.context.filter(
                            (c) => c.type === MessageContextType.IMAGE,
                        );
                        const { success, errorMessage } = validateImageLimit(currentImages, 1);
                        if (!success) {
                            toast.error(errorMessage);
                            return;
                        }

                        // Load the actual image file content
                        const branchData = editorEngine.branches.getBranchDataById(
                            editorEngine.branches.activeBranch.id,
                        );
                        if (!branchData) {
                            toast.error('Failed to get branch data');
                            return;
                        }

                        const fileContent = await branchData.codeEditor.readFile(data.originPath);
                        if (!fileContent) {
                            toast.error('Failed to load image file');
                            return;
                        }

                        // Convert to base64 data URL
                        const base64Content = convertToBase64DataUrl(fileContent, data.mimeType);

                        const imageContext: ImageMessageContext = {
                            type: MessageContextType.IMAGE,
                            source: 'local',
                            path: data.originPath,
                            branchId: editorEngine.branches.activeBranch.id,
                            content: base64Content,
                            displayName: data.fileName,
                            mimeType: data.mimeType,
                        };
                        editorEngine.chat.context.addContexts([imageContext]);
                        toast.success('Image added to chat');
                        return;
                    }
                } catch (error) {
                    console.error('Failed to parse drag data:', error);
                }
            }

            // Fall back to handling external file drops
            const imageFiles = extractImageFiles(e.dataTransfer.items);
            if (imageFiles.length > 0) {
                void handleImageEvents(imageFiles);
            }
        };

        const processImageFile = async (file: File): Promise<string> => {
            const compressedImage = await compressImageInBrowser(file);
            if (compressedImage) {
                return compressedImage;
            }

            return new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (event) => resolve(event.target?.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        };

        const handleImageEvents = async (files: File[], customDisplayName?: string) => {
            const currentImages = editorEngine.chat.context.context.filter(
                (c) => c.type === MessageContextType.IMAGE,
            );
            const { success, errorMessage } = validateImageLimit(currentImages, files.length);
            if (!success) {
                toast.error(errorMessage);
                return;
            }

            const imageContexts: ImageMessageContext[] = [];

            for (const file of files) {
                try {
                    const base64URL = await processImageFile(file);
                    const contextImage: ImageMessageContext = {
                        id: uuidv4(),
                        type: MessageContextType.IMAGE,
                        source: 'external',
                        content: base64URL,
                        mimeType: file.type,
                        displayName:
                            customDisplayName && files.length === 1 ? customDisplayName : file.name,
                    };
                    imageContexts.push(contextImage);
                } catch (error) {
                    console.error(`Failed to process image ${file.name}:`, error);
                    toast.error(`Failed to process image: ${file.name}`);
                }
            }

            if (imageContexts.length > 0) {
                editorEngine.chat.context.addContexts(imageContexts);
                if (imageContexts.length > 1) {
                    toast.success(`Added ${imageContexts.length} images to chat`);
                }
            }
        };

        const handleImageEvent = async (file: File, displayName?: string) => {
            await handleImageEvents([file], displayName);
        };

        const handleDragStateChange = (isDragging: boolean, e: React.DragEvent) => {
            const hasImage =
                e.dataTransfer.types.length > 0 &&
                Array.from(e.dataTransfer.items).some(
                    (item) =>
                        item.type.startsWith('image/') ||
                        item.type === 'application/json' || // Internal drag from image panel
                        (item.type === 'Files' && e.dataTransfer.types.includes('public.file-url')),
                );
            if (hasImage) {
                e.currentTarget.setAttribute('data-weblab-dragging-image', isDragging.toString());
            }
        };

        const mentionConfig = useMemo(
            (): MentionConfig => ({
                searchFiles: async (query: string): Promise<MentionItem[]> => {
                    try {
                        const branchData = editorEngine.branches.activeBranchData;
                        const now = Date.now();
                        let items: MentionItem[];
                        // Cache the file list for 5 s to avoid redundant listAll() calls per keystroke
                        if (
                            fileListCacheRef.current &&
                            now - fileListCacheRef.current.timestamp < 5000
                        ) {
                            items = fileListCacheRef.current.items;
                        } else {
                            const allFiles = await branchData.codeEditor.listAll();
                            items = allFiles.map(({ path, type }) => ({
                                id: path,
                                label: path.split('/').pop() ?? path,
                                path,
                                isDirectory: type === 'directory',
                            }));
                            fileListCacheRef.current = { items, timestamp: now };
                        }
                        if (!query) return items.slice(0, 20);
                        const lowerQuery = query.toLowerCase();
                        return items
                            .filter(({ path }) => path.toLowerCase().includes(lowerQuery))
                            .slice(0, 20);
                    } catch {
                        return [];
                    }
                },
                onMentionSelect: async (item: MentionItem): Promise<void> => {
                    try {
                        const branchData = editorEngine.branches.activeBranchData;
                        const branchId = editorEngine.branches.activeBranch?.id;
                        if (!branchId) return;

                        if (item.isDirectory) {
                            // Reuse cached file list when available
                            const cached = fileListCacheRef.current;
                            const allFiles =
                                cached && Date.now() - cached.timestamp < 5000
                                    ? cached.items
                                    : await branchData.codeEditor.listAll().then((fs) =>
                                          fs.map(({ path, type }) => ({
                                              id: path,
                                              label: path.split('/').pop() ?? path,
                                              path,
                                              isDirectory: type === 'directory',
                                          })),
                                      );

                            const dirFiles = allFiles
                                .filter((f) => !f.isDirectory && f.path.startsWith(item.path + '/'))
                                .slice(0, 20);

                            const fileContexts = await Promise.all(
                                dirFiles.map(async (f) => {
                                    const raw = await branchData.codeEditor.readFile(f.path);
                                    if (!raw) return null;
                                    const content =
                                        typeof raw === 'string'
                                            ? raw
                                            : new TextDecoder().decode(raw);
                                    return {
                                        type: MessageContextType.FILE as const,
                                        path: f.path,
                                        displayName: f.path.split('/').pop() ?? f.path,
                                        content,
                                        branchId,
                                    };
                                }),
                            );

                            editorEngine.chat.context.addContexts(
                                fileContexts.filter((c): c is NonNullable<typeof c> => c !== null),
                            );
                        } else {
                            const raw = await branchData.codeEditor.readFile(item.path);
                            if (!raw) {
                                toast.error(`Could not read file: ${item.label}`);
                                return;
                            }
                            const content =
                                typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
                            editorEngine.chat.context.addContexts([
                                {
                                    type: MessageContextType.FILE as const,
                                    path: item.path,
                                    displayName: item.label,
                                    content,
                                    branchId,
                                },
                            ]);
                        }
                    } catch (error) {
                        console.error('Failed to add file context:', error);
                        toast.error('Failed to add file to chat');
                    }
                },
            }),
            // editorEngine is a stable MobX store instance; fileListCacheRef is a stable ref
            [editorEngine],
        );

        const slashCommands = useMemo(
            (): SlashCommand[] => [
                {
                    name: 'ask',
                    label: 'Ask',
                    description: 'Ask a question about your project',
                    icon: Icons.ChatBubble,
                    keywords: ['question', 'help'],
                    action: () => {
                        editorEngine.state.chatMode = ChatType.ASK;
                    },
                },
                {
                    name: 'edit',
                    label: 'Edit',
                    description: 'Edit your project with AI',
                    icon: Icons.Pencil,
                    action: () => {
                        editorEngine.state.chatMode = ChatType.EDIT;
                    },
                },
                {
                    name: 'create',
                    label: 'Create',
                    description: 'Create new elements or pages',
                    icon: Icons.Sparkles,
                    action: () => {
                        editorEngine.state.chatMode = ChatType.CREATE;
                    },
                },
                {
                    name: 'fix',
                    label: 'Fix',
                    description: 'Fix issues in your project',
                    icon: Icons.MagicWand,
                    action: () => {
                        editorEngine.state.chatMode = ChatType.FIX;
                    },
                },
                {
                    name: 'clear',
                    label: 'New chat',
                    description: 'Start a new conversation',
                    icon: Icons.Trash,
                    keywords: ['reset', 'new', 'clear'],
                    action: () => {
                        void editorEngine.chat.conversation.startNewConversation();
                    },
                },
                {
                    name: 'file',
                    label: 'Add file',
                    description: 'Mention a file to add as context',
                    icon: Icons.File,
                    keywords: ['context', 'attach'],
                    action: () => {
                        editorRef.current?.commands.focus();
                        editorRef.current?.commands.insertContent('@');
                    },
                },
            ],

            [editorEngine],
        );

        const suggestionRef = useRef<SuggestionsRef>(null);

        const handleChatModeChange = (mode: ChatType) => {
            editorEngine.state.chatMode = mode;
        };

        return (
            <AiPromptComposer
                value={inputValue}
                onChange={setInputValue}
                onSubmit={sendMessage}
                placeholder={getPlaceholderText()}
                variant="editor-panel"
                editorRef={editorRef}
                mentionConfig={mentionConfig}
                slashCommands={slashCommands}
                className="text-foreground-tertiary text-small p-1.5 transition-colors duration-200"
                surfaceClassName="focus-within:border-border"
                submitDisabled={inputEmpty || !aiAllowed}
                disabled={!aiAllowed}
                showStopButton={isStreaming}
                onStop={onStop}
                showMicButton
                onTranscript={(text) => {
                    const trimmed = text.trim();
                    if (!trimmed) return;
                    const currentText =
                        editorRef.current?.getText({ blockSeparator: '\n' }).trim() ??
                        inputValue.trim();
                    setInputValue(currentText ? `${currentText} ${trimmed}` : trimmed);
                }}
                onDrop={handleDrop}
                onDragStateChange={handleDragStateChange}
                onPaste={handlePaste}
                onKeyDown={handleKeyDown}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => {
                    setIsComposing(false);
                }}
                topSlot={
                    <>
                        <QueueItems
                            queuedMessages={queuedMessages}
                            removeFromQueue={removeFromQueue}
                            editQueuedMessage={editQueuedMessage}
                            moveQueuedMessage={moveQueuedMessage}
                            reorderQueuedMessages={reorderQueuedMessages}
                        />
                        <InputContextPills />
                        <Suggestions
                            ref={suggestionRef}
                            suggestions={suggestions}
                            isStreaming={isStreaming}
                            disabled={isGeneratingSuggestions}
                            inputValue={inputValue}
                            setInput={setInputValue}
                        />
                    </>
                }
                leftControls={
                    <>
                        <ActionButtons handleImageEvent={handleImageEvent} />
                        <ChatModeToggle
                            chatMode={chatMode}
                            onChatModeChange={handleChatModeChange}
                        />
                        <ModelSelector
                            value={model}
                            onChange={onModelChange}
                            localModels={localModels}
                            localModelsLoading={localModelsLoading}
                            reasoningEffort={reasoningEffort}
                            onReasoningEffortChange={onReasoningEffortChange}
                        />
                        {lastUsageMessage?.metadata?.usage && (
                            <ChatContextWindow
                                usage={lastUsageMessage?.metadata?.usage}
                                model={model}
                            />
                        )}
                    </>
                }
            />
        );
    },
);
