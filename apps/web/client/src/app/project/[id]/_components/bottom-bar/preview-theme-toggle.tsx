'use client';

import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';

import { Icons } from '@weblab/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';

import type { PreviewTheme } from '@/components/store/editor/state';
import { useEditorEngine } from '@/components/store/editor';

// system → light → dark → system. Display the icon of the *current* theme so
// users can see what's applied at a glance, then click to advance.
const CYCLE: PreviewTheme[] = ['system', 'light', 'dark'];
const META: Record<PreviewTheme, { icon: keyof typeof Icons; label: string }> = {
    system: { icon: 'Laptop', label: 'System' },
    light: { icon: 'Sun', label: 'Light' },
    dark: { icon: 'Moon', label: 'Dark' },
};

const THEME_MESSAGE_TYPE = 'weblab:preview-theme';

/**
 * Broadcasts a theme override to every iframe currently mounted on the page.
 * Sites built in Weblab can opt in by listening for `message` events of type
 * `weblab:preview-theme` and applying the payload to their root element.
 */
function broadcastTheme(theme: PreviewTheme): void {
    if (typeof window === 'undefined') return;
    const frames = document.querySelectorAll('iframe');
    frames.forEach((frame) => {
        try {
            frame.contentWindow?.postMessage({ type: THEME_MESSAGE_TYPE, theme }, '*');
        } catch {
            // Cross-origin frames may throw — ignore; the message bus is best-effort.
        }
    });
}

export const PreviewThemeToggle = observer(() => {
    const editorEngine = useEditorEngine();
    const current = editorEngine.state.previewTheme;
    const Icon = Icons[META[current].icon];
    const nextTheme = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length] ?? 'system';

    // Re-broadcast whenever the theme changes so newly-mounted frames stay in sync.
    useEffect(() => {
        broadcastTheme(current);
    }, [current]);

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    type="button"
                    aria-label={`${META[current].label} theme — click for ${META[nextTheme].label}`}
                    onClick={() => editorEngine.state.setPreviewTheme(nextTheme)}
                    className="text-foreground-tertiary hover:text-foreground-hover hover:bg-background-bar-active flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150"
                >
                    <Icon className="h-3.5 w-3.5" />
                </button>
            </TooltipTrigger>
            <TooltipContent sideOffset={5} hideArrow>
                Theme: {META[current].label} (click for {META[nextTheme].label})
            </TooltipContent>
        </Tooltip>
    );
});
