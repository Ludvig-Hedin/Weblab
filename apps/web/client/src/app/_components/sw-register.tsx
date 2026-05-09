'use client';

import { useEffect } from 'react';

import { env } from '@/env';

export function SWRegister() {
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!('serviceWorker' in navigator)) return;

        // Service worker is enabled in production by default. Dev/preview
        // builds opt in via NEXT_PUBLIC_ENABLE_SW=true so QA can exercise
        // the offline path locally without a full prod build. Set the env
        // var to "false" in production to opt out.
        const enabledByEnv = env.NEXT_PUBLIC_ENABLE_SW;
        const isProd = process.env.NODE_ENV === 'production';
        const enabled = enabledByEnv === 'true' ? true : enabledByEnv === 'false' ? false : isProd;
        if (!enabled) return;

        const onLoad = () => {
            navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
                console.warn('[Weblab] Service worker registration failed', err);
            });
        };

        if (document.readyState === 'complete') {
            onLoad();
        } else {
            window.addEventListener('load', onLoad, { once: true });
            return () => window.removeEventListener('load', onLoad);
        }
    }, []);

    return null;
}
