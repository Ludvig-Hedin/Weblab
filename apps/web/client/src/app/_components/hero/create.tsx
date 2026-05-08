'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import localforage from 'localforage';
import { observer } from 'mobx-react-lite';
import { AnimatePresence } from 'motion/react';
import { v4 as uuidv4 } from 'uuid';

import type { ImageMessageContext, User } from '@weblab/models';
import { MessageContextType } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { toast } from '@weblab/ui/sonner';
import { cn } from '@weblab/ui/utils';
import { compressImageInBrowser } from '@weblab/utility';

import { useAuthContext } from '@/app/auth/auth-context';
import { validateImageLimit } from '@/app/project/[id]/_components/right-panel/chat-tab/context-pills/helpers';
import { ImagePill } from '@/app/project/[id]/_components/right-panel/chat-tab/context-pills/image-pill';
import { AiPromptComposer } from '@/components/ai-prompt-composer';
import {
    AI_PROMPT_CREATE_RESUME_PATH,
    loadAiPromptCreateDraft,
    removeAiPromptCreateDraft,
    saveAiPromptCreateDraft,
} from '@/components/ai-prompt-composer/create-draft';
import { useCreateManager } from '@/components/store/create';
import { LocalForageKeys, Routes } from '@/utils/constants';

export interface CreateSuggestion {
    label: string;
    prompt: string;
}

const MIN_PROMPT_LENGTH = 10;

export const Create = observer(
    ({
        cardKey,
        isCreatingProject,
        setIsCreatingProject,
        user,
        suggestions,
        variant = 'create',
        autoSubmitRestoredDraft = false,
    }: {
        cardKey: number;
        isCreatingProject: boolean;
        setIsCreatingProject: (isCreatingProject: boolean) => void;
        user: User | null;
        suggestions?: CreateSuggestion[];
        variant?: 'hero' | 'create';
        autoSubmitRestoredDraft?: boolean;
    }) => {
        const createManager = useCreateManager();
        const router = useRouter();

        const { setIsAuthModalOpen } = useAuthContext();
        const textareaRef = useRef<HTMLTextAreaElement>(null);
        const [inputValue, setInputValue] = useState<string>('');
        const [selectedImages, setSelectedImages] = useState<ImageMessageContext[]>([]);
        const [isHandlingFile, setIsHandlingFile] = useState(false);
        const trimmedLength = inputValue.trim().length;
        const isInputInvalid = trimmedLength < MIN_PROMPT_LENGTH;
        const charactersRemaining = Math.max(0, MIN_PROMPT_LENGTH - trimmedLength);
        const [isComposing, setIsComposing] = useState(false);
        const restoredDraftRef = useRef(false);

        const createProject = useCallback(
            async (prompt: string, images: ImageMessageContext[]) => {
                if (!user?.id) {
                    await saveAiPromptCreateDraft(prompt, images);
                    await localforage.setItem(
                        LocalForageKeys.RETURN_URL,
                        AI_PROMPT_CREATE_RESUME_PATH,
                    );
                    setIsAuthModalOpen(true);
                    return;
                }

                setIsCreatingProject(true);
                try {
                    const project = await createManager.startCreate(user?.id, prompt, images);
                    if (!project) {
                        throw new Error('Failed to create project: No project returned');
                    }
                    await removeAiPromptCreateDraft();
                    router.push(`${Routes.PROJECT}/${project.id}`);
                } catch (error) {
                    console.error('Error creating project:', error);
                    await saveAiPromptCreateDraft(prompt, images);
                    toast.error('Failed to create project', {
                        description: error instanceof Error ? error.message : String(error),
                    });
                } finally {
                    setIsCreatingProject(false);
                }
            },
            [createManager, router, setIsAuthModalOpen, setIsCreatingProject, user?.id],
        );

        useEffect(() => {
            const getDraft = async () => {
                try {
                    const draft = await loadAiPromptCreateDraft();
                    if (!draft) return;
                    setInputValue(draft.prompt ?? '');
                    setSelectedImages(draft.images ?? []);
                    restoredDraftRef.current = true;
                } catch (error) {
                    console.error('Error restoring draft:', error);
                }
            };
            void getDraft();
        }, []);

        useEffect(() => {
            if (
                !autoSubmitRestoredDraft ||
                !user?.id ||
                !restoredDraftRef.current ||
                isCreatingProject ||
                inputValue.trim().length < MIN_PROMPT_LENGTH
            ) {
                return;
            }
            restoredDraftRef.current = false;
            void createProject(inputValue, selectedImages);
        }, [
            autoSubmitRestoredDraft,
            createProject,
            user?.id,
            isCreatingProject,
            inputValue,
            selectedImages,
        ]);

        const handleSubmit = async () => {
            if (isInputInvalid) {
                return;
            }
            await createProject(inputValue, selectedImages);
        };

        const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
            const files = Array.from(e.dataTransfer.files);
            await handleNewImageFiles(files);
        };

        const handleFileSelect = async (files: File[]) => {
            setIsHandlingFile(true);
            await handleNewImageFiles(files);
        };

        const handleNewImageFiles = async (files: File[]) => {
            const imageFiles = files.filter((file) => file.type.startsWith('image/'));

            const { success, errorMessage } = validateImageLimit(selectedImages, imageFiles.length);
            if (!success) {
                toast.error(errorMessage);
                setIsHandlingFile(false);
                return;
            }

            const imageContexts: ImageMessageContext[] = [];
            if (imageFiles.length > 0) {
                // Handle the dropped image files
                for (const file of imageFiles) {
                    const imageContext = await createImageMessageContext(file);
                    if (imageContext) {
                        imageContexts.push(imageContext);
                    }
                }
            }
            setSelectedImages([...selectedImages, ...imageContexts]);
            setIsHandlingFile(false);
        };

        const handleRemoveImage = (imageContext: ImageMessageContext) => {
            setSelectedImages(selectedImages.filter((f) => f !== imageContext));
        };

        const createImageMessageContext = async (
            file: File,
        ): Promise<ImageMessageContext | null> => {
            try {
                const compressedImage = await compressImageInBrowser(file);

                // If compression failed, fall back to original file
                const base64 =
                    compressedImage ??
                    (await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                            if (typeof reader.result === 'string') {
                                resolve(reader.result);
                            } else {
                                reject(new Error('Failed to read file'));
                            }
                        };
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                    }));

                return {
                    type: MessageContextType.IMAGE,
                    source: 'external',
                    content: base64,
                    displayName: file.name,
                    mimeType: file.type,
                    id: uuidv4(),
                };
            } catch (error) {
                console.error('Error reading file:', error);
                return null;
            }
        };

        const handleDragStateChange = (isDragging: boolean, e: React.DragEvent<HTMLDivElement>) => {
            const hasImage =
                e.dataTransfer.types.length > 0 &&
                Array.from(e.dataTransfer.items).some(
                    (item) =>
                        item.type.startsWith('image/') ||
                        (item.type === 'Files' && e.dataTransfer.types.includes('public.file-url')),
                );
            if (!hasImage) {
                e.currentTarget.setAttribute('data-weblab-dragging-image', 'false');
            }
        };

        const adjustTextareaHeight = () => {
            if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';

                const lineHeight = 20; // Approximate line height in pixels
                const maxHeight = lineHeight * 10; // 10 lines maximum

                const newHeight = Math.min(textareaRef.current.scrollHeight, maxHeight);
                textareaRef.current.style.height = `${newHeight}px`;
            }
        };

        const handleTranscript = (text: string) => {
            const trimmed = text.trim();
            if (!trimmed) return;
            setInputValue((prev) => {
                const base = prev.trimEnd();
                const next = base.length === 0 ? trimmed : `${base} ${trimmed}`;
                requestAnimationFrame(() => {
                    adjustTextareaHeight();
                    const textarea = textareaRef.current;
                    if (textarea) {
                        textarea.focus();
                        textarea.setSelectionRange(next.length, next.length);
                    }
                });
                return next;
            });
        };

        const handleSuggestionClick = (suggestion: CreateSuggestion) => {
            setInputValue(suggestion.prompt);
            requestAnimationFrame(() => {
                const textarea = textareaRef.current;
                if (!textarea) return;
                textarea.focus();
                textarea.setSelectionRange(suggestion.prompt.length, suggestion.prompt.length);
                adjustTextareaHeight();
            });
        };

        return (
            <div key={cardKey} className="flex w-full flex-col items-center gap-3">
                <AiPromptComposer
                    value={inputValue}
                    onChange={(value) => {
                        setInputValue(value);
                        requestAnimationFrame(adjustTextareaHeight);
                    }}
                    onSubmit={handleSubmit}
                    placeholder="Describe what you want to build"
                    variant={variant}
                    textareaRef={textareaRef}
                    isSubmitting={isCreatingProject}
                    disabled={isCreatingProject}
                    submitDisabled={isInputInvalid}
                    showImageButton
                    imageButtonDisabled={isHandlingFile}
                    showMicButton
                    onTranscript={handleTranscript}
                    onImageFiles={handleFileSelect}
                    onDrop={handleDrop}
                    onDragStateChange={handleDragStateChange}
                    onCompositionStart={() => setIsComposing(true)}
                    onCompositionEnd={() => setIsComposing(false)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
                            e.preventDefault();
                            void handleSubmit();
                        }
                    }}
                    topSlot={
                        <div
                            className={cn(
                                'text-micro text-foreground-secondary flex w-full flex-row flex-wrap gap-1.5',
                                selectedImages.length > 0 ? 'min-h-6' : 'h-0',
                            )}
                        >
                            <AnimatePresence mode="popLayout">
                                {selectedImages.map((imageContext) => (
                                    <ImagePill
                                        key={imageContext.content}
                                        context={imageContext}
                                        onRemove={() => handleRemoveImage(imageContext)}
                                    />
                                ))}
                            </AnimatePresence>
                        </div>
                    }
                    footerHint={
                        <div
                            className={cn(
                                'text-foreground-tertiary px-0.5 pt-1 text-[11px] transition-opacity duration-150',
                                inputValue.length > 0 && isInputInvalid
                                    ? 'opacity-100'
                                    : 'pointer-events-none h-0 opacity-0',
                            )}
                            aria-live="polite"
                        >
                            {charactersRemaining > 0
                                ? `${charactersRemaining} more character${charactersRemaining === 1 ? '' : 's'} to start designing`
                                : ''}
                        </div>
                    }
                    submitTooltip={!user?.id && !isInputInvalid ? 'Sign in to design' : undefined}
                    suggestionsSlot={
                        suggestions && suggestions.length > 0 ? (
                            <div className="flex flex-wrap justify-center gap-2">
                                {suggestions.map((suggestion) => (
                                    <Button
                                        key={suggestion.label}
                                        variant="outline"
                                        size="sm"
                                        className="rounded-full text-xs"
                                        onClick={() => handleSuggestionClick(suggestion)}
                                    >
                                        {suggestion.label}
                                    </Button>
                                ))}
                            </div>
                        ) : null
                    }
                />
            </div>
        );
    },
);
