'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { BrandLogo } from '@weblab/ui/brand';
import { Button } from '@weblab/ui/button';
import { desktopHandoffUrl, type DesktopAuthProtocol } from '@/lib/desktop-handoff';

interface DesktopHandoffClientProps {
    ticket: string;
    state: string;
    protocol: DesktopAuthProtocol;
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
export function DesktopHandoffClient({ ticket, state, protocol }: DesktopHandoffClientProps) {
    const deepLink = desktopHandoffUrl({ protocol, ticket, state });
    const [retried, setRetried] = useState(false);
    // True once the deep link most likely did not reach the desktop app: the
    // page never lost focus in the first few seconds. When the OS handles
    // `weblab://`, focus leaves this document (the app comes forward or an
    // "Open Weblab?" prompt appears), so any blur counts as a launch and
    // keeps the hint hidden. This page is only reached from the desktop app,
    // so a stall means a blocked or dismissed prompt, not a missing install.
    const [stalled, setStalled] = useState(false);
    useEffect(() => {
        let left = false;
        const markLeft = () => {
            left = true;
            setStalled(false);
        };
        window.addEventListener('blur', markLeft);
        document.addEventListener('visibilitychange', markLeft);
        const id = window.setTimeout(() => {
            if (!left && document.visibilityState === 'visible' && document.hasFocus()) {
                setStalled(true);
            }
        }, 4000);
        return () => {
            window.clearTimeout(id);
            window.removeEventListener('blur', markLeft);
            document.removeEventListener('visibilitychange', markLeft);
        };
    }, []);

    useEffect(() => {
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
        // focused/visible we show a hint to allow the browser prompt.
        return () => {
            window.clearTimeout(mountId);
            window.clearTimeout(fallbackId);
            iframe.remove();
        };
    }, [deepLink]);

    function manualRetry() {
        window.location.href = deepLink;
        setRetried(true);
    }

    return (
        <div className="relative flex h-screen w-screen items-center justify-center">
            <div className="flex w-full max-w-sm flex-col items-center px-6 text-center">
                <BrandLogo className="h-5" />
                <h1 className="text-title3 mt-10">Finishing sign-in</h1>
                <p className="text-foreground-secondary text-regular mt-2">
                    {stalled
                        ? 'Weblab didn’t open. If your browser asks, allow it to open Weblab.'
                        : 'Taking you back to the Weblab app.'}
                </p>
                <div className="mt-8 flex items-center gap-2">
                    <Button size="pill" onClick={manualRetry}>
                        {retried ? 'Try again' : 'Open Weblab'}
                    </Button>
                    <Button asChild size="pill" variant="ghost">
                        <Link href="/projects">Continue in browser</Link>
                    </Button>
                </div>
            </div>
        </div>
    );
}
