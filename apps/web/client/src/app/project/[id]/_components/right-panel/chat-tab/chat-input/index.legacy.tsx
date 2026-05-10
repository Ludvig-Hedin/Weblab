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
} from '@weblab/models';
import { ChatType } from '@weblab/models';
import { MessageContextType } from '@weblab/models/chat';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';
import { Textarea } from '@weblab/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';
import { compressImageInBrowser, convertToBase64DataUrl } from '@weblab/utility';

import type { SuggestionsRef } from '../suggestions';
import type { SendMessage } from '@/app/project/[id]/_hooks/use-chat';
import { ModelSelector } from '@/components/ai-prompt-composer/model-picker/model-selector';
import { useEditorEngine } from '@/components/store/editor';
import { FOCUS_CHAT_INPUT_EVENT } from '@/components/store/editor/chat';
import { MicButton } from '@/components/transcribe/mic-button';
import {
    AI_CHAT_INPUT_DRAG_CLASS,
    AI_CHAT_INPUT_SURFACE_CLASS,
    AI_CHAT_TEXTAREA_CLASS,
    AI_CHAT_TEXTAREA_STYLE,
} from '@/components/ui/ai-chat-input-styles';
import { transKeys } from '@/i18n/keys';
import { api } from '@/trpc/react';
import { validateImageLimit } from '../context-pills/helpers';
import { InputContextPills } from '../context-pills/input-context-pills';
import { Suggestions } from '../suggestions';
import { ActionButtons } from './action-buttons';
import { ChatContextWindow } from './chat-context';
import { ChatModeToggle } from './chat-mode-toggle';
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
    }: ChatInputProps) => {
        const editorEngine = useEditorEngine();
        const t = useTranslations();
        const textareaRef = useRef<HTMLTextAreaElement>(null);
        const [isComposing, setIsComposing] = useState(false);
        const [actionTooltipOpen, setActionTooltipOpen] = useState(false);
        const [isDragging, setIsDragging] = useState(false);
        const chatMode = editorEngine.state.chatMode;
        const currentConversation = editorEngine.chat.conversation.current;
        const [inputValue, setInputValue] = useState('');
        const [suggestions, setSuggestions] = useState<ChatSuggestion[]>(
            () => currentConversation?.suggestions ?? [],
        );
        const lastSuggestionSignatureRef = useRef<string | null>(null);
        const lastUsageMessage = useMemo(
            () => messages.findLast((msg) => msg.metadata?.usage),
            [messages],
        );
        const { mutate: generateSuggestions, isPending: isGeneratingSuggestions } =
            api.chat.suggestions.generate.useMutation({
                onSuccess: (nextSuggestions) => {
                    setSuggestions(nextSuggestions);
                },
            });

        const focusInput = () => {
            requestAnimationFrame(() => {
                textareaRef.current?.focus();
            });
        };

        useEffect(() => {
            if (textareaRef.current && !isStreaming) {
                focusInput();
            }
        }, [isStreaming, messages]);

        useEffect(() => {
            const focusHandler = () => {
                if (textareaRef.current && !isStreaming) {
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

        function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
            if (isComposing) {
                return;
            }
            e.currentTarget.style.height = 'auto';
            e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
        }

        const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === 'Tab') {
                // Always prevent default tab behavior
                e.preventDefault();
                e.stopPropagation();

                // Only let natural tab order continue if handleTabNavigation returns false
                const handled = suggestionRef.current?.handleTabNavigation(e.shiftKey);
                if (!handled) {
                    // Focus the textarea
                    textareaRef.current?.focus();
                }
            } else if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
                e.preventDefault();
                e.stopPropagation();

                if (suggestionRef.current?.handleEnterSelection()) {
                    setTimeout(() => textareaRef.current?.focus(), 0);
                    return;
                }

                if (!inputEmpty) {
                    void sendMessage();
                }
            }
        };

        async function sendMessage() {
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
            if (chatMode === ChatType.ASK) {
                return 'Ask a question about your project...';
            }
            return t(transKeys.editor.panels.edit.tabs.chat.input.placeholder);
        };

        const extractImageFiles = (items: DataTransferItemList | DataTransferItem[]): File[] => {
            return Array.from(items)
                .filter((item) => item.type.startsWith('image/'))
                .map((item) => item.getAsFile())
                .filter((file): file is File => file !== null);
        };

        const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
            const imageFiles = extractImageFiles(e.clipboardData.items);
            if (imageFiles.length > 0) {
                e.preventDefault();
                void handleImageEvents(imageFiles, 'Pasted image');
            }
        };

        const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            setIsDragging(false);
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

        const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
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
                setIsDragging(isDragging);
                e.currentTarget.setAttribute('data-weblab-dragging-image', isDragging.toString());
            }
        };

        const suggestionRef = useRef<SuggestionsRef>(null);

        const handleChatModeChange = (mode: ChatType) => {
            editorEngine.state.chatMode = mode;
        };

        return (
            <div
                className={cn(
                    'text-foreground-tertiary text-small flex w-full flex-col p-1.5 transition-colors duration-200',
                    AI_CHAT_INPUT_DRAG_CLASS,
                    isDragging && 'bg-foreground-brand/30 cursor-copy',
                )}
                onDrop={(e) => {
                    void handleDrop(e);
                    setIsDragging(false);
                }}
                onDragOver={handleDragOver}
                onDragEnter={(e) => {
                    e.preventDefault();
                    handleDragStateChange(true, e);
                }}
                onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        handleDragStateChange(false, e);
                    }
                }}
            >
                <div
                    className={cn(
                        AI_CHAT_INPUT_SURFACE_CLASS,
                        'focus-within:border-border @container',
                    )}
                >
                    <div className="flex w-full flex-col px-2 pt-1.5">
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
                        <Textarea
                            ref={textareaRef}
                            placeholder={getPlaceholderText()}
                            className={cn(AI_CHAT_TEXTAREA_CLASS, 'mt-1 max-h-32')}
                            style={AI_CHAT_TEXTAREA_STYLE}
                            rows={3}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onInput={handleInput}
                            onKeyDown={handleKeyDown}
                            onPaste={handlePaste}
                            onCompositionStart={() => setIsComposing(true)}
                            onCompositionEnd={() => {
                                setIsComposing(false);
                            }}
                        />
                    </div>
                    <div className="flex w-full flex-row justify-between px-2 py-1">
                        <div className="flex flex-row items-center gap-1">
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
                            />
                            {lastUsageMessage?.metadata?.usage && (
                                <ChatContextWindow usage={lastUsageMessage?.metadata?.usage} />
                            )}
                        </div>
                        <div className="flex flex-row items-center gap-1">
                            <MicButton
                                onTranscript={(text) =>
                                    setInputValue((prev) => (prev ? `${prev} ${text}` : text))
                                }
                                disabled={isStreaming}
                            />
                            {isStreaming && inputEmpty ? (
                                <Tooltip
                                    open={actionTooltipOpen}
                                    onOpenChange={setActionTooltipOpen}
                                >
                                    <TooltipTrigger asChild>
                                        <Button
                                            size={'icon'}
                                            variant={'secondary'}
                                            className="text-smallPlus text-primary bg-background-primary h-7 w-7 rounded-full"
                                            onClick={() => {
                                                setActionTooltipOpen(false);
                                                void onStop();
                                            }}
                                        >
                                            <Icons.Stop className="h-3.5 w-3.5" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" sideOffset={6} hideArrow>
                                        {'Stop response'}
                                    </TooltipContent>
                                </Tooltip>
                            ) : (
                                <Button
                                    size={'icon'}
                                    variant={'secondary'}
                                    className={cn(
                                        'h-7 w-7 rounded-full',
                                        inputEmpty
                                            ? 'text-primary'
                                            : 'bg-foreground-primary text-background hover:bg-foreground-primary/80',
                                    )}
                                    disabled={inputEmpty}
                                    onClick={() => void sendMessage()}
                                >
                                    <Icons.ArrowRight className="h-3.5 w-3.5" />
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    },
);
