'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '@weblab/ui/utils';

import { getFaviconUrl } from './project-card-utils';
import { isNonEmbeddable } from './project-preview-utils';

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
    // Live iframe — only the published site, and only when embeddable.
    //
    // We intentionally do NOT fall back to the raw sandbox dev-server URL: a
    // freshly created or cold sandbox returns HTTP 502 until its dev server
    // binds a port, and an iframe "loads" that 502 error page successfully
    // (onError never fires), so the card would render a "502 Bad Gateway" tile.
    // With the server liveness probe still unported to Convex there's no way to
    // know the sandbox is healthy before embedding it, so we keep the calm
    // skeleton/favicon placeholder until a real screenshot is captured.
    // `sandboxPreviewUrl` is retained on the props for callers but is no longer
    // embedded.
    const iframeUrl: string | null = siteUrl && !isNonEmbeddable(siteUrl) ? siteUrl : null;

    // Pulse only while actively waiting for a preview to paint.
    const isLoadingPreview =
        (Boolean(imageUrl && !imageFailed) && !imageLoaded) ||
        (Boolean(!imageUrl && iframeUrl) && !iframeLoaded && !iframeTimedOut);

    // Give the iframe 6 s before giving up and showing the skeleton fallback.
    // Without this, cards with unresponsive or iframe-blocking preview URLs
    // would display a blank white frame indefinitely.
    useEffect(() => {
        if (!iframeUrl || imageUrl || iframeLoaded) return;
        const t = window.setTimeout(() => setIframeTimedOut(true), 6000);
        return () => window.clearTimeout(t);
    }, [iframeLoaded, imageUrl, iframeUrl]);

    const shouldRenderIframe = Boolean(
        !shouldRenderImage && iframeUrl && (iframeLoaded || !iframeTimedOut),
    );
    const showFavicon =
        !shouldRenderImage && !shouldRenderIframe && Boolean(faviconUrl && !faviconFailed);
    // Brand-new projects have no screenshot, no published site, and no favicon
    // yet — show a calm branded mark instead of a blank tile so the card reads
    // as "new / preview pending" rather than empty or broken.
    const showPlaceholder = !shouldRenderImage && !shouldRenderIframe && !showFavicon;

    return (
        <div
            ref={containerRef}
            className={cn(
                'relative overflow-hidden rounded-xl',
                showPlaceholder ? 'bg-white' : 'bg-background-canvas',
                className,
            )}
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

            {/* White placeholder — blank projects render a white page, so
                this tile faithfully represents the actual site content
                while a real screenshot is pending. */}
            {showPlaceholder && <div className="absolute inset-0 bg-white" />}

            {/* Subtle bottom vignette so the info row blends in */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-black/18 to-transparent" />
        </div>
    );
};
