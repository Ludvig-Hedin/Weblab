'use client';

import { observer } from 'mobx-react-lite';

import { Icons } from '@weblab/ui/icons';

import { openFeedbackWidget } from '@/utils/telemetry';

export const HelpButton = observer(() => {
    return (
        <button
            aria-label="Open help"
            title="Open help"
            className="text-muted-foreground hover:bg-accent/50 hover:text-foreground flex h-10 w-10 items-center justify-center rounded-lg p-0"
            onClick={() => void openFeedbackWidget()}
        >
            <Icons.QuestionMarkCircled className="h-5 w-5" />
        </button>
    );
});
