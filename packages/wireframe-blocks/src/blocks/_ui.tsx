import { Star } from 'lucide-react';

/**
 * Shared helpers for the wireframe blocks. The blocks themselves render with the
 * REAL standard shadcn primitives (Button, Card, Accordion, Avatar, Separator);
 * these helpers only cover the few bits shadcn doesn't ship (a neutral media
 * placeholder, an eyebrow label, a star row, a logo mark). Standard Tailwind
 * utilities only, so the same source renders in the Weblab canvas AND boots in
 * an emitted plain-Tailwind + tokens project.
 */

export interface NavLink {
    label: string;
    href: string;
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
    return <p className="text-muted-foreground text-sm font-semibold tracking-wide">{children}</p>;
}

/** Neutral media placeholder — the grayscale box used across wireframes. */
export function Media({
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

export function Stars({ count = 5 }: { count?: number }) {
    return (
        <div className="flex gap-0.5" aria-hidden="true">
            {Array.from({ length: count }).map((_, i) => (
                <Star key={i} className="text-foreground fill-foreground h-4 w-4" />
            ))}
        </div>
    );
}

export function LogoMark({ label = 'Logo' }: { label?: string }) {
    return (
        <span className="text-foreground inline-flex items-center gap-2 font-semibold tracking-tight">
            <span className="bg-foreground h-5 w-5 rounded-md" aria-hidden="true" />
            {label}
        </span>
    );
}
