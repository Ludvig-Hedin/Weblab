import debounce from 'lodash/debounce';
import { connect, WindowMessenger } from 'penpal';

import type { PromisifiedPenpalParentMethods } from '@weblab/penpal';
import { PENPAL_CHILD_CHANNEL } from '@weblab/penpal';

import { preloadMethods } from './api';

export let penpalParent: PromisifiedPenpalParentMethods | null = null;
let isConnecting = false;
let trustedOrigins: string[] = [];

/**
 * Find the correct parent window for Weblab connection.
 * Handles both direct iframes (Next.js) and nested iframes (Storybook).
 */
const findWeblabParent = (): Window => {
    // If we're not in an iframe, something is wrong
    if (window === window.top) {
        console.warn(`${PENPAL_CHILD_CHANNEL} - Not in an iframe, using window.parent as fallback`);
        return window.parent;
    }

    // Check if we're in a direct iframe (parent is the top window)
    // This is the Next.js case: Weblab -> Next.js iframe
    if (window.parent === window.top) {
        return window.parent;
    }

    // We're in a nested iframe (parent is NOT the top window)
    // This is the Storybook case: Weblab -> CodeSandbox -> Storybook preview iframe
    if (window.top) {
        console.log(`${PENPAL_CHILD_CHANNEL} - Using window.top for nested iframe scenario`);
        return window.top;
    }

    // Final fallback
    return window.parent;
};

/**
 * Derive the trusted parent origin from the browser's security context.
 * Prefers the Permissions API's ancestorOrigins (Chromium/Safari), falls back
 * to document.referrer, and only widens to '*' when no information is available.
 */
const getTrustedParentOrigins = (remoteWindow: Window): string[] => {
    // ancestorOrigins is available in Chromium and Safari (not Firefox)
    if (
        typeof window.location.ancestorOrigins !== 'undefined' &&
        window.location.ancestorOrigins.length > 0
    ) {
        const ancestorOrigins = Array.from(window.location.ancestorOrigins);
        const remoteOrigin =
            remoteWindow === window.top
                ? ancestorOrigins[ancestorOrigins.length - 1]
                : ancestorOrigins[0];
        if (remoteOrigin) {
            return [remoteOrigin];
        }
    }
    // document.referrer gives the URL of the page that loaded this iframe
    if (document.referrer) {
        try {
            return [new URL(document.referrer).origin];
        } catch {
            // malformed referrer — fall through
        }
    }
    console.warn(
        `${PENPAL_CHILD_CHANNEL} - Could not determine parent origin; aborting connection`,
    );
    return [];
};

const createMessageConnection = async () => {
    if (isConnecting || penpalParent) {
        return penpalParent;
    }

    isConnecting = true;
    console.log(`${PENPAL_CHILD_CHANNEL} - Creating penpal connection`);

    const remoteWindow = findWeblabParent();
    const origins = getTrustedParentOrigins(remoteWindow);
    if (origins.length === 0) {
        console.error(
            `${PENPAL_CHILD_CHANNEL} - No trusted origins available; aborting connection`,
        );
        isConnecting = false;
        return null;
    }
    trustedOrigins = origins;

    const messenger = new WindowMessenger({
        remoteWindow,
        allowedOrigins: origins,
    });

    const connection = connect({
        messenger,
        // Methods the iframe window is exposing to the parent window.
        methods: preloadMethods,
    });

    connection.promise
        .then((parent) => {
            if (!parent) {
                console.error(
                    `${PENPAL_CHILD_CHANNEL} - Failed to setup penpal connection: child is null`,
                );
                reconnect();
                return;
            }
            const remote = parent as unknown as PromisifiedPenpalParentMethods;
            penpalParent = remote;
            console.log(`${PENPAL_CHILD_CHANNEL} - Penpal connection set`);
        })
        .finally(() => {
            isConnecting = false;
        });

    connection.promise.catch((error) => {
        console.error(`${PENPAL_CHILD_CHANNEL} - Failed to setup penpal connection:`, error);
        reconnect();
    });

    return penpalParent;
};

const reconnect = debounce(() => {
    if (isConnecting) return;

    console.log(`${PENPAL_CHILD_CHANNEL} - Reconnecting to penpal parent`);
    penpalParent = null; // Reset the parent before reconnecting
    createMessageConnection();
}, 1000);

createMessageConnection();

// Preview-site theme toggle: the editor's bottom bar broadcasts
// { type: 'weblab:preview-theme', theme: 'light' | 'dark' | 'system' } via
// postMessage. We mirror the value onto <html data-weblab-preview-theme="…">
// and add/remove the conventional `dark` class so user code (Tailwind, CSS
// `prefers-color-scheme`, framework theme providers) can react.
type PreviewTheme = 'light' | 'dark' | 'system';
const PREVIEW_THEME_MESSAGE_TYPE = 'weblab:preview-theme';

let systemThemeMediaQuery: MediaQueryList | null = null;
let systemThemeListener: ((e: MediaQueryListEvent) => void) | null = null;

const applyPreviewTheme = (theme: PreviewTheme): void => {
    if (theme !== 'system' && systemThemeListener && systemThemeMediaQuery) {
        systemThemeMediaQuery.removeEventListener('change', systemThemeListener);
        systemThemeMediaQuery = null;
        systemThemeListener = null;
    }

    const root = document.documentElement;
    root.setAttribute('data-weblab-preview-theme', theme);
    const resolved =
        theme === 'system'
            ? window.matchMedia?.('(prefers-color-scheme: dark)').matches
                ? 'dark'
                : 'light'
            : theme;
    root.classList.toggle('dark', resolved === 'dark');
    root.style.colorScheme = resolved;

    if (theme === 'system' && !systemThemeMediaQuery) {
        const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
        if (mq) {
            systemThemeMediaQuery = mq;
            systemThemeListener = (e: MediaQueryListEvent) => {
                const r = document.documentElement;
                r.classList.toggle('dark', e.matches);
                r.style.colorScheme = e.matches ? 'dark' : 'light';
            };
            mq.addEventListener('change', systemThemeListener);
        }
    }
};

window.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as { type?: string; theme?: PreviewTheme } | null;
    if (data?.type !== PREVIEW_THEME_MESSAGE_TYPE) return;
    // Fail closed: if we never resolved a trusted parent origin (e.g. the
    // penpal connection failed), drop all theme messages rather than
    // accepting them from arbitrary origins.
    if (trustedOrigins.length === 0 || !trustedOrigins.includes(event.origin)) return;
    const theme = data.theme;
    if (theme === 'light' || theme === 'dark' || theme === 'system') {
        applyPreviewTheme(theme);
    }
});
