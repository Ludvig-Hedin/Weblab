import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { observer } from 'mobx-react-lite';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import type { ChatSuggestion } from '@weblab/models';
import { Icons } from '@weblab/ui/icons';

import { useEditorEngine } from '@/components/store/editor';
import { transKeys } from '@/i18n/keys';

export interface SuggestionsRef {
    handleTabNavigation: (reverse: boolean) => boolean;
    handleEnterSelection: () => boolean;
}

export const Suggestions = observer(
    forwardRef<
        SuggestionsRef,
        {
            suggestions: ChatSuggestion[];
            isStreaming: boolean;
            disabled: boolean;
            inputValue: string;
            setInput: (input: string) => void;
            onSuggestionFocus?: (isFocused: boolean) => void;
        }
    >(({ suggestions, isStreaming, disabled, inputValue, setInput, onSuggestionFocus }, ref) => {
        const editorEngine = useEditorEngine();
        const t = useTranslations();
        const settings = useQuery(api.users.getSettings, {});
        const [focusedIndex, setFocusedIndex] = useState<number>(-1);
        const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

        // TODO(convex-migration): users.getSettings returns the flat DB row; switch to nested-shape via fromDbUserSettings mapper when available
        const shouldHideSuggestions =
            suggestions.length === 0 ||
            isStreaming ||
            !settings?.showSuggestions ||
            disabled ||
            inputValue.trim().length > 0 ||
            editorEngine.branches.getAllErrors().length > 0;

        const handleTabNavigation = (reverse: boolean) => {
            if (shouldHideSuggestions || suggestions.length === 0) {
                return false;
            }

            // Calculate next index
            const defaultIndex = reverse ? suggestions.length - 1 : 0;
            const nextIndex =
                focusedIndex === -1 ? defaultIndex : focusedIndex + (reverse ? -1 : 1);

            // If we would exceed the suggestions, return false to move to chat input
            if (nextIndex >= suggestions.length) {
                buttonRefs.current[focusedIndex]?.blur();
                setFocusedIndex(-1);
                onSuggestionFocus?.(false);
                return false;
            }

            // Force blur current button before focusing next
            if (focusedIndex !== -1) {
                buttonRefs.current[focusedIndex]?.blur();
            }
            // Force focus next button
            buttonRefs.current[nextIndex]?.focus();
            setFocusedIndex(nextIndex);
            onSuggestionFocus?.(true);
            return true;
        };

        const handleEnterSelection = () => {
            if (focusedIndex === -1 || shouldHideSuggestions || !suggestions[focusedIndex]) {
                return false;
            }
            setInput(suggestions[focusedIndex].prompt);
            setFocusedIndex(-1);
            onSuggestionFocus?.(false);
            return true;
        };

        useImperativeHandle(ref, () => ({
            handleTabNavigation,
            handleEnterSelection,
        }));

        return (
            <motion.div
                tabIndex={-1}
                className="flex flex-col overflow-hidden"
                animate={{ height: shouldHideSuggestions ? 0 : 'auto' }}
                initial={false}
                transition={{ duration: 0.3, ease: 'easeOut' }}
            >
                <motion.div
                    tabIndex={-1}
                    className="flex flex-col gap-2 p-2"
                    animate={{ opacity: shouldHideSuggestions ? 0 : 1 }}
                    initial={false}
                    transition={{ duration: 0.2 }}
                >
                    <span className="text-mini text-foreground-tertiary px-1 select-none">
                        {t(transKeys.editor.panels.edit.tabs.chat.suggestionsLabel)}
                    </span>
                    {suggestions.map((suggestion, index) => (
                        <motion.button
                            ref={(el) => {
                                buttonRefs.current[index] = el;
                            }}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                                delay: 0.05 + index * 0.05,
                                duration: 0.2,
                                ease: 'easeOut',
                            }}
                            key={suggestion.title}
                            className="border-border bg-background-tertiary/40 text-foreground-secondary hover:bg-background-tertiary hover:text-foreground-primary focus:border-foreground/30 focus:bg-background-tertiary focus:text-foreground-primary text-mini relative flex items-center gap-2 rounded-md border p-2 text-left transition-colors duration-150 focus:outline-none"
                            onClick={() => setInput(suggestion.prompt)}
                            onFocus={() => {
                                setFocusedIndex(index);
                                onSuggestionFocus?.(true);
                            }}
                            onBlur={(e) => {
                                // Don't reset focus if we're moving to another suggestion
                                const isMovingToAnotherSuggestion = buttonRefs.current.includes(
                                    e.relatedTarget as HTMLButtonElement,
                                );
                                if (!isMovingToAnotherSuggestion) {
                                    setFocusedIndex(-1);
                                    onSuggestionFocus?.(false);
                                }
                            }}
                        >
                            <Icons.Lightbulb className="h-4 w-4 flex-shrink-0" />
                            {suggestion.title}
                        </motion.button>
                    ))}
                </motion.div>
            </motion.div>
        );
    }),
);
