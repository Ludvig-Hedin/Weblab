import { type ChatMessage } from '@weblab/models';

import { MessageContent } from './message-content';

export const StreamMessage = ({ message }: { message: ChatMessage }) => {
    return (
        <div className="text-small flex flex-col content-start gap-2 px-3 py-2 leading-snug tracking-[-0.005em] text-wrap">
            <MessageContent
                messageId={message.id}
                parts={message.parts}
                applied={false}
                isStream={true}
            />
        </div>
    );
};
