'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import type { MentionConfig, SlashCommand } from './types';
import type { Editor } from '@tiptap/react';
import { MicButton } from '@/components/transcribe/mic-button';
import {
    AI_CHAT_INPUT_DRAG_CLASS,
    AI_CHAT_INPUT_SURFACE_CLASS,
} from '@/components/ui/ai-chat-input-styles';
import { TipTapEditor } from './tiptap-editor';

export interface AiPromptComposerImage {
    id?: string;
    content: string;
    displayName?: string;
    mimeType?: string;
}

export interface AiPromptComposerSuggestion {
    label: string;
    prompt: string;
}

export interface AiPromptComposerProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void | Promise<void>;
    placeholder: string;
    variant?: 'hero' | 'create' | 'editor-panel';
    disabled?: boolean;
    isSubmitting?: boolean;
    minRows?: number;
    maxTextareaClassName?: string;
    /** @deprecated use editorRef instead */
    textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
    editorRef?: React.RefObject<Editor | null>;
    mentionConfig?: MentionConfig;
    slashCommands?: SlashCommand[];
    onCompositionStart?: () => void;
    onCompositionEnd?: () => void;
    onKeyDown?: (event: KeyboardEvent) => void;
    onPaste?: (event: ClipboardEvent) => void;
    onDrop?: (event: React.DragEvent<HTMLDivElement>) => void | Promise<void>;
    onDragStateChange?: (isDragging: boolean, event: React.DragEvent<HTMLDivElement>) => void;
    onContainerClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
    onImageFiles?: (files: File[]) => void | Promise<void>;
    imageButtonTooltip?: string;
    imageButtonDisabled?: boolean;
    showImageButton?: boolean;
    showMicButton?: boolean;
    onTranscript?: (text: string) => void;
    showStopButton?: boolean;
    onStop?: () => void | Promise<void>;
    submitDisabled?: boolean;
    submitTooltip?: ReactNode;
    notice?: ReactNode;
    topSlot?: ReactNode;
    inlineSlot?: ReactNode;
    leftControls?: ReactNode;
    rightControls?: ReactNode;
    footerHint?: ReactNode;
    suggestionsSlot?: ReactNode;
    className?: string;
    surfaceClassName?: string;
    textareaClassName?: string;
    submitButtonClassName?: string;
    submitIconClassName?: string;
}

function getVariantClasses(variant: NonNullable<AiPromptComposerProps['variant']>) {
    switch (variant) {
        case 'hero':
            return {
                root: 'w-[540px] max-w-[calc(100vw-32px)]',
                surface: 'shadow-2xl shadow-black/20 backdrop-blur-xl',
                textarea: 'min-h-[44px] pt-4 text-base',
                button: 'h-10 w-10',
                icon: 'h-5 w-5',
                footer: 'px-2 pt-2 pb-2',
            };
        case 'create':
            return {
                root: 'w-[600px] max-w-full',
                surface: '',
                textarea: '',
                button: 'h-9 w-9',
                icon: 'h-5 w-5',
                footer: 'px-2 pt-2 pb-2',
            };
        case 'editor-panel':
        default:
            return {
                root: 'w-full',
                surface: '@container',
                textarea: 'mt-1 max-h-32',
                button: 'h-7 w-7 rounded-full',
                icon: 'h-3.5 w-3.5',
                footer: 'px-2 py-1',
            };
    }
}

export function AiPromptComposer({
    value,
    onChange,
    onSubmit,
    placeholder,
    variant = 'create',
    disabled = false,
    isSubmitting = false,
    minRows: _minRows,
    maxTextareaClassName,
    textareaRef: _textareaRef,
    editorRef,
    mentionConfig,
    slashCommands,
    onCompositionStart,
    onCompositionEnd,
    onKeyDown,
    onPaste,
    onDrop,
    onDragStateChange,
    onContainerClick,
    onImageFiles,
    imageButtonTooltip,
    imageButtonDisabled = false,
    showImageButton = false,
    showMicButton = false,
    onTranscript,
    showStopButton = false,
    onStop,
    submitDisabled,
    submitTooltip,
    notice,
    topSlot,
    inlineSlot,
    leftControls,
    rightControls,
    footerHint,
    suggestionsSlot,
    className,
    surfaceClassName,
    textareaClassName,
    submitButtonClassName,
    submitIconClassName,
}: AiPromptComposerProps) {
    const t = useTranslations('aiPromptComposer');
    const internalEditorRef = useRef<Editor | null>(null);
    const activeEditorRef = editorRef ?? internalEditorRef;
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [imageTooltipOpen, setImageTooltipOpen] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const classes = getVariantClasses(variant);
    const isEmpty = value.trim().length === 0;
    const isSubmitDisabled = submitDisabled ?? isEmpty;
    const buttonIconClassName = cn(classes.icon, submitIconClassName);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const handleContainerMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
        if (onContainerClick) {
            onContainerClick(event);
            return;
        }
        if (
            event.target instanceof Element &&
            (event.target.closest('button') ||
                event.target.closest('[data-weblab-ai-prompt-ignore-focus]') ||
                event.target.closest('.ProseMirror'))
        ) {
            return;
        }
        activeEditorRef.current?.commands.focus();
    };

    const setDragState = (nextDragging: boolean, event: React.DragEvent<HTMLDivElement>) => {
        setIsDragging(nextDragging);
        event.currentTarget.setAttribute('data-weblab-dragging-image', String(nextDragging));
        onDragStateChange?.(nextDragging, event);
    };

    const handleImageInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = '';
        setImageTooltipOpen(false);
        if (files.length > 0) {
            await onImageFiles?.(files);
        }
    };

    const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setDragState(false, event);

        if (onDrop) {
            await onDrop(event);
            return;
        }

        const files = Array.from(event.dataTransfer.files);
        if (files.length > 0) {
            await onImageFiles?.(files);
        }
    };

    const submitButton = showStopButton ? (
        <Button
            type="button"
            size="icon"
            variant="secondary"
            aria-label="Stop generating"
            className={cn(
                'text-primary bg-background-primary',
                classes.button,
                submitButtonClassName,
            )}
            onClick={() => void onStop?.()}
            disabled={disabled}
        >
            <Icons.Stop className={buttonIconClassName} />
        </Button>
    ) : (
        <Button
            type="button"
            size="icon"
            variant="secondary"
            aria-label={isSubmitting ? 'Sending' : 'Send message'}
            className={cn(
                classes.button,
                isSubmitDisabled
                    ? 'bg-background-tertiary text-foreground-tertiary cursor-not-allowed opacity-60'
                    : 'bg-foreground-primary hover:bg-foreground-hover text-background',
                submitButtonClassName,
            )}
            disabled={disabled || isSubmitting || isSubmitDisabled}
            onClick={() => void onSubmit()}
        >
            {isSubmitting ? (
                <Icons.LoadingSpinner className={cn(buttonIconClassName, 'animate-spin')} />
            ) : (
                <Icons.ArrowRight className={buttonIconClassName} />
            )}
        </Button>
    );

    const defaultSubmitTooltip: ReactNode = showStopButton
        ? 'Stop generating'
        : isSubmitting
          ? 'Sending…'
          : isSubmitDisabled
            ? 'Type a prompt to send'
            : 'Send (⏎)';
    const resolvedSubmitTooltip = submitTooltip ?? defaultSubmitTooltip;

    return (
        <div className={cn('flex flex-col items-center gap-3', classes.root, className)}>
            <div
                role="presentation"
                className={cn(
                    AI_CHAT_INPUT_SURFACE_CLASS,
                    AI_CHAT_INPUT_DRAG_CLASS,
                    classes.surface,
                    surfaceClassName,
                    isDragging && 'bg-foreground-brand/30 cursor-copy',
                )}
                onMouseDown={handleContainerMouseDown}
                onDragEnter={(event) => {
                    event.preventDefault();
                    setDragState(true, event);
                }}
                onDragOver={(event) => {
                    event.preventDefault();
                    setDragState(true, event);
                }}
                onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                        setDragState(false, event);
                    }
                }}
                onDrop={(event) => void handleDrop(event)}
            >
                {notice}
                <div className="flex w-full flex-col px-2 pt-1.5">
                    {topSlot}
                    {inlineSlot}
                    <TipTapEditor
                        value={value}
                        onChange={onChange}
                        onKeyDown={onKeyDown}
                        onPaste={onPaste}
                        onCompositionStart={onCompositionStart}
                        onCompositionEnd={onCompositionEnd}
                        placeholder={placeholder}
                        disabled={disabled}
                        className={cn(classes.textarea, maxTextareaClassName, textareaClassName)}
                        editorRef={activeEditorRef}
                        mentionConfig={mentionConfig}
                        slashCommands={slashCommands}
                    />
                    {footerHint}
                </div>
                <div
                    className={cn(
                        'flex w-full flex-row items-center justify-between',
                        classes.footer,
                    )}
                >
                    <div className="flex min-w-0 flex-row items-center gap-1">
                        {showImageButton && (
                            <Tooltip open={imageTooltipOpen} onOpenChange={setImageTooltipOpen}>
                                <TooltipTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className={cn(
                                            'text-foreground-tertiary group shrink-0 cursor-pointer hover:bg-transparent',
                                            classes.button,
                                        )}
                                        disabled={disabled || imageButtonDisabled}
                                        onClick={() => inputRef.current?.click()}
                                    >
                                        <input
                                            ref={inputRef}
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            className="hidden"
                                            onChange={(event) => void handleImageInputChange(event)}
                                        />
                                        <Icons.Image
                                            className={cn(
                                                buttonIconClassName,
                                                'group-hover:text-foreground',
                                            )}
                                        />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipPortal>
                                    <TooltipContent side="top" sideOffset={5}>
                                        {imageButtonTooltip ?? t('uploadImageTooltip')}
                                    </TooltipContent>
                                </TooltipPortal>
                            </Tooltip>
                        )}
                        {leftControls}
                    </div>
                    <div className="flex min-w-0 flex-row items-center gap-1">
                        {rightControls}
                        {isMounted && showMicButton && onTranscript && (
                            <MicButton
                                onTranscript={onTranscript}
                                disabled={disabled || isSubmitting}
                                className={classes.button}
                                iconClassName={classes.icon}
                            />
                        )}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="inline-flex">{submitButton}</span>
                            </TooltipTrigger>
                            <TooltipPortal>
                                <TooltipContent side="top" sideOffset={5}>
                                    {resolvedSubmitTooltip}
                                </TooltipContent>
                            </TooltipPortal>
                        </Tooltip>
                    </div>
                </div>
            </div>
            {suggestionsSlot}
        </div>
    );
}
