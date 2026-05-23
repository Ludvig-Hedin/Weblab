'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '@weblab/ui/utils';

import { getFaviconUrl } from './project-card-utils';

interface ProjectPreviewSurfaceProps {
    projectName: string;
    imageUrl: string | null;
    siteUrl?: string | null;
    // Internal-only live preview URL (e.g. the running sandbox). Used as a
    // last-resort iframe fallback when there's no static screenshot AND no
    // published site. Pass null to disable.
    sandboxPreviewUrl?: string | null;
    className?: string;
}

// Loading placeholder shown beneath the image / iframe until one of them
// paints. Pulses only while actively waiting for a preview — cards with no
// preview at all stay still so they don't throb forever.
const PreviewSkeleton = ({ loading }: { loading: boolean }) => (
    <div
        className={cn(
            'bg-foreground/4 absolute inset-0 overflow-hidden rounded-[inherit]',
            loading && 'animate-pulse',
        )}
        aria-hidden
    >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(255,255,255,0.04),transparent_60%)]" />
    </div>
);

/**
 * Some hosts inject a consent/warning dialog when embedded in an iframe
 * (e.g. CodeSandbox preview domains) and others actively refuse with
 * `X-Frame-Options: DENY` (e.g. vercel.com marketing pages). Skip the
 * iframe for these and fall back to the skeleton — the user can still
 * open the full page by clicking.
 *
 * Exported so other surfaces (e.g. the templates detail page) can use the
 * same logic instead of re-implementing it and drifting.
 */
export function isNonEmbeddable(url: string): boolean {
    try {
        const { hostname } = new URL(url);
        return (
            hostname.endsWith('.csb.app') ||
            hostname.endsWith('.codesandbox.io') ||
            hostname === 'vercel.com' ||
            hostname.endsWith('.vercel.com')
        );
    } catch {
        return false;
    }
}

export const ProjectPreviewSurface = ({
    projectName,
    imageUrl,
    siteUrl,
    sandboxPreviewUrl,
    className,
}: ProjectPreviewSurfaceProps) => {
    const [imageFailed, setImageFailed] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [iframeLoaded, setIframeLoaded] = useState(false);
    const [iframeTimedOut, setIframeTimedOut] = useState(false);
    const [faviconFailed, setFaviconFailed] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);

    const faviconUrl = siteUrl ? getFaviconUrl(siteUrl) : null;

    useEffect(() => {
        setImageFailed(false);
        setImageLoaded(false);
        setIframeLoaded(false);
        setIframeTimedOut(false);
        setFaviconFailed(false);
    }, [imageUrl, siteUrl, sandboxPreviewUrl]);

    const shouldRenderImage = Boolean(imageUrl && !imageFailed);
    // Live iframe — prefer the published site (filters out non-embeddable
    // hosts like Vercel marketing pages). When unpublished, fall back to the
    // sandbox dev-server URL: it may show a consent dialog on CSB Free but
    // that's still more informative than a blank "M" tile. The csb.app
    // block in isNonEmbeddable applies to published sites only — sandbox
    // URLs deliberately bypass it.
    const iframeUrl: string | null =
        siteUrl && !isNonEmbeddable(siteUrl) ? siteUrl : (sandboxPreviewUrl ?? null);

    // TODO(convex-migration): port api.sandbox.checkAlive — no Convex equivalent yet.
    // Liveness probe is disabled; sandbox URLs will iframe-render directly until ported.
    const livenessQuery = {
        data: undefined as { state: string } | undefined,
        isLoading: false,
    };
    const sandboxLooksDead =
        livenessQuery.data?.state === 'gone' ||
        livenessQuery.data?.state === 'notFound' ||
        livenessQuery.data?.state === 'error';

    // Pulse only while actively waiting for a preview to paint.
    const isLoadingPreview =
        (Boolean(imageUrl && !imageFailed) && !imageLoaded) ||
        (Boolean(!imageUrl && iframeUrl) &&
            (livenessQuery.isLoading || (!sandboxLooksDead && !iframeLoaded && !iframeTimedOut)));

    // Give the iframe 6 s before giving up and showing the skeleton fallback.
    // Without this, cards with unresponsive or iframe-blocking preview URLs
    // would display a blank white frame indefinitely.
    useEffect(() => {
        if (!iframeUrl || imageUrl || iframeLoaded) return;
        const t = window.setTimeout(() => setIframeTimedOut(true), 6000);
        return () => window.clearTimeout(t);
    }, [iframeLoaded, imageUrl, iframeUrl]);

    const shouldRenderIframe = Boolean(
        !shouldRenderImage && iframeUrl && !sandboxLooksDead && (iframeLoaded || !iframeTimedOut),
    );
    const showFavicon =
        !shouldRenderImage && !shouldRenderIframe && Boolean(faviconUrl && !faviconFailed);

    return (
        <div
            ref={containerRef}
            className={cn('bg-background-canvas relative overflow-hidden rounded-xl', className)}
        >
            <PreviewSkeleton loading={isLoadingPreview} />

            {/* Screenshot — load eagerly + decode async so the first paint
                replaces the skeleton ASAP. fetchpriority="high" prompts the
                browser to schedule these ahead of below-fold thumbnails. */}
            {shouldRenderImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={imageUrl!}
                    alt={projectName}
                    className="absolute inset-0 h-full w-full object-cover"
                    decoding="async"
                    // @ts-expect-error fetchpriority is valid HTML5 but missing from React types
                    fetchpriority="high"
                    onLoad={() => setImageLoaded(true)}
                    onError={() => setImageFailed(true)}
                />
            )}

            {/* Live preview — site rendered at ~1200 px then scaled to fit the card.
                The wrapper must carry rounded-[inherit] so the browser clips the
                scaled iframe at the same radius as the outer container. bg-white is
                intentionally absent — it caused white-corner bleed-through on the
                non-hover state due to the CSS transform + overflow:hidden quirk. */}
            {shouldRenderIframe && iframeUrl && (
                <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
                    <iframe
                        src={iframeUrl}
                        title={`${projectName} preview`}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="pointer-events-none absolute top-0 left-0 border-0"
                        onLoad={() => setIframeLoaded(true)}
                        style={{
                            width: '300%',
                            height: '300%',
                            transformOrigin: 'top left',
                            transform: 'scale(0.3334)',
                        }}
                    />
                </div>
            )}

            {/* Favicon centred when no screenshot and iframe isn't rendering */}
            {showFavicon && (
                <div className="absolute inset-0 flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={faviconUrl!}
                        alt=""
                        className="h-10 w-10 rounded-lg opacity-35"
                        loading="lazy"
                        onError={() => setFaviconFailed(true)}
                    />
                </div>
            )}

            {/* Subtle bottom vignette so the info row blends in */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-black/18 to-transparent" />
        </div>
    );
};
