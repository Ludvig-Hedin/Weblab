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
 * to follow a cross-scheme 3xx. A client-side scheme launch — a hidden iframe,
 * with a `window.location.href` fallback — is the pattern that reliably
 * triggers the OS protocol handler while keeping this page on screen.
 */
export function DesktopHandoffClient({ ticket }: DesktopHandoffClientProps) {
    const [retried, setRetried] = useState(false);

    useEffect(() => {
        const deepLink = `weblab://auth/handoff?ticket=${encodeURIComponent(ticket)}`;

        // Launch the desktop app WITHOUT navigating this tab away. Assigning
        // `window.location.href = 'weblab://…'` works, but most browsers blank
        // the tab to about:blank while the OS resolves the handler — so the
        // user stares at an empty page (worse when handler resolution is slow,
        // e.g. an unpackaged dev build). Triggering the scheme through a hidden
        // iframe keeps the "Finishing sign-in…" UI visible in Chromium/Firefox.
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        // setTimeout(0) so the first paint commits before we touch the DOM —
        // some browsers swallow a protocol launch fired during initial render.
        const mountId = window.setTimeout(() => {
            iframe.src = deepLink;
            document.body.appendChild(iframe);
        }, 0);

        // Safari ignores custom-scheme iframe navigations, so fall back to a
        // top-level navigation — but only while this tab still has focus. Once
        // the OS "Open Weblab?" prompt appears (the Chromium path), focus
        // leaves the document, so we skip the fallback to avoid blanking the
        // page or launching the handler twice.
        const fallbackId = window.setTimeout(() => {
            if (document.visibilityState === 'visible' && document.hasFocus()) {
                window.location.href = deepLink;
            }
        }, 1200);

        // TODO(bug-hunt): no detection / fallback if `weblab://` isn't
        // registered (user uninstalled the desktop app, browser blocks unknown
        // schemes). User stays on the spinner; only escape is the manual
        // "Open Weblab" button. Consider a ~3-5s timeout with a "Don't have
        // Weblab desktop? Download here" fallback. See CODE_REVIEW_BACKLOG.md →
        // "Bug Hunt 2026-05-28 — Desktop auth".
        return () => {
            window.clearTimeout(mountId);
            window.clearTimeout(fallbackId);
            iframe.remove();
        };
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
                    <h1 className="text-title2 leading-tight">Finishing sign-in…</h1>
                    <p className="text-foreground-secondary text-regular">
                        Taking you back to the Weblab app.
                    </p>
                </div>
                <p className="text-foreground-tertiary text-small">
                    Didn&apos;t switch back automatically?
                </p>
                <button
                    type="button"
                    onClick={manualRetry}
                    className="text-foreground-primary text-small underline underline-offset-4 transition-opacity hover:opacity-80"
                >
                    {retried ? 'Try again' : 'Open Weblab'}
                </button>
            </div>
        </div>
    );
}
