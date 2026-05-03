import { type ImageMessageContext, type MessageContext, MessageContextType } from '@weblab/models/chat';
import { isVideoFile } from '@weblab/utility';
import { getContextIcon, getTruncatedName } from './helpers';

export function SentContextPill({ context }: { context: MessageContext }) {
    if (context.type === MessageContextType.IMAGE) {
        const img = context as ImageMessageContext;
        return (
            <span className="flex flex-row gap-1 text-xs items-center select-none" key={img.displayName}>
                <span className="w-5 h-5 flex-none overflow-hidden rounded">
                    {isVideoFile(img.mimeType) ? (
                        <video src={img.content} className="w-full h-full object-cover" muted playsInline />
                    ) : (
                        <img src={img.content} alt={img.displayName} className="w-full h-full object-cover" />
                    )}
                </span>
                <span className="truncate">{getTruncatedName(context)}</span>
            </span>
        );
    }

    return (
        <span
            className="flex flex-row gap-0.5 text-xs items-center select-none"
            key={context.displayName}
        >
            {getContextIcon(context)}
            <span className="truncate">{getTruncatedName(context)}</span>
        </span>
    );
}
