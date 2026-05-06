import { memo } from 'react';
import { observer } from 'mobx-react-lite';

import type { ChatMessage } from '@weblab/models';

import { MessageContent } from './message-content';

const AssistantMessageComponent = ({
    message,
    isStreaming,
}: {
    message: ChatMessage;
    isStreaming: boolean;
}) => {
    return (
        <div className="text-small flex flex-col content-start gap-2 px-4 py-2 text-wrap">
            <MessageContent
                messageId={message.id}
                parts={message.parts}
                applied={false}
                isStream={isStreaming}
            />
        </div>
    );
};

export const AssistantMessage = memo(observer(AssistantMessageComponent));
