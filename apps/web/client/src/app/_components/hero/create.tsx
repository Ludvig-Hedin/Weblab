'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import localforage from 'localforage';
import { observer } from 'mobx-react-lite';
import { AnimatePresence } from 'motion/react';
import { useTranslations } from 'next-intl';
import { v4 as uuidv4 } from 'uuid';

import type { ChatModel, ImageMessageContext } from '@weblab/models';
import { ChatType, DEFAULT_CHAT_MODEL, MessageContextType } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { toast } from '@weblab/ui/sonner';
import { cn } from '@weblab/ui/utils';
import { compressImageInBrowser } from '@weblab/utility';

import type { Editor } from '@tiptap/react';
import { useAuthContext } from '@/app/auth/auth-context';
import { validateImageLimit } from '@/app/project/[id]/_components/right-panel/chat-tab/context-pills/helpers';
import { ImagePill } from '@/app/project/[id]/_components/right-panel/chat-tab/context-pills/image-pill';
import { AiPromptComposer } from '@/components/ai-prompt-composer';
import { ChatModeToggle } from '@/components/ai-prompt-composer/chat-mode-toggle';
import {
    AI_PROMPT_CREATE_RESUME_PATH,
    loadAiPromptCreateDraft,
    loadAiPromptCreateModel,
    removeAiPromptCreateDraft,
    saveAiPromptCreateDraft,
    saveAiPromptCreateModel,
} from '@/components/ai-prompt-composer/create-draft';
import { ModelSelector } from '@/components/ai-prompt-composer/model-picker/model-selector';
import { ProjectCreationLoader } from '@/components/project-creation-loader';
import { useCreateManager } from '@/components/store/create';
import { isNotAuthenticatedError } from '@/components/store/create/manager';
import { LocalForageKeys, Routes } from '@/utils/constants';
import { CreateError } from './create-error';

export interface CreateSuggestion {
    label: string;
    prompt: string;
}

/**
 * Narrow user shape the Create component cares about. Accepts either the
 * legacy `User` from `@weblab/models` (`id`) OR a Convex `Doc<'users'>`
 * (`_id`) so the page can hand either through without casting through
 * `as never`. Post-migration every live caller passes the Convex doc.
 *
 * NOTE: previously typed as `User | null` and read `user?.id` — the Convex
 * doc has no `id` field, so signed-in users were treated as logged out and
 * bounced to the auth modal. Reading `_id ?? id` handles both shapes.
 */
export type CreateUser = { _id?: string; id?: string } | null;

const MIN_PROMPT_LENGTH = 1;

function getUserId(user: CreateUser): string | undefined {
    return user?._id ?? user?.id;
}

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
        user: CreateUser;
        suggestions?: CreateSuggestion[];
        variant?: 'hero' | 'create';
        autoSubmitRestoredDraft?: boolean;
    }) => {
        const userId = getUserId(user);
        const createManager = useCreateManager();
        const router = useRouter();
        const t = useTranslations('landing.hero.create');
        const tSteps = useTranslations('projects.actions');

        const { setIsAuthModalOpen } = useAuthContext();
        const textareaRef = useRef<HTMLTextAreaElement>(null);
        const editorRef = useRef<Editor | null>(null);
        const [inputValue, setInputValue] = useState<string>('');
        const [selectedImages, setSelectedImages] = useState<ImageMessageContext[]>([]);
        const [isHandlingFile, setIsHandlingFile] = useState(false);
        const trimmedLength = inputValue.trim().length;
        const isInputInvalid = trimmedLength < MIN_PROMPT_LENGTH;
        const charactersRemaining = Math.max(0, MIN_PROMPT_LENGTH - trimmedLength);
        const [isComposing, setIsComposing] = useState(false);
        const [selectedModel, setSelectedModel] = useState<ChatModel>(DEFAULT_CHAT_MODEL);
        const [chatMode, setChatMode] = useState<ChatType>(ChatType.EDIT);
        const restoredDraftRef = useRef(false);
        const [createStalled, setCreateStalled] = useState(false);

        const createProject = useCallback(
            async (prompt: string, images: ImageMessageContext[]) => {
                // Idempotency guard: handleSubmit, the auto-submit useEffect,
                // and the keydown handler can all reach this entry point. The
                // button's `disabled` prop only protects the click path —
                // without this guard, hitting Enter while the auto-submit is
                // mid-flight (or vice-versa) would fire two parallel
                // `startCreate` calls and create two projects.
                if (isCreatingProject) {
                    return;
                }

                if (!userId) {
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
                    const project = await createManager.startCreate(userId, prompt, images);
                    if (!project) {
                        // Reaching this branch means the manager bailed early
                        // (e.g. missing user id) without throwing. Don't
                        // re-save the draft or surface a misleading toast.
                        setIsCreatingProject(false);
                        return;
                    }
                    await removeAiPromptCreateDraft();
                    router.push(`${Routes.PROJECT}/${project.id}`);
                    // Intentionally leave isCreatingProject=true on the
                    // success path. The new route unmounts the hero, which
                    // tears down this component (and the overlay) when it
                    // mounts. Resetting here would briefly flash the hero
                    // back between router.push and the route transition,
                    // making the loading feel broken.
                } catch (error) {
                    // Session expired between the auth gate at line 97 and
                    // the mutate call (rare but possible) — re-open the auth
                    // modal instead of toasting a misleading "Failed to
                    // create project". Save the draft so post-login resume
                    // picks it up.
                    if (isNotAuthenticatedError(error)) {
                        await saveAiPromptCreateDraft(prompt, images);
                        await localforage.setItem(
                            LocalForageKeys.RETURN_URL,
                            AI_PROMPT_CREATE_RESUME_PATH,
                        );
                        setIsAuthModalOpen(true);
                        setIsCreatingProject(false);
                        return;
                    }
                    console.error('Error creating project:', error);
                    await saveAiPromptCreateDraft(prompt, images);
                    // Avoid double-surfacing the same failure: when the manager
                    // set a structured error, the inline <CreateError> banner
                    // already renders it (with its own Retry). Only toast when
                    // there's no banner-driven message — otherwise the user sees
                    // the same error twice (creation AI-4).
                    if (!createManager.error) {
                        toast.error(t('failedToCreate'), {
                            description: error instanceof Error ? error.message : String(error),
                        });
                    }
                    setIsCreatingProject(false);
                }
            },
            [
                createManager,
                isCreatingProject,
                router,
                setIsAuthModalOpen,
                setIsCreatingProject,
                userId,
            ],
        );

        useEffect(() => {
            const getDraft = async () => {
                try {
                    const draft = await loadAiPromptCreateDraft();
                    if (draft) {
                        setInputValue(draft.prompt ?? '');
                        setSelectedImages(draft.images ?? []);
                        restoredDraftRef.current = true;
                    }
                    // Restore the picker selection independently — it may
                    // exist without a draft (user changed model then refreshed
                    // without typing anything).
                    const restoredModel = await loadAiPromptCreateModel();
                    if (restoredModel) {
                        setSelectedModel(restoredModel as ChatModel);
                    }
                } catch (error) {
                    console.error('Error restoring draft:', error);
                }
            };
            void getDraft();
        }, []);

        // Persist the picker choice on every change so it survives reloads
        // AND so the editor can pick it up on first chat-tab mount as the
        // initial model (one-shot handoff cleared by the editor).
        useEffect(() => {
            void saveAiPromptCreateModel(selectedModel);
        }, [selectedModel]);

        useEffect(() => {
            if (
                !autoSubmitRestoredDraft ||
                !userId ||
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
            userId,
            isCreatingProject,
            inputValue,
            selectedImages,
        ]);

        // Watchdog: createFromPrompt provisions the sandbox synchronously and can
        // take ~13s (warm snapshot) to ~90s (cold scaffold). If it neither
        // resolves nor rejects past a generous ceiling, surface an escape hatch
        // instead of an infinite spinner — the hero overlay otherwise has no
        // Retry (the <CreateError> banner only shows when the promise actually
        // rejects). (wiring AI-4)
        useEffect(() => {
            if (!isCreatingProject || createManager.error) {
                setCreateStalled(false);
                return;
            }
            const timer = setTimeout(() => setCreateStalled(true), 120_000);
            return () => clearTimeout(timer);
        }, [isCreatingProject, createManager.error]);

        const handleSubmit = async () => {
            if (isInputInvalid) return;
            if (chatMode === ChatType.PLAN) {
                router.push(`/projects/plan?prompt=${encodeURIComponent(inputValue.trim())}`);
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
            // Read actual content from TipTap editor (ground truth) rather than
            // React state, which can lag or contain placeholder text on init.
            const currentText =
                editorRef.current?.getText({ blockSeparator: '\n' }).trim() ?? inputValue.trim();
            const next = currentText ? `${currentText} ${trimmed}` : trimmed;
            setInputValue(next);
            requestAnimationFrame(adjustTextareaHeight);
        };

        const handleSuggestionClick = (suggestion: CreateSuggestion) => {
            // Don't silently nuke a half-typed prompt when the user mis-clicks
            // a chip. Confirm overwrite once they've typed more than a few
            // characters — the threshold avoids prompting for an accidental
            // letter or whitespace.
            if (inputValue.trim().length > 6) {
                const proceed = window.confirm(t('replacePromptConfirm'));
                if (!proceed) return;
            }
            setInputValue(suggestion.prompt);
            requestAnimationFrame(() => {
                const textarea = textareaRef.current;
                if (!textarea) return;
                textarea.focus();
                textarea.setSelectionRange(suggestion.prompt.length, suggestion.prompt.length);
                adjustTextareaHeight();
            });
        };

        const phase = createManager.phase;
        // Show the loader the instant submit fires so the user sees progress
        // immediately instead of staring at a spinner inside the input box for
        // the 5–30s sandbox-fork window. We deliberately don't gate this on
        // `phase !== 'idle'` — there's a render between setIsCreatingProject
        // and the manager's first phase write where phase is still idle, and
        // the user would briefly see the hero with a button-spinner instead
        // of the full-screen loader. The editor's own loader picks up after
        // router.push and looks identical, so the handoff is seamless.
        const showCreationOverlay = isCreatingProject;
        const creationSteps = [
            {
                label: tSteps('preparingWorkspace'),
                ready: phase === 'creating-project' || phase === 'opening-editor',
            },
            { label: tSteps('creatingProject'), ready: phase === 'opening-editor' },
            { label: tSteps('openingEditor'), ready: false },
        ];

        const handleRetry = () => {
            void createProject(inputValue, selectedImages);
        };

        return (
            <div key={cardKey} className="flex w-full flex-col items-center gap-3">
                {showCreationOverlay && (
                    <ProjectCreationLoader
                        overlay
                        heading={t('overlayHeading')}
                        // TODO(i18n): move watchdog copy into messages/* (kept
                        // inline to avoid next-intl typegen staleness breaking
                        // typecheck on freshly-added keys).
                        caption={
                            createStalled
                                ? 'This is taking longer than usual. You can keep waiting, or reload and try again.'
                                : undefined
                        }
                        steps={creationSteps}
                        footer={
                            createStalled ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        setCreateStalled(false);
                                        setIsCreatingProject(false);
                                        createManager.resetPhase();
                                    }}
                                >
                                    Reload and try again
                                </Button>
                            ) : undefined
                        }
                    />
                )}
                <CreateError onRetry={handleRetry} />
                <AiPromptComposer
                    value={inputValue}
                    onChange={(value) => {
                        setInputValue(value);
                        requestAnimationFrame(adjustTextareaHeight);
                    }}
                    onSubmit={handleSubmit}
                    placeholder={t('promptPlaceholder')}
                    variant={variant}
                    textareaRef={textareaRef}
                    editorRef={editorRef}
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
                                'pointer-events-none h-0 opacity-0',
                            )}
                            aria-live="polite"
                        />
                    }
                    submitTooltip={!userId ? t('signInTooltip') : undefined}
                    leftControls={
                        <div className="flex items-center gap-1">
                            <ChatModeToggle
                                chatMode={chatMode}
                                onChatModeChange={setChatMode}
                                modes={[ChatType.EDIT, ChatType.PLAN]}
                                disabled={isCreatingProject}
                            />
                            <ModelSelector
                                value={selectedModel}
                                onChange={setSelectedModel}
                                localModels={[]}
                                localModelsLoading={false}
                            />
                        </div>
                    }
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
