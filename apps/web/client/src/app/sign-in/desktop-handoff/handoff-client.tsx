'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

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
    // True once we're fairly sure the deep link never reached a desktop app.
    // When the OS handles `weblab://`, focus leaves this document (the app comes
    // forward / an "Open Weblab?" prompt appears), so a still-focused, still-
    // visible page after a few seconds means the scheme almost certainly isn't
    // registered — the user doesn't have the desktop app (or the browser
    // blocked the launch). Surface concrete escapes instead of an endless
    // spinner. Closes the TODO(bug-hunt) gap noted below.
    const [stalled, setStalled] = useState(false);
    useEffect(() => {
        const id = window.setTimeout(() => {
            if (document.visibilityState === 'visible' && document.hasFocus()) {
                setStalled(true);
            }
        }, 4000);
        return () => window.clearTimeout(id);
    }, []);

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

        // Detection for an unregistered `weblab://` (user uninstalled the
        // desktop app, browser blocks unknown schemes) is handled by the
        // separate `stalled` timer above: after ~4s with the page still
        // focused/visible we surface "Download desktop / Continue in browser"
        // fallbacks instead of leaving the user on the spinner.
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

                {/* The deep link never switched away — the desktop app likely
                    isn't installed, or the browser blocked the scheme. Give the
                    user a real way out instead of an endless spinner. */}
                {stalled && (
                    <div className="border-foreground/10 mt-2 flex flex-col items-center gap-3 border-t pt-6">
                        <p className="text-foreground-secondary text-small">
                            Don&apos;t have the Weblab desktop app?
                        </p>
                        <div className="flex items-center gap-4">
                            <Link
                                href="/download"
                                className="text-foreground-primary text-small underline underline-offset-4 transition-opacity hover:opacity-80"
                            >
                                Download the app
                            </Link>
                            <Link
                                href="/projects"
                                className="text-foreground-secondary text-small underline underline-offset-4 transition-opacity hover:opacity-80"
                            >
                                Continue in browser
                            </Link>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
