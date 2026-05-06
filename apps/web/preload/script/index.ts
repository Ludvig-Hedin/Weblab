import debounce from 'lodash/debounce';
import { connect, WindowMessenger } from 'penpal';

import type { PromisifiedPenpalParentMethods } from '@weblab/penpal';
import { PENPAL_CHILD_CHANNEL } from '@weblab/penpal';

import { preloadMethods } from './api';

export let penpalParent: PromisifiedPenpalParentMethods | null = null;
let isConnecting = false;

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
        `${PENPAL_CHILD_CHANNEL} - Could not determine parent origin; falling back to '*'`,
    );
    return ['*'];
};

const createMessageConnection = async () => {
    if (isConnecting || penpalParent) {
        return penpalParent;
    }

    isConnecting = true;
    console.log(`${PENPAL_CHILD_CHANNEL} - Creating penpal connection`);

    const remoteWindow = findWeblabParent();
    const messenger = new WindowMessenger({
        remoteWindow,
        allowedOrigins: getTrustedParentOrigins(remoteWindow),
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
