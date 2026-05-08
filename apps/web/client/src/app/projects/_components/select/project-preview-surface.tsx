'use client';

import { useEffect, useState } from 'react';

import { cn } from '@weblab/ui/utils';

import { getFaviconUrl } from './project-card-utils';

interface ProjectPreviewSurfaceProps {
    projectName: string;
    imageUrl: string | null;
    siteUrl?: string | null;
    className?: string;
}

const FallbackPreview = ({ projectName }: { projectName: string }) => {
    const initial = projectName.trim().charAt(0).toUpperCase() || '?';
    return (
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-[inherit] bg-[#111]">
            {/* Subtle radial highlight */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(255,255,255,0.045),transparent_60%)]" />
            {/* Faint grid lines */}
            <div
                className="absolute inset-0 opacity-[0.04]"
                style={{
                    backgroundImage:
                        'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)',
                    backgroundSize: '32px 32px',
                }}
            />
            {/* Initial letter */}
            <span className="relative text-5xl font-semibold text-white/10 select-none">
                {initial}
            </span>
        </div>
    );
};

/**
 * Some hosts inject a consent/warning dialog when embedded in an iframe
 * (e.g. CodeSandbox preview domains). Skip the iframe for these and fall
 * back to the skeleton — the user can still open the full page by clicking.
 */
function isNonEmbeddable(url: string): boolean {
    try {
        const { hostname } = new URL(url);
        return hostname.endsWith('.csb.app') || hostname.endsWith('.codesandbox.io');
    } catch {
        return false;
    }
}

export const ProjectPreviewSurface = ({
    projectName,
    imageUrl,
    siteUrl,
    className,
}: ProjectPreviewSurfaceProps) => {
    const [imageFailed, setImageFailed] = useState(false);
    const [iframeLoaded, setIframeLoaded] = useState(false);
    const [iframeTimedOut, setIframeTimedOut] = useState(false);
    const [faviconFailed, setFaviconFailed] = useState(false);

    const faviconUrl = siteUrl ? getFaviconUrl(siteUrl) : null;

    useEffect(() => {
        setImageFailed(false);
        setIframeLoaded(false);
        setIframeTimedOut(false);
        setFaviconFailed(false);
    }, [imageUrl, siteUrl]);

    // Give the iframe 6 s before giving up and showing the skeleton fallback.
    // Without this, cards with unresponsive or iframe-blocking preview URLs
    // would display a blank white frame indefinitely.
    useEffect(() => {
        if (!siteUrl || imageUrl || iframeLoaded) return;
        const t = window.setTimeout(() => setIframeTimedOut(true), 6000);
        return () => window.clearTimeout(t);
    }, [iframeLoaded, imageUrl, siteUrl]);

    const shouldRenderImage = Boolean(imageUrl && !imageFailed);
    const shouldRenderIframe = Boolean(
        !shouldRenderImage &&
            siteUrl &&
            !isNonEmbeddable(siteUrl) &&
            (iframeLoaded || !iframeTimedOut),
    );
    const showFavicon =
        !shouldRenderImage && !shouldRenderIframe && Boolean(faviconUrl && !faviconFailed);

    return (
        <div className={cn('relative overflow-hidden rounded-xl bg-[#1c1c1c]', className)}>
            <FallbackPreview projectName={projectName} />

            {/* Screenshot */}
            {shouldRenderImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={imageUrl!}
                    alt={projectName}
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                    onError={() => setImageFailed(true)}
                />
            )}

            {/* Live preview — site rendered at ~1200 px then scaled to fit the card.
                The wrapper must carry rounded-[inherit] so the browser clips the
                scaled iframe at the same radius as the outer container. bg-white is
                intentionally absent — it caused white-corner bleed-through on the
                non-hover state due to the CSS transform + overflow:hidden quirk. */}
            {shouldRenderIframe && (
                <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
                    <iframe
                        src={siteUrl!}
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
