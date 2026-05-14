'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import localforage from 'localforage';
import { observer } from 'mobx-react-lite';
import { AnimatePresence } from 'motion/react';
import { v4 as uuidv4 } from 'uuid';

import type { ImageMessageContext, User } from '@weblab/models';
import { MessageContextType } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';
import { Textarea } from '@weblab/ui/textarea';
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';
import { compressImageInBrowser } from '@weblab/utility';

import { useAuthContext } from '@/app/auth/auth-context';
import { validateImageLimit } from '@/app/project/[id]/_components/right-panel/chat-tab/context-pills/helpers';
import { ImagePill } from '@/app/project/[id]/_components/right-panel/chat-tab/context-pills/image-pill';
import { useCreateManager } from '@/components/store/create';
import { MicButton } from '@/components/transcribe/mic-button';
import {
    AI_CHAT_INPUT_DRAG_CLASS,
    AI_CHAT_INPUT_SURFACE_CLASS,
    AI_CHAT_TEXTAREA_CLASS,
    AI_CHAT_TEXTAREA_STYLE,
} from '@/components/ui/ai-chat-input-styles';
import { Routes } from '@/utils/constants';

export interface CreateSuggestion {
    label: string;
    prompt: string;
}

const SAVED_INPUT_KEY = 'create-input';
const MIN_PROMPT_LENGTH = 10;
// Drafts saved on auth-modal-open are recovered for up to 24h. After that they
// almost certainly belong to a different intent and would surprise the user.
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
interface CreateInputContext {
    prompt: string;
    images: ImageMessageContext[];
    timestamp: number;
}

export const Create = observer(
    ({
        cardKey,
        isCreatingProject,
        setIsCreatingProject,
        user,
        suggestions,
    }: {
        cardKey: number;
        isCreatingProject: boolean;
        setIsCreatingProject: (isCreatingProject: boolean) => void;
        user: User | null;
        suggestions?: CreateSuggestion[];
    }) => {
        const createManager = useCreateManager();
        const router = useRouter();
        const imageRef = useRef<HTMLInputElement>(null);

        const { setIsAuthModalOpen } = useAuthContext();
        const textareaRef = useRef<HTMLTextAreaElement>(null);
        const [inputValue, setInputValue] = useState<string>('');
        const [isDragging, setIsDragging] = useState(false);
        const [selectedImages, setSelectedImages] = useState<ImageMessageContext[]>([]);
        const [imageTooltipOpen, setImageTooltipOpen] = useState(false);
        const [isHandlingFile, setIsHandlingFile] = useState(false);
        const trimmedLength = inputValue.trim().length;
        const isInputInvalid = trimmedLength < MIN_PROMPT_LENGTH;
        const charactersRemaining = Math.max(0, MIN_PROMPT_LENGTH - trimmedLength);
        const [isComposing, setIsComposing] = useState(false);

        // Restore draft from localStorage if it exists and isn't stale.
        // The draft is intentionally NOT deleted on restore: if the user
        // submits and creation fails (network, sandbox 502, etc.), refreshing
        // the page would otherwise lose the prompt entirely. Deletion happens
        // only after a successful create or if the draft is stale.
        useEffect(() => {
            const getDraft = async () => {
                try {
                    const draft = await localforage.getItem<CreateInputContext>(SAVED_INPUT_KEY);
                    if (!draft) return;
                    const isStale =
                        typeof draft.timestamp === 'number' &&
                        Date.now() - draft.timestamp > DRAFT_MAX_AGE_MS;
                    if (isStale) {
                        await localforage.removeItem(SAVED_INPUT_KEY);
                        return;
                    }
                    setInputValue(draft.prompt ?? '');
                    setSelectedImages(draft.images ?? []);
                } catch (error) {
                    console.error('Error restoring draft:', error);
                }
            };
            getDraft();
        }, []);

        const saveDraft = (prompt: string, images: ImageMessageContext[]) => {
            const createInputContext: CreateInputContext = {
                prompt,
                images,
                timestamp: Date.now(),
            };
            void localforage.setItem(SAVED_INPUT_KEY, createInputContext);
        };

        const handleSubmit = async () => {
            if (isInputInvalid) {
                return;
            }
            createProject(inputValue, selectedImages);
        };

        const createProject = async (prompt: string, images: ImageMessageContext[]) => {
            if (!user?.id) {
                saveDraft(prompt, images);
                setIsAuthModalOpen(true);
                return;
            }

            setIsCreatingProject(true);
            try {
                const project = await createManager.startCreate(user?.id, prompt, images);
                if (!project) {
                    throw new Error('Failed to create project: No project returned');
                }
                await localforage.removeItem(SAVED_INPUT_KEY);
                router.push(`${Routes.PROJECT}/${project.id}`);
            } catch (error) {
                console.error('Error creating project:', error);
                // Re-save so a refresh after a failed submit doesn't lose work.
                saveDraft(prompt, images);
                toast.error('Failed to create project', {
                    description: error instanceof Error ? error.message : String(error),
                });
            } finally {
                setIsCreatingProject(false);
            }
        };

        const handleDragOver = (e: React.DragEvent) => {
            e.preventDefault();
            setIsDragging(true);
        };

        const handleDragLeave = (e: React.DragEvent) => {
            e.preventDefault();
            setIsDragging(false);
        };

        const handleDrop = (e: React.DragEvent) => {
            e.preventDefault();
            setIsDragging(false);
            setImageTooltipOpen(false);
            // Find and reset the container's data attribute
            const container = e.currentTarget.closest('[data-create-container]');
            if (container) {
                container.setAttribute('data-weblab-dragging-image', 'false');
            }
            const files = Array.from(e.dataTransfer.files);
            handleNewImageFiles(files);
        };

        const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
            setIsHandlingFile(true);
            setImageTooltipOpen(false);
            const files = Array.from(e.target.files || []);
            handleNewImageFiles(files);
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
            if (imageRef && imageRef.current) {
                imageRef.current.value = '';
            }
            setSelectedImages(selectedImages.filter((f) => f !== imageContext));
        };

        const createImageMessageContext = async (
            file: File,
        ): Promise<ImageMessageContext | null> => {
            try {
                const compressedImage = await compressImageInBrowser(file);

                // If compression failed, fall back to original file
                const base64 =
                    compressedImage ||
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

        const handleDragStateChange = (isDragging: boolean, e: React.DragEvent) => {
            const hasImage =
                e.dataTransfer.types.length > 0 &&
                Array.from(e.dataTransfer.items).some(
                    (item) =>
                        item.type.startsWith('image/') ||
                        (item.type === 'Files' && e.dataTransfer.types.includes('public.file-url')),
                );
            if (hasImage) {
                setIsDragging(isDragging);
                // Find the container div with the bg-background-secondary class
                const container = e.currentTarget.closest('[data-create-container]');
                if (container) {
                    container.setAttribute('data-weblab-dragging-image', isDragging.toString());
                }
            }
        };

        const handleContainerClick = (e: React.MouseEvent) => {
            // Don't focus if clicking on a button, pill, or the textarea itself
            if (
                e.target instanceof Element &&
                (e.target.closest('button') ||
                    e.target.closest('.group') || // Pills have 'group' class
                    e.target === textareaRef.current)
            ) {
                return;
            }

            textareaRef.current?.focus();
        };

        const adjustTextareaHeight = () => {
            if (textareaRef.current) {
                // Reset height to auto to get the correct scrollHeight
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
            <div key={cardKey} className="flex w-full flex-col items-start gap-3">
                <div
                    data-create-container
                    className={cn(
                        AI_CHAT_INPUT_SURFACE_CLASS,
                        AI_CHAT_INPUT_DRAG_CLASS,
                        'w-[600px] max-w-full',
                        isDragging && 'cursor-copy bg-blue-500/40',
                    )}
                    onClick={handleContainerClick}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    {!user?.id && (
                        <button
                            type="button"
                            onClick={() => setIsAuthModalOpen(true)}
                            className="border-foreground-primary/15 bg-background/40 text-foreground-secondary hover:bg-background/60 hover:text-foreground-primary mx-2 mt-2 mb-1 flex cursor-pointer items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-xs transition-colors"
                        >
                            <span>Sign in to start designing — your prompt will be saved.</span>
                            <Icons.ArrowRight className="h-3.5 w-3.5 flex-shrink-0" />
                        </button>
                    )}
                    <div
                        className={`flex w-full flex-col ${selectedImages.length > 0 ? 'p-4' : 'px-2 pt-1'}`}
                    >
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
                        <div className="relative mt-1 flex w-full items-center">
                            <Textarea
                                ref={textareaRef}
                                className={AI_CHAT_TEXTAREA_CLASS}
                                placeholder="Describe what you want to build"
                                style={AI_CHAT_TEXTAREA_STYLE}
                                value={inputValue}
                                onChange={(e) => {
                                    setInputValue(e.target.value);
                                    adjustTextareaHeight();
                                }}
                                onCompositionStart={() => setIsComposing(true)}
                                onCompositionEnd={() => {
                                    setIsComposing(false);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
                                        e.preventDefault();
                                        void handleSubmit();
                                    }
                                }}
                                onDragEnter={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleDragStateChange(true, e);
                                }}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleDragStateChange(true, e);
                                }}
                                onDragLeave={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                        handleDragStateChange(false, e);
                                    }
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleDragStateChange(false, e);
                                    void handleDrop(e);
                                }}
                                rows={3}
                            />
                        </div>
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
                        <div className="flex w-full flex-row items-center justify-between px-2 py-2">
                            <div className="flex flex-row justify-start gap-1.5">
                                <Tooltip
                                    open={imageTooltipOpen && !isHandlingFile}
                                    onOpenChange={(open) =>
                                        !isHandlingFile && setImageTooltipOpen(open)
                                    }
                                >
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-foreground-tertiary group h-9 w-9 cursor-pointer hover:bg-transparent"
                                            onClick={() =>
                                                document.getElementById('image-input')?.click()
                                            }
                                        >
                                            <input
                                                id="image-input"
                                                type="file"
                                                ref={imageRef}
                                                accept="image/*"
                                                multiple
                                                className="hidden"
                                                onChange={handleFileSelect}
                                            />
                                            <Icons.Image
                                                className={cn(
                                                    'h-5 w-5',
                                                    'group-hover:text-foreground',
                                                )}
                                            />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipPortal>
                                        <TooltipContent side="top" sideOffset={5}>
                                            Upload image
                                        </TooltipContent>
                                    </TooltipPortal>
                                </Tooltip>
                            </div>
                            <div className="flex flex-row items-center gap-1.5">
                                <MicButton
                                    onTranscript={handleTranscript}
                                    disabled={isCreatingProject}
                                    className="h-9 w-9"
                                    iconClassName="h-5 w-5"
                                />
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            size="icon"
                                            variant="secondary"
                                            className={cn(
                                                'text-smallPlus h-9 w-9 cursor-pointer',
                                                isInputInvalid
                                                    ? 'text-foreground-primary'
                                                    : 'bg-foreground-primary hover:bg-foreground-hover text-white',
                                            )}
                                            disabled={isInputInvalid || isCreatingProject}
                                            onClick={handleSubmit}
                                        >
                                            {isCreatingProject ? (
                                                <Icons.LoadingSpinner className="text-background h-5 w-5 animate-pulse" />
                                            ) : (
                                                <Icons.ArrowRight
                                                    className={cn(
                                                        'h-5 w-5',
                                                        !isInputInvalid
                                                            ? 'text-background'
                                                            : 'text-foreground-primary',
                                                    )}
                                                />
                                            )}
                                        </Button>
                                    </TooltipTrigger>
                                    {!user?.id && !isInputInvalid && (
                                        <TooltipPortal>
                                            <TooltipContent side="top" sideOffset={5}>
                                                Sign in to design →
                                            </TooltipContent>
                                        </TooltipPortal>
                                    )}
                                </Tooltip>
                            </div>
                        </div>
                    </div>
                </div>
                {suggestions && suggestions.length > 0 && (
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
                )}
            </div>
        );
    },
);
