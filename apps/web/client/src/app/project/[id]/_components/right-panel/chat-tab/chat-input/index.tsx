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
import { toast } from '@weblab/ui/sonner';
import { compressImageInBrowser, convertToBase64DataUrl } from '@weblab/utility';

import type { SuggestionsRef } from '../suggestions';
import type { SendMessage } from '@/app/project/[id]/_hooks/use-chat';
import { AiPromptComposer } from '@/components/ai-prompt-composer';
import { useEditorEngine } from '@/components/store/editor';
import { FOCUS_CHAT_INPUT_EVENT } from '@/components/store/editor/chat';
import { transKeys } from '@/i18n/keys';
import { api } from '@/trpc/react';
import { validateImageLimit } from '../context-pills/helpers';
import { InputContextPills } from '../context-pills/input-context-pills';
import { Suggestions } from '../suggestions';
import { ActionButtons } from './action-buttons';
import { ChatContextWindow } from './chat-context';
import { ChatModeToggle } from './chat-mode-toggle';
import { ModelSelector } from './model-selector';
import { QueueItems } from './queue-items';

interface ChatInputProps {
    messages: ChatMessage[];
    isStreaming: boolean;
    onStop: () => Promise<void>;
    onSendMessage: SendMessage;
    queuedMessages: QueuedMessage[];
    removeFromQueue: (id: string) => void;
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
        model,
        onModelChange,
        localModels,
        localModelsLoading,
    }: ChatInputProps) => {
        const editorEngine = useEditorEngine();
        const t = useTranslations();
        const textareaRef = useRef<HTMLTextAreaElement>(null);
        const [isComposing, setIsComposing] = useState(false);
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

        function handleInput(e: React.FormEvent<HTMLTextAreaElement>) {
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
                textareaRef={textareaRef}
                className="text-foreground-tertiary text-small p-1.5 transition-colors duration-200"
                surfaceClassName="focus-within:border-border"
                submitDisabled={inputEmpty}
                disabled={false}
                showStopButton={isStreaming && inputEmpty}
                onStop={onStop}
                showMicButton
                onTranscript={(text) => setInputValue((prev) => (prev ? `${prev} ${text}` : text))}
                onDrop={handleDrop}
                onDragStateChange={handleDragStateChange}
                onPaste={handlePaste}
                onInput={handleInput}
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
                        />
                        {lastUsageMessage?.metadata?.usage && (
                            <ChatContextWindow usage={lastUsageMessage?.metadata?.usage} />
                        )}
                    </>
                }
            />
        );
    },
);
