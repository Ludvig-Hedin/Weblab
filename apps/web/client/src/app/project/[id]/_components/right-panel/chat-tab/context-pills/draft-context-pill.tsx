import React from 'react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import type { MessageContext } from '@weblab/models/chat';
import { Icons } from '@weblab/ui/icons';

import { getContextIcon, getTruncatedName } from './helpers';

export const DraftContextPill = React.forwardRef<
    HTMLDivElement,
    {
        context: MessageContext;
        onRemove: () => void;
    }
>(({ context, onRemove }, ref) => {
    const t = useTranslations('editor.chat.contextPills');
    return (
        <motion.span
            layout="position"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{
                duration: 0.2,
                layout: {
                    duration: 0.15,
                    ease: 'easeOut',
                },
            }}
            // Neutral styling for every context type — the branch pill used to
            // render in skill-purple, which read as a state/error color and
            // dominated over the actual element/file pills next to it.
            className="group border-foreground-tertiary/20 bg-background-tertiary/50 text-foreground-secondary relative flex h-7 flex-row items-center justify-center gap-1 rounded-md border px-2"
            ref={ref}
        >
            <div className="flex w-4 items-center justify-center text-center">
                <div>{getContextIcon(context)}</div>
                <button
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onRemove();
                    }}
                    aria-label={t('removeAriaLabel', { name: getTruncatedName(context) })}
                    className="bg-primary absolute -top-1 -right-1 flex h-3.5 w-3.5 cursor-pointer items-center justify-center rounded-full p-0.5 opacity-70 transition-opacity duration-200 group-hover:opacity-100 focus-visible:opacity-100"
                >
                    <Icons.CrossL className="text-primary-foreground h-2 w-2" />
                </button>
            </div>
            <span className="text-mini">{getTruncatedName(context)}</span>
        </motion.span>
    );
});

DraftContextPill.displayName = 'DraftContextPill';
