'use client';

import { observer } from 'mobx-react-lite';

import { Icons } from '@weblab/ui/icons';

import { openFeedbackWidget } from '@/utils/telemetry';

export const HelpButton = observer(() => {
    return (
        <button
            aria-label="Open help"
            title="Open help"
            className="text-foreground-tertiary hover:bg-background-bar-active hover:text-foreground-primary flex h-10 w-10 items-center justify-center rounded-md p-0"
            onClick={() => void openFeedbackWidget()}
        >
            <Icons.QuestionMarkCircled className="h-5 w-5" />
        </button>
    );
});
