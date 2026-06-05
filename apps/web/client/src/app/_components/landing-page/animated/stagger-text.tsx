import type { CSSProperties } from 'react';

import { cn } from '@weblab/ui/utils';

import './marketing-motion.css';

/** Seconds of extra delay applied per character, left → right. */
const CHAR_DELAY = 0.012;

/**
 * Splits a label into per-character spans for the roll-up "stagger" hover
 * effect. The visible glyphs are decorative duplicates (the real copy lives
 * 1.3em below via text-shadow), so they are hidden from assistive tech and a
 * single `sr-only` copy carries the accessible name.
 *
 * Drive the animation by adding `wl-stagger-group` to the nearest hoverable
 * ancestor (the button or link). Children must be a plain string.
 */
export function StaggerText({ children, className }: { children: string; className?: string }) {
    const text = children;

    return (
        <span className={cn('wl-stagger', className)}>
            <span className="sr-only">{text}</span>
            <span aria-hidden="true" className="inline-flex">
                {Array.from(text).map((char, index) => (
                    <span
                        // Index is part of the key because repeated glyphs are
                        // legitimate (e.g. "Get started" has two "t"s).
                        key={`${char}-${index}`}
                        className="wl-stagger__char"
                        style={{ '--wl-char-delay': `${index * CHAR_DELAY}s` } as CSSProperties}
                    >
                        {/* Preserve space width when a glyph is a space. */}
                        <span>{char === ' ' ? ' ' : char}</span>
                    </span>
                ))}
            </span>
        </span>
    );
}
