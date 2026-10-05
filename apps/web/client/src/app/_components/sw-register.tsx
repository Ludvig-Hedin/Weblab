'use client';

import { useEffect } from 'react';
import { APP_NAME } from '@weblab/constants';

import { env } from '@/env';
import { removeOptedOutServiceWorker, serviceWorkerMode } from './sw-policy';

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
        const mode = serviceWorkerMode(enabledByEnv, isProd);
        if (mode === 'opt-out') {
            void removeOptedOutServiceWorker(
                window.location.origin,
                navigator.serviceWorker,
                'caches' in window ? window.caches : undefined,
            ).then(({ requiresReload, failures }) => {
                if (failures) console.warn(`[${APP_NAME}] Offline cache opt-out cleanup incomplete; retry on next page load.`);
                if (requiresReload) console.warn(`[${APP_NAME}] Previous offline worker still controls this tab. Save work, close all tabs on this origin, then reopen. No automatic reload was performed.`);
            });
            return;
        }
        if (mode === 'inactive') return;

        const onLoad = () => {
            navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
                console.warn(`[${APP_NAME}] Service worker registration failed`, err);
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
