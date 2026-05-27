'use client';

import { useEffect, useState } from 'react';

import { BrandLogo } from '@weblab/ui/brand';

interface DesktopHandoffClientProps {
    ticket: string;
}

/**
 * Browser-side bridge that hands a Clerk sign-in ticket back to the desktop
 * shell via the `weblab://` custom protocol. Rendered by the server page only
 * for an already-signed-in user; the ticket is one-time and TTL-bounded.
 *
 * Why a client component (vs. a server-side redirect): Next.js' `redirect()`
 * sends an HTTP 3xx pointing at the `weblab://` URL, and most browsers refuse
 * to follow a cross-scheme 3xx. Setting `window.location.href` inside the
 * page is the pattern that reliably triggers the OS protocol handler.
 */
export function DesktopHandoffClient({ ticket }: DesktopHandoffClientProps) {
    const [retried, setRetried] = useState(false);

    useEffect(() => {
        // Fire the protocol redirect on mount. We wrap in `setTimeout(0)` so
        // the initial paint commits first — without it, some browsers swallow
        // the protocol launch (no user gesture associated with the
        // navigation) and the user lands on a blank tab with no feedback.
        const deepLink = `weblab://auth/handoff?ticket=${encodeURIComponent(ticket)}`;
        const id = window.setTimeout(() => {
            window.location.href = deepLink;
        }, 0);
        return () => window.clearTimeout(id);
    }, [ticket]);

    function manualRetry() {
        const deepLink = `weblab://auth/handoff?ticket=${encodeURIComponent(ticket)}`;
        window.location.href = deepLink;
        setRetried(true);
    }

    return (
        <div className="relative flex h-screen w-screen items-center justify-center">
            <div className="flex w-full max-w-md flex-col items-center gap-8 px-6 text-center">
                <BrandLogo className="h-5" />
                <div className="space-y-2">
                    <h1 className="text-title2 leading-tight">Returning to Weblab…</h1>
                    <p className="text-foreground-secondary text-regular">
                        Your browser is handing sign-in back to the desktop app.
                    </p>
                </div>
                <p className="text-foreground-tertiary text-small">
                    If the desktop window didn&apos;t come forward, click below.
                </p>
                <button
                    type="button"
                    onClick={manualRetry}
                    className="text-foreground-primary text-small underline underline-offset-4 transition-opacity hover:opacity-80"
                >
                    {retried ? 'Open Weblab again' : 'Open Weblab'}
                </button>
            </div>
        </div>
    );
}
