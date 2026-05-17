'use client';

import { useEffect } from 'react';

// Marks <html> with data attributes when running inside the Electron shell so
// global CSS can opt into drag regions and platform-specific chrome (e.g. the
// macOS traffic-light inset). The bridge it reads is defined in
// apps/desktop/preload.js — see `window.weblabDesktop.target === 'desktop'`.
export function DesktopChrome() {
    useEffect(() => {
        const bridge = (
            window as unknown as { weblabDesktop?: { target?: string; platform?: string } }
        ).weblabDesktop;
        if (bridge?.target !== 'desktop') return;
        const root = document.documentElement;
        root.dataset.desktop = 'true';
        if (bridge.platform) {
            root.dataset.desktopPlatform = bridge.platform;
        }
    }, []);

    return null;
}
