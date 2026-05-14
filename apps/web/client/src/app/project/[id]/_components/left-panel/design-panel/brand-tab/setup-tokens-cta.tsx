'use client';

import { useState } from 'react';
import { observer } from 'mobx-react-lite';

import { Button } from '@weblab/ui/button';

import { useEditorEngine } from '@/components/store/editor';

/**
 * Shared empty-state for the token-backed Brand panels (Variables, Color
 * Styles, Text Styles). When a project has no `@theme` tokens layer yet this
 * scaffolds one in place — no need to bounce the user to another panel.
 */
export const SetupTokensCta = observer(function SetupTokensCta() {
    const editorEngine = useEditorEngine();
    const tokens = editorEngine.tokens;
    const [busy, setBusy] = useState(false);

    const handleSetup = () => {
        setBusy(true);
        void tokens.scaffoldDefault().finally(() => setBusy(false));
    };

    return (
        <div className="bg-background-secondary border-border flex flex-col gap-3 rounded-lg border p-4">
            <div className="text-foreground-primary text-small font-medium">
                Set up design tokens
            </div>
            <div className="text-foreground-secondary text-mini leading-relaxed">
                Adds a <code>@theme</code> block with light/dark variables and starter text styles
                to your project&apos;s globals.css. Non-destructive — your existing styles are kept.
            </div>
            <Button size="sm" className="self-start" disabled={busy} onClick={handleSetup}>
                {busy ? 'Setting up…' : 'Set up tokens'}
            </Button>
        </div>
    );
});
