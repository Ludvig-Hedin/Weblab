import { CLOUD_PILOT_TEMPLATE, isPublicHttpsUrl } from '@convex/lib/cloudPilot';

import type { PilotContent } from '@convex/lib/cloudPilot';

export function PilotTemplate({ template, content }: { template: string; content: PilotContent }) {
    if (template !== CLOUD_PILOT_TEMPLATE) throw new Error('PILOT_UNSUPPORTED');
    return (
        <article
            className={`mx-auto w-full max-w-4xl bg-white px-6 py-12 text-neutral-950 sm:px-12 ${content.alignment === 'center' ? 'text-center' : 'text-left'}`}
        >
            {content.imageUrl && isPublicHttpsUrl(content.imageUrl) && (
                // External assets load only in the browser, without a server-side image proxy.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={content.imageUrl}
                    alt={content.imageAlt}
                    referrerPolicy="no-referrer"
                    className="mb-8 max-h-96 w-full object-contain"
                />
            )}
            <h1 className="text-3xl font-medium break-words sm:text-4xl">{content.title}</h1>
            {content.description && (
                <p className="mt-5 text-base leading-relaxed break-words whitespace-pre-wrap text-neutral-700">
                    {content.description}
                </p>
            )}
            {content.ctaLabel && isPublicHttpsUrl(content.ctaHref) && (
                <a
                    href={content.ctaHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-7 inline-block rounded-md bg-neutral-950 px-5 py-3 text-sm text-white focus-visible:outline-2 focus-visible:outline-offset-4"
                >
                    {content.ctaLabel}
                </a>
            )}
        </article>
    );
}
