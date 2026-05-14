'use client';

import { useHotkeys } from 'react-hotkeys-hook';

import { Hotkey } from '@/components/hotkey';
import { useEditorEngine } from '@/components/store/editor';

/**
 * Wire the panel-scoped RESET_STYLE hotkey. When fired while a property
 * control is focused (the inner `<button>` for the label or any input child),
 * we read the property name from the nearest `[data-style-property]` ancestor
 * and clear that property through the StyleManager — same path as alt-click.
 */
export function useResetHotkey() {
    const editorEngine = useEditorEngine();

    useHotkeys(
        Hotkey.RESET_STYLE.command,
        (event) => {
            event.preventDefault();
            const active = document.activeElement as HTMLElement | null;
            if (!active) return;
            const host = active.closest<HTMLElement>('[data-style-property]');
            const property = host?.dataset.styleProperty;
            if (!property) return;
            editorEngine.style.update(property, '');
        },
        { enableOnFormTags: true, enableOnContentEditable: true },
    );
}
