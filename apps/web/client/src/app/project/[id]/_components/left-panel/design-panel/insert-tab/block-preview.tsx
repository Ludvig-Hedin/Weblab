import type { ShadcnBlockCategory } from '@weblab/constants';
import { cn } from '@weblab/ui/utils';

/**
 * Lightweight, category-aware skeleton thumbnail for shadcn blocks.
 *
 * Real screenshot previews require either bundling images or rendering
 * registry components into a sandboxed iframe — both heavyweight. Until that
 * pipeline exists, these skeletons give users a *shape*: they show roughly how
 * the block is composed (e.g., CTA = headline + button, Logos = grid of pills,
 * Analytics = chart bars), which is far more useful than a name alone.
 *
 * Plug in real images later by setting `previewImageUrl` on the manifest entry
 * and rendering an <img> here when present.
 */

interface BlockPreviewProps {
    category: ShadcnBlockCategory;
    /** Optional override — variant suffix to vary the skeleton per block. */
    seed?: string;
    className?: string;
}

const SKELETON_BG = 'bg-foreground-quadranary/20';
const SKELETON_ACCENT = 'bg-foreground-quadranary/40';
const SKELETON_BRAND = 'bg-foreground-brand/40';

export const BlockPreview = ({ category, seed = '', className }: BlockPreviewProps) => {
    return (
        <div
            className={cn(
                'bg-background-canvas/50 ring-border/40 relative aspect-[16/10] w-full overflow-hidden rounded-md ring-1',
                className,
            )}
        >
            <SkeletonForCategory category={category} seed={seed} />
        </div>
    );
};

const SkeletonForCategory = ({
    category,
    seed,
}: {
    category: ShadcnBlockCategory;
    seed: string;
}) => {
    // Hash the seed into a small int so visually-similar blocks get visually-similar previews
    // (so e.g. cta34/cta35 don't all look identical — they shouldn't, but they ARE all CTAs).
    const variant = simpleHash(seed) % 3;

    switch (category) {
        case 'cta':
            return <CTASkeleton variant={variant} />;
        case 'logos':
            return <LogosSkeleton variant={variant} />;
        case 'analytics':
            return <AnalyticsSkeleton variant={variant} />;
        case 'company':
            return <CompanySkeleton variant={variant} />;
        case 'commerce':
            return <CommerceSkeleton variant={variant} />;
        case 'content':
            return <ContentSkeleton variant={variant} />;
        case 'help':
            return <HelpSkeleton variant={variant} />;
        case 'primitive':
        default:
            return <PrimitiveSkeleton variant={variant} />;
    }
};

const CTASkeleton = ({ variant }: { variant: number }) => (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-3">
        <div className={cn('h-1.5 rounded-full', SKELETON_BG, variant === 0 ? 'w-1/2' : 'w-2/3')} />
        <div className={cn('h-1 rounded-full', SKELETON_ACCENT, 'w-3/4')} />
        <div className="mt-1 flex items-center gap-1">
            <div className={cn('h-2 w-8 rounded-sm', SKELETON_BRAND)} />
            {variant !== 1 && <div className={cn('h-2 w-6 rounded-sm', SKELETON_ACCENT)} />}
        </div>
    </div>
);

const LogosSkeleton = ({ variant }: { variant: number }) => (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-3">
        {variant === 0 && <div className={cn('h-1.5 w-1/3 rounded-full', SKELETON_BG)} />}
        <div className="grid w-full grid-cols-5 gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className={cn('h-2 rounded-sm', SKELETON_ACCENT)} />
            ))}
        </div>
    </div>
);

const AnalyticsSkeleton = ({ variant }: { variant: number }) => (
    <div className="flex h-full w-full items-end gap-1 p-3">
        {[40, 65, 30, 80, 55, 70, 45].map((h, i) => (
            <div
                key={i}
                className={cn(
                    'flex-1 rounded-sm',
                    i === variant + 2 ? SKELETON_BRAND : SKELETON_ACCENT,
                )}
                style={{ height: `${h}%` }}
            />
        ))}
    </div>
);

const CompanySkeleton = ({ variant }: { variant: number }) => (
    <div className="flex h-full w-full gap-2 p-3">
        <div
            className={cn(
                'h-full flex-shrink-0 rounded-sm',
                SKELETON_ACCENT,
                variant === 0 ? 'w-10' : 'w-1/3',
            )}
        />
        <div className="flex flex-1 flex-col justify-center gap-1.5">
            <div className={cn('h-1.5 rounded-full', SKELETON_BG, 'w-3/4')} />
            <div className={cn('h-1 rounded-full', SKELETON_ACCENT, 'w-full')} />
            <div className={cn('h-1 rounded-full', SKELETON_ACCENT, 'w-5/6')} />
        </div>
    </div>
);

const CommerceSkeleton = ({ variant }: { variant: number }) => (
    <div className="grid h-full w-full grid-cols-3 gap-1 p-3">
        {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1 overflow-hidden rounded-sm">
                <div className={cn('aspect-square w-full', SKELETON_ACCENT)} />
                <div className={cn('h-1 w-2/3 rounded-full', SKELETON_BG)} />
                {variant === 1 && <div className={cn('h-1 w-1/3 rounded-full', SKELETON_BRAND)} />}
            </div>
        ))}
    </div>
);

const ContentSkeleton = ({ variant }: { variant: number }) => (
    <div className="flex h-full w-full flex-col justify-center gap-1.5 p-3">
        <div className={cn('h-1.5 rounded-full', SKELETON_BG, variant === 0 ? 'w-1/2' : 'w-2/3')} />
        <div className={cn('h-1 rounded-full', SKELETON_ACCENT, 'w-full')} />
        <div className={cn('h-1 rounded-full', SKELETON_ACCENT, 'w-11/12')} />
        <div className={cn('h-1 rounded-full', SKELETON_ACCENT, 'w-4/5')} />
    </div>
);

const HelpSkeleton = ({ variant }: { variant: number }) => (
    <div className="flex h-full w-full flex-col gap-1 p-3">
        {Array.from({ length: 3 }).map((_, i) => (
            <div
                key={i}
                className={cn(
                    'flex items-center gap-1.5 rounded-sm px-1.5 py-1',
                    i === variant % 3 ? 'bg-foreground-quadranary/15' : '',
                )}
            >
                <div className={cn('h-1 flex-1 rounded-full', SKELETON_BG)} />
                <div className={cn('h-2 w-2 rounded-full', SKELETON_ACCENT)} />
            </div>
        ))}
    </div>
);

const PrimitiveSkeleton = ({ variant }: { variant: number }) => (
    <div className="flex h-full w-full items-center justify-center gap-1.5 p-3">
        <div
            className={cn(
                'rounded-sm',
                SKELETON_BRAND,
                variant === 0 ? 'h-3 w-12' : variant === 1 ? 'h-4 w-4' : 'h-2 w-16',
            )}
        />
    </div>
);

function simpleHash(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        hash = (hash * 31 + input.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
}
