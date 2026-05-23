import Image from 'next/image';

import { cn } from '@weblab/ui/utils';

/**
 * Blurred pastel image backdrop for landing-page asset widgets.
 *
 * Recipe:
 * - Image fills container via `object-cover`, blurred to a soft wash so the
 *   widget on top stays readable.
 * - Dark veil softens the wash and ensures consistent contrast for the
 *   semi-transparent dark widget surfaces (background-secondary/80).
 * - Caller controls aspect, padding, and centering via `className`.
 */
export function FeatureBackdrop({
    src,
    className,
    children,
}: {
    src: string;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <div className={cn('relative overflow-hidden rounded-lg', className)}>
            <Image
                src={src}
                alt=""
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="pointer-events-none scale-110 object-cover blur-2xl"
                aria-hidden
            />
            <div className="bg-background/55 pointer-events-none absolute inset-0" aria-hidden />
            <div className="relative flex h-full w-full items-center justify-center">
                {children}
            </div>
        </div>
    );
}

export const FEATURE_BACKDROP_SRCS = {
    pearl: '/assets/landing/feature-backdrops/pearl.webp',
    mist: '/assets/landing/feature-backdrops/mist.webp',
    sky: '/assets/landing/feature-backdrops/sky.webp',
    sand: '/assets/landing/feature-backdrops/sand.webp',
    ivory: '/assets/landing/feature-backdrops/ivory.webp',
} as const;
