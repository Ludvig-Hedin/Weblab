'use client';

import { useEffect } from 'react';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { useTheme } from 'next-themes';

import { useStateManager } from '@/components/store/state';
import { useHasAuthCookie } from '@/hooks/use-has-auth-cookie';

// Uses `getMappedSettings` (not `getSettings`) because this consumer expects
// the nested {chat, ai, appearance, language, git, customShortcuts} shape —
// the same shape `fromDbUserSettings` used to produce for the Drizzle pipeline.
// `getMappedSettings` ports that mapper to Convex so this file (and any other
// surface that reads .appearance.*) keeps working without a flat-shape rewrite.
export function AppearanceProvider({ children }: { children: React.ReactNode }) {
    const hasAuthCookie = useHasAuthCookie();
    const userSettings = useQuery(
        (hasAuthCookie === true
            ? api.users.getMappedSettings
            : 'skip') as typeof api.users.getMappedSettings,
        hasAuthCookie === true ? {} : (undefined as never),
    );
    const { setTheme } = useTheme();
    const stateManager = useStateManager();

    useEffect(() => {
        if (!userSettings?.appearance) return;
        const { theme, accentColor, fontFamily, fontSize, uiDensity } = userSettings.appearance;

        if (theme) setTheme(theme);

        const html = document.documentElement;
        if (accentColor) html.setAttribute('data-accent', accentColor);
        if (uiDensity) html.setAttribute('data-density', uiDensity);
        if (fontSize) html.setAttribute('data-font-size', fontSize);
        if (fontFamily) html.setAttribute('data-font-family', fontFamily);
    }, [userSettings?.appearance, setTheme]);

    useEffect(() => {
        if (!userSettings?.customShortcuts) return;
        stateManager.hotkeys.loadFromSettings(userSettings.customShortcuts);
    }, [userSettings?.customShortcuts, stateManager.hotkeys]);

    return <>{children}</>;
}
