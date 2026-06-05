import type { CSSProperties } from 'react';

import { cn } from '@weblab/ui/utils';

import './marketing-motion.css';

/** Seconds of extra delay applied per character, left → right. */
const CHAR_DELAY = 0.012;

/**
 * Splits a label into per-character cells for the roll-up "stagger" hover
 * effect. Each cell clips to one glyph and holds two real copies — a top copy
 * (visible at rest) and an identical bottom copy parked one glyph-height below.
 * On hover both roll up so the bottom copy takes the top's place. Both copies
 * inherit `currentColor`, so the label stays readable when the button flips its
 * text color on hover.
 *
 * The visible copies are decorative; a single `sr-only` copy carries the
 * accessible name. Drive the animation by adding `wl-stagger-group` to the
 * nearest hoverable ancestor (the button or link). Children must be a string.
 */
export function StaggerText({ children, className }: { children: string; className?: string }) {
    const text = children;

    return (
        <span className={cn('wl-stagger', className)}>
            <span className="sr-only">{text}</span>
            <span aria-hidden="true" className="wl-stagger__row">
                {Array.from(text).map((char, index) => {
                    // Non-breaking space preserves width inside inline-block.
                    const glyph = char === ' ' ? ' ' : char;
                    return (
                        <span
                            // Index is part of the key because repeated glyphs
                            // are legitimate (e.g. "Get started" has two "t"s).
                            key={`${char}-${index}`}
                            className="wl-stagger__char"
                            style={{ '--wl-char-delay': `${index * CHAR_DELAY}s` } as CSSProperties}
                        >
                            <span className="wl-stagger__top">{glyph}</span>
                            <span className="wl-stagger__bottom">{glyph}</span>
                        </span>
                    );
                })}
            </span>
        </span>
    );
}
