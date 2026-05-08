import type { ImageMessageContext, MessageContext } from '@weblab/models/chat';
import { MessageContextType } from '@weblab/models/chat';
import { isVideoFile } from '@weblab/utility';

import { getContextIcon, getTruncatedName } from './helpers';

export function SentContextPill({ context }: { context: MessageContext }) {
    if (context.type === MessageContextType.IMAGE) {
        const img = context;
        return (
            <span
                className="text-mini flex flex-row items-center gap-1 select-none"
                key={img.displayName}
            >
                <span className="h-5 w-5 flex-none overflow-hidden rounded">
                    {isVideoFile(img.mimeType) ? (
                        <video
                            src={img.content}
                            className="h-full w-full object-cover"
                            muted
                            playsInline
                        />
                    ) : (
                        <img
                            src={img.content}
                            alt={img.displayName}
                            className="h-full w-full object-cover"
                        />
                    )}
                </span>
                <span className="truncate">{getTruncatedName(context)}</span>
            </span>
        );
    }

    return (
        <span
            className="text-mini flex flex-row items-center gap-0.5 select-none"
            key={context.displayName}
        >
            {getContextIcon(context)}
            <span className="truncate">{getTruncatedName(context)}</span>
        </span>
    );
}
