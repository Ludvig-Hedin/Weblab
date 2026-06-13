/**
 * Shared, dependency-free building blocks for every wireframe section.
 *
 * Pure React + Tailwind design-token classes + inline SVG — NO shadcn/radix/
 * lucide/next-image imports. This is what lets a block render identically inside
 * the Weblab canvas AND boot, unchanged, inside an emitted blank Next.js project
 * (which ships only React + Tailwind + the token contract). Keep it that way:
 * anything added here must resolve with zero extra npm dependencies.
 */

export interface NavLink {
    label: string;
    href: string;
}

export type ActionVariant = 'primary' | 'secondary' | 'ghost';

export function ActionButton({
    label,
    href = '#',
    variant = 'primary',
}: {
    label: string;
    href?: string;
    variant?: ActionVariant;
}) {
    const base =
        'inline-flex items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
    const styles: Record<ActionVariant, string> = {
        primary: 'bg-primary text-primary-foreground hover:opacity-90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-accent',
        ghost: 'px-1 text-foreground underline-offset-4 hover:underline',
    };
    return (
        <a href={href} className={`${base} ${styles[variant]}`}>
            {label}
            {variant === 'ghost' ? <IconArrow /> : null}
        </a>
    );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
    return <p className="text-muted-foreground text-sm font-semibold tracking-wide">{children}</p>;
}

/** Neutral image/media placeholder — the grayscale box used across wireframes. */
export function Placeholder({
    className = '',
    ratio = 'aspect-[4/3]',
}: {
    className?: string;
    ratio?: string;
}) {
    return (
        <div
            className={`border-border bg-muted/50 flex w-full items-center justify-center rounded-xl border ${ratio} ${className}`}
            aria-hidden="true"
        >
            <svg
                className="text-muted-foreground/40 h-10 w-10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
            >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="m21 15-5-5L5 21" />
            </svg>
        </div>
    );
}

export function IconArrow() {
    return (
        <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
        >
            <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
    );
}

export function IconCheck() {
    return (
        <svg
            className="text-foreground h-5 w-5 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
        >
            <path d="M20 6 9 17l-5-5" />
        </svg>
    );
}

export function Stars({ count = 5 }: { count?: number }) {
    return (
        <div className="flex gap-0.5" aria-hidden="true">
            {Array.from({ length: count }).map((_, i) => (
                <svg
                    key={i}
                    className="text-foreground h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                >
                    <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
            ))}
        </div>
    );
}

/** Round avatar placeholder (initial-free, neutral). */
export function AvatarDot({ className = '' }: { className?: string }) {
    return (
        <span className={`bg-muted inline-block rounded-full ${className}`} aria-hidden="true" />
    );
}

/** Square brand/logo placeholder used in navbars, footers, logo clouds. */
export function LogoMark({ label = 'Logo' }: { label?: string }) {
    return (
        <span className="text-foreground inline-flex items-center gap-2 font-semibold tracking-tight">
            <span className="bg-foreground h-5 w-5 rounded-md" aria-hidden="true" />
            {label}
        </span>
    );
}
