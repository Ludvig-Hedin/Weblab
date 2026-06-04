'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { ChatType, EditorMode } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { NodeIcon } from '@weblab/ui/node-icon';
import { Popover, PopoverContent, PopoverTrigger } from '@weblab/ui/popover';
import { toast } from '@weblab/ui/sonner';
import { Textarea } from '@weblab/ui/textarea';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import { useProjectCapabilitiesContext } from '@/hooks/use-project-capabilities-context';
import { transKeys } from '@/i18n/keys';
import { DEFAULT_INPUT_STATE, DIMENSIONS } from './helpers';
import { waitForChatReady } from './wait-for-chat-ready';

const EDITOR_HEADER_HEIGHT = 86;
const MARGIN = 8;
const AI_BUTTON_HEIGHT = 32;
const MAX_TEXTAREA_HEIGHT = 120;

/**
 * Small "AI" affordance anchored to the top-right corner of the selected
 * element. Opens a compact popover to either run an inline AI edit on the
 * element (Send) or attach the element to the main chat (Add to chat).
 */
export const OverlayAiMenu = observer(() => {
    const editorEngine = useEditorEngine();
    const t = useTranslations();
    const settings = useQuery(api.users.getSettings, {});
    const { canUseAi } = useProjectCapabilitiesContext();
    const [open, setOpen] = useState(false);
    const [inputState, setInputState] = useState(DEFAULT_INPUT_STATE);
    const [isComposing, setIsComposing] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    // Synchronous guard so a near-simultaneous Enter + Send click can't fire
    // two edits before the async `isSubmitting` state has propagated.
    const isSubmittingRef = useRef(false);

    const selectedRect = editorEngine.overlay.state.clickRects[0] ?? null;
    const selected = editorEngine.elements.selected[0];
    const domId = selected?.domId;
    const tagName = selected?.tagName ?? 'div';

    // Reset the popover whenever the selected element changes.
    useEffect(() => {
        setOpen(false);
        setInputState(DEFAULT_INPUT_STATE);
        isSubmittingRef.current = false;
    }, [domId]);

    const isSingleSelection = editorEngine.elements.selected.length === 1;
    const isDesignMode = editorEngine.state.editorMode === EditorMode.DESIGN;
    const isTextEditing = editorEngine.text.isEditing;

    // Show only for a single element in design mode, with AI available, while
    // the legacy centered mini-chat is off (the two are config-exclusive).
    if (
        !selectedRect ||
        !domId ||
        !canUseAi ||
        !isSingleSelection ||
        !isDesignMode ||
        isTextEditing ||
        editorEngine.chat.isStreaming ||
        settings?.showMiniChat
    ) {
        return null;
    }

    const canSubmit = inputState.value.trim().length >= DIMENSIONS.minCharsToSubmit;

    // Guarded for safety even though the canvas overlay only ever renders
    // client-side; keeps the corner button inside the viewport on the right.
    const viewportRight =
        typeof window !== 'undefined' ? window.innerWidth - MARGIN : Number.POSITIVE_INFINITY;

    const triggerStyle: React.CSSProperties = {
        position: 'fixed',
        top: Math.max(
            EDITOR_HEADER_HEIGHT + MARGIN,
            selectedRect.top - (AI_BUTTON_HEIGHT + MARGIN),
        ),
        left: Math.min(viewportRight, selectedRect.left + selectedRect.width),
        transform: 'translate(-100%, 0)',
        transformOrigin: 'top right',
        pointerEvents: 'auto',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    };

    const handleSubmit = async () => {
        if (!canSubmit || isSubmittingRef.current) {
            return;
        }
        isSubmittingRef.current = true;
        const value = inputState.value.trim();
        setInputState((prev) => ({ ...prev, isSubmitting: true }));
        // Reveal + mount the chat tab so the AI pipeline is alive, then send.
        editorEngine.chat.openChatPanel();
        try {
            await waitForChatReady(editorEngine);
            await editorEngine.chat.sendMessage(value, ChatType.EDIT);
            setInputState(DEFAULT_INPUT_STATE);
            setOpen(false);
        } catch {
            toast.error('Failed to send message');
            setInputState((prev) => ({ ...prev, isSubmitting: false }));
        } finally {
            isSubmittingRef.current = false;
        }
    };

    const handleAddToChat = () => {
        // The selected element is already attached to the chat context via the
        // selection reaction — just reveal the panel and focus the input.
        editorEngine.chat.openChatPanel();
        requestAnimationFrame(() => editorEngine.chat.focusChatInput());
        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    style={triggerStyle}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={t(transKeys.editor.panels.edit.tabs.chat.aiMenu.trigger)}
                    className={cn(
                        'h-8 w-8 rounded-lg border backdrop-blur-lg',
                        'bg-background-secondary/85 dark:bg-background/85',
                        'border-foreground-secondary/20 hover:border-foreground-secondary/50',
                        'shadow-background-secondary/50 shadow-xl',
                        'text-foreground-secondary hover:text-foreground-primary',
                        open && 'border-foreground-secondary/50 text-foreground-primary',
                    )}
                >
                    <Icons.Sparkles className="h-4 w-4" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                side="bottom"
                align="end"
                sideOffset={6}
                collisionPadding={EDITOR_HEADER_HEIGHT}
                onOpenAutoFocus={(e) => {
                    e.preventDefault();
                    requestAnimationFrame(() => textareaRef.current?.focus());
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="w-72 p-2"
            >
                <div className="flex items-center gap-1.5 px-1 pt-0.5 pb-2">
                    <NodeIcon iconClass="text-foreground-secondary h-3.5 w-3.5" tagName={tagName} />
                    <span className="text-mini text-foreground-secondary font-medium lowercase">
                        {tagName}
                    </span>
                </div>
                <Textarea
                    ref={textareaRef}
                    aria-label={t(transKeys.editor.panels.edit.tabs.chat.aiMenu.placeholder)}
                    value={inputState.value}
                    placeholder={t(transKeys.editor.panels.edit.tabs.chat.aiMenu.placeholder)}
                    rows={2}
                    disabled={inputState.isSubmitting}
                    className={cn(
                        '!text-mini max-h-[120px] min-h-[44px] w-full resize-none',
                        'border-none bg-transparent shadow-none focus-visible:!ring-0',
                        'caret-foreground-brand text-foreground-primary',
                        'selection:bg-foreground-brand/30',
                    )}
                    onChange={(e) => {
                        setInputState((prev) => ({ ...prev, value: e.target.value }));
                        const el = textareaRef.current;
                        if (el) {
                            el.style.height = 'auto';
                            el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
                        }
                    }}
                    onCompositionStart={() => setIsComposing(true)}
                    onCompositionEnd={() => setIsComposing(false)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
                            e.preventDefault();
                            void handleSubmit();
                        }
                    }}
                />
                <div className="flex items-center justify-between pt-1.5">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleAddToChat}
                        disabled={inputState.isSubmitting}
                        aria-label={t(transKeys.editor.panels.edit.tabs.chat.aiMenu.addToChat)}
                        className="text-foreground-secondary hover:text-foreground-primary h-7 w-7"
                    >
                        <Icons.MessageSquare className="h-4 w-4" />
                    </Button>
                    <Button
                        size="icon"
                        onClick={() => void handleSubmit()}
                        disabled={!canSubmit || inputState.isSubmitting}
                        aria-label={t(transKeys.editor.panels.edit.tabs.chat.aiMenu.send)}
                        className={cn(
                            'bg-foreground-primary hover:bg-foreground-hover text-background h-7 w-7 rounded-full',
                        )}
                    >
                        <Icons.ArrowUp className="h-4 w-4" />
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
});
