import React from 'react';
import { motion } from 'motion/react';

import type { ImageMessageContext } from '@weblab/models/chat';
import { MessageContextType } from '@weblab/models/chat';
import { Icons } from '@weblab/ui/icons';
import { isVideoFile } from '@weblab/utility';

import { getTruncatedName } from './helpers';

export const ImagePill = React.forwardRef<
    HTMLDivElement,
    {
        context: ImageMessageContext;
        onRemove: () => void;
    }
>(({ context, onRemove }, ref) => {
    if (context.type !== MessageContextType.IMAGE) {
        console.warn('ImagePill received non-image context');
        return null;
    }

    const isVideo = isVideoFile(context.mimeType);

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
            className="group bg-background-tertiary relative flex h-7 flex-row items-center justify-center gap-1 rounded-md border"
            key={context.displayName}
            ref={ref}
        >
            {/* Left side: Image/Video thumbnail */}
            <div className="relative flex h-7 w-7 items-center justify-center overflow-hidden">
                {isVideo ? (
                    <video
                        src={context.content}
                        className="h-full w-full rounded-l-md object-cover"
                        muted
                        playsInline
                    />
                ) : (
                    <img
                        src={context.content}
                        alt={context.displayName}
                        className="h-full w-full rounded-l-md object-cover"
                    />
                )}
                <div className="pointer-events-none absolute inset-0 rounded-l-md border-y-[1px] border-l-[1px] border-white/10" />
            </div>

            {/* Right side: Filename */}
            <span className="text-mini max-w-[100px] overflow-hidden pr-1 text-ellipsis whitespace-nowrap">
                {getTruncatedName(context)}
            </span>

            {/* Remove button — faint by default, fully visible on hover/focus.
                Matches the size/placement of DraftContextPill's remove button so
                image chips and element/file chips read consistently in one row. */}
            <button
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRemove();
                }}
                aria-label={`Remove ${getTruncatedName(context)}`}
                className="bg-primary absolute -top-1 -right-1 flex h-3.5 w-3.5 cursor-pointer items-center justify-center rounded-full p-0.5 opacity-70 transition-opacity duration-200 group-hover:opacity-100 focus-visible:opacity-100"
            >
                <Icons.CrossL className="text-primary-foreground h-2 w-2" />
            </button>
        </motion.span>
    );
});

ImagePill.displayName = 'ImagePill';
