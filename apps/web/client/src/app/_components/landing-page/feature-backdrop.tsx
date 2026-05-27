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
        <div
            className={cn(
                'relative overflow-hidden rounded-lg',
                // Light: soft cream wash w/ subtle top tint + thin border
                'border border-black/5 bg-[radial-gradient(ellipse_120%_70%_at_50%_-10%,_#E6EAF0_0%,_#F2F0EA_60%,_#F2F0EA_100%)]',
                // Dark: no border, blurred image wash + dark veil for atmosphere
                'dark:border-0 dark:bg-transparent',
                className,
            )}
        >
            {/* Blurred image backdrop — light: white veil, dark: subtle dark veil */}
            <Image
                src={src}
                alt=""
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="pointer-events-none scale-110 object-cover blur-2xl brightness-125"
                aria-hidden
            />
            <div
                className="dark:bg-background/10 pointer-events-none absolute inset-0 bg-white/50"
                aria-hidden
            />
            <div className="absolute inset-0 z-10 flex items-center justify-center overflow-hidden">
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
