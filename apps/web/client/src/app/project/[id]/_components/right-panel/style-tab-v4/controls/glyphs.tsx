'use client';

/**
 * Inline SVG glyph library shared by every v4 control. Each glyph is
 * exported as a tiny `<svg>` component so callers can drop it into any
 * field's `glyph` slot without pulling lucide-react every time.
 *
 * All glyphs:
 *   - 16×16 viewBox
 *   - stroke 1.5, linecap/join round
 *   - `currentColor` so they inherit the surrounding text colour
 */
import * as React from 'react';

interface IconProps {
    size?: number;
    className?: string;
}

const Svg = React.forwardRef<SVGSVGElement, IconProps & React.SVGProps<SVGSVGElement>>(function Svg(
    { size = 14, className, children, ...rest },
    ref,
) {
    return (
        <svg
            ref={ref}
            width={size}
            height={size}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            {...rest}
        >
            {children}
        </svg>
    );
});

// ── Dimensions / position ─────────────────────────────────────────────

export function IconWidth(p: IconProps) {
    return (
        <Svg {...p}>
            <path d="M3 4v8M13 4v8M3 8h10" />
            <path d="M5 6L3 8l2 2M11 6l2 2-2 2" />
        </Svg>
    );
}

export function IconHeight(p: IconProps) {
    return (
        <Svg {...p}>
            <path d="M4 3h8M4 13h8M8 3v10" />
            <path d="M6 5L8 3l2 2M6 11l2 2 2-2" />
        </Svg>
    );
}

// ── Padding / margin ──────────────────────────────────────────────────

export function IconPadH(p: IconProps) {
    return (
        <Svg {...p}>
            <rect x="2" y="2" width="12" height="12" rx="1.5" />
            <line x1="5" y1="4.5" x2="5" y2="11.5" />
            <line x1="11" y1="4.5" x2="11" y2="11.5" />
        </Svg>
    );
}

export function IconPadV(p: IconProps) {
    return (
        <Svg {...p}>
            <rect x="2" y="2" width="12" height="12" rx="1.5" />
            <line x1="4.5" y1="5" x2="11.5" y2="5" />
            <line x1="4.5" y1="11" x2="11.5" y2="11" />
        </Svg>
    );
}

export function IconMarginH(p: IconProps) {
    return (
        <Svg {...p}>
            <rect x="2" y="2" width="12" height="12" rx="1.5" strokeDasharray="2 1.5" />
            <line x1="5" y1="4.5" x2="5" y2="11.5" />
            <line x1="11" y1="4.5" x2="11" y2="11.5" />
        </Svg>
    );
}

export function IconMarginV(p: IconProps) {
    return (
        <Svg {...p}>
            <rect x="2" y="2" width="12" height="12" rx="1.5" strokeDasharray="2 1.5" />
            <line x1="4.5" y1="5" x2="11.5" y2="5" />
            <line x1="4.5" y1="11" x2="11.5" y2="11" />
        </Svg>
    );
}

export function IconPerSide(p: IconProps) {
    return (
        <Svg {...p}>
            <rect x="2" y="2" width="12" height="12" rx="1.5" />
            <rect x="5.5" y="5.5" width="5" height="5" rx="0.5" />
        </Svg>
    );
}

export function IconPerSideDashed(p: IconProps) {
    return (
        <Svg {...p}>
            <rect x="2" y="2" width="12" height="12" rx="1.5" strokeDasharray="2 1.5" />
            <rect x="5.5" y="5.5" width="5" height="5" rx="0.5" />
        </Svg>
    );
}

export function IconPerCorner(p: IconProps) {
    return (
        <Svg {...p}>
            <rect x="2" y="2" width="12" height="12" rx="1.5" />
            <rect x="4.5" y="4.5" width="2" height="2" rx="0.3" />
            <rect x="9.5" y="4.5" width="2" height="2" rx="0.3" />
            <rect x="4.5" y="9.5" width="2" height="2" rx="0.3" />
            <rect x="9.5" y="9.5" width="2" height="2" rx="0.3" />
        </Svg>
    );
}

// ── Gap / radius ──────────────────────────────────────────────────────

export function IconGap(p: IconProps) {
    return (
        <Svg {...p}>
            <rect x="2.5" y="2.5" width="11" height="3" rx="0.5" />
            <rect x="2.5" y="10.5" width="11" height="3" rx="0.5" />
            <line x1="8" y1="7" x2="8" y2="9" />
        </Svg>
    );
}

export function IconRadius(p: IconProps) {
    return (
        <Svg {...p}>
            <path d="M2 8V5a3 3 0 0 1 3-3h3M14 8V5a3 3 0 0 0-3-3H8M2 8v3a3 3 0 0 0 3 3h3M14 8v3a3 3 0 0 1-3 3H8" />
        </Svg>
    );
}

// ── Layout flow ───────────────────────────────────────────────────────

export function IconBlock(p: IconProps) {
    return (
        <Svg {...p}>
            <rect x="2.5" y="3" width="11" height="10" rx="1" />
            <line x1="2.5" y1="8" x2="13.5" y2="8" />
        </Svg>
    );
}

export function IconFlexCol(p: IconProps) {
    return (
        <Svg {...p}>
            <rect x="2.5" y="3" width="11" height="3.5" rx="1" />
            <rect x="2.5" y="9.5" width="11" height="3.5" rx="1" />
        </Svg>
    );
}

export function IconFlexRow(p: IconProps) {
    return (
        <Svg {...p}>
            <rect x="3" y="2.5" width="3.5" height="11" rx="1" />
            <rect x="9.5" y="2.5" width="3.5" height="11" rx="1" />
        </Svg>
    );
}

export function IconGrid(p: IconProps) {
    return (
        <Svg {...p}>
            <rect x="2.5" y="2.5" width="5" height="5" rx="1" />
            <rect x="8.5" y="2.5" width="5" height="5" rx="1" />
            <rect x="2.5" y="8.5" width="5" height="5" rx="1" />
            <rect x="8.5" y="8.5" width="5" height="5" rx="1" />
        </Svg>
    );
}

// ── Text glyphs ───────────────────────────────────────────────────────

export function IconTypeT(p: IconProps) {
    return (
        <Svg {...p}>
            <path d="M4 4h8" />
            <path d="M8 4v9" />
            <path d="M6 13h4" />
        </Svg>
    );
}

export function IconLineHeight(p: IconProps) {
    return (
        <Svg {...p}>
            <path d="M2 3h12" />
            <path d="M2 13h12" />
            <path d="M8 6v4" />
            <path d="M6 6l2-2 2 2" />
            <path d="M6 10l2 2 2-2" />
        </Svg>
    );
}

export function IconLetterSpacing(p: IconProps) {
    return (
        <Svg {...p}>
            <path d="M2 11l1.5-5 1.5 5" />
            <path d="M2.5 9.5h2" />
            <path d="M11 11l1.5-5 1.5 5" />
            <path d="M11.5 9.5h2" />
            <path d="M6 13h4" />
            <path d="M7 12l-1 1 1 1" />
            <path d="M9 12l1 1-1 1" />
        </Svg>
    );
}

export function IconAlignLeft(p: IconProps) {
    return (
        <Svg {...p}>
            <line x1="3" y1="4" x2="13" y2="4" />
            <line x1="3" y1="8" x2="9" y2="8" />
            <line x1="3" y1="12" x2="11" y2="12" />
        </Svg>
    );
}

export function IconAlignCenter(p: IconProps) {
    return (
        <Svg {...p}>
            <line x1="3" y1="4" x2="13" y2="4" />
            <line x1="5" y1="8" x2="11" y2="8" />
            <line x1="4" y1="12" x2="12" y2="12" />
        </Svg>
    );
}

export function IconAlignRight(p: IconProps) {
    return (
        <Svg {...p}>
            <line x1="3" y1="4" x2="13" y2="4" />
            <line x1="7" y1="8" x2="13" y2="8" />
            <line x1="5" y1="12" x2="13" y2="12" />
        </Svg>
    );
}

export function IconAlignJustify(p: IconProps) {
    return (
        <Svg {...p}>
            <line x1="3" y1="4" x2="13" y2="4" />
            <line x1="3" y1="8" x2="13" y2="8" />
            <line x1="3" y1="12" x2="13" y2="12" />
        </Svg>
    );
}

export function IconCase(p: IconProps) {
    return (
        <Svg {...p}>
            <path d="M3 12l1.5-5 1.5 5" />
            <path d="M3.5 10.5h2" />
            <path d="M10 11.5a1.5 1.5 0 1 1-1.5-1.5h1.5v1.5z" />
            <path d="M10 8v3.5" />
        </Svg>
    );
}

export function IconDecoration(p: IconProps) {
    return (
        <Svg {...p}>
            <path d="M4 4h8" />
            <path d="M8 4v7" />
            <path d="M3 13h10" />
        </Svg>
    );
}

// ── Color row glyphs ──────────────────────────────────────────────────

export function IconEye(p: IconProps) {
    return (
        <Svg {...p}>
            <path d="M1.5 8c1.5-3 3.5-4.5 6.5-4.5S13 5 14.5 8c-1.5 3-3.5 4.5-6.5 4.5S3 11 1.5 8z" />
            <circle cx="8" cy="8" r="2" />
        </Svg>
    );
}

export function IconEyeOff(p: IconProps) {
    return (
        <Svg {...p}>
            <path d="M2 4l12 12" />
            <path d="M6 6.5a2 2 0 0 0 3 3" />
            <path d="M9.5 4c2.5 0.5 4 2 5 4-1 1.5-2 2.5-3 3" />
            <path d="M2 8c1.5-3 3.5-4.5 6.5-4.5" />
        </Svg>
    );
}

export function IconEyedropper(p: IconProps) {
    return (
        <Svg {...p}>
            <path d="M10.5 2.5l3 3-1.5 1.5-3-3z" />
            <path d="M9 4l-6.5 6.5L2 13l2.5-.5L11 6" />
        </Svg>
    );
}

export function IconConnectToken(p: IconProps) {
    return (
        <Svg {...p}>
            <rect x="2" y="6" width="6" height="4" rx="1.5" />
            <rect x="8" y="6" width="6" height="4" rx="1.5" />
            <path d="M6 8h4" />
        </Svg>
    );
}

export function IconLink(p: IconProps) {
    return (
        <Svg {...p}>
            <path d="M6.5 9.5L9.5 6.5" />
            <rect
                x="2.5"
                y="9"
                width="4.5"
                height="4.5"
                rx="1"
                transform="rotate(-45 4.75 11.25)"
            />
            <rect
                x="9"
                y="2.5"
                width="4.5"
                height="4.5"
                rx="1"
                transform="rotate(-45 11.25 4.75)"
            />
        </Svg>
    );
}

export function IconChain(p: IconProps) {
    return (
        <Svg {...p}>
            <path d="M6 6a2 2 0 0 1 2-2h1a2 2 0 0 1 0 4h-.5" />
            <path d="M10 10a2 2 0 0 1-2 2H7a2 2 0 0 1 0-4h.5" />
        </Svg>
    );
}

// ── Tag / element ─────────────────────────────────────────────────────

export function IconTagBrackets(p: IconProps) {
    return (
        <Svg {...p}>
            <path d="M5 4L2 8l3 4M11 4l3 4-3 4" />
        </Svg>
    );
}

export function IconPencil(p: IconProps) {
    return (
        <Svg {...p}>
            <path d="M10 3l3 3-7 7-3 1 1-3z" />
        </Svg>
    );
}

// ── Background type tabs ──────────────────────────────────────────────

export function IconBgSolid(p: IconProps) {
    return (
        <svg
            width={p.size ?? 14}
            height={p.size ?? 14}
            viewBox="0 0 16 16"
            fill="currentColor"
            className={p.className}
        >
            <rect x="3" y="3" width="10" height="10" rx="2" />
        </svg>
    );
}

export function IconBgGradient(p: IconProps) {
    return (
        <svg
            width={p.size ?? 14}
            height={p.size ?? 14}
            viewBox="0 0 16 16"
            fill="none"
            className={p.className}
        >
            <defs>
                <linearGradient id="weblab-v4-grad-icon" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="currentColor" stopOpacity="1" />
                    <stop offset="1" stopColor="currentColor" stopOpacity="0.2" />
                </linearGradient>
            </defs>
            <rect
                x="3"
                y="3"
                width="10"
                height="10"
                rx="2"
                fill="url(#weblab-v4-grad-icon)"
                stroke="currentColor"
                strokeWidth={1.5}
            />
        </svg>
    );
}

export function IconBgImage(p: IconProps) {
    return (
        <Svg {...p}>
            <rect x="2" y="2.5" width="12" height="11" rx="2" />
            <circle cx="5.5" cy="6" r="1" />
            <path d="M2 12l3.5-3 3 2.5L12 7l2 2" />
        </Svg>
    );
}

export function IconBgNone(p: IconProps) {
    return (
        <Svg {...p}>
            <rect x="3" y="3" width="10" height="10" rx="2" />
            <line x1="4.5" y1="4.5" x2="11.5" y2="11.5" />
        </Svg>
    );
}

// ── Misc ──────────────────────────────────────────────────────────────

export function IconRotate(p: IconProps) {
    return (
        <Svg {...p}>
            <path d="M2 8a6 6 0 1 0 1.76-4.24M2 2v4h4" />
        </Svg>
    );
}

export function IconFlipH(p: IconProps) {
    return (
        <Svg {...p}>
            <path d="M8 2v12M4 5l-2 3 2 3M12 5l2 3-2 3" />
        </Svg>
    );
}

export function IconFlipV(p: IconProps) {
    return (
        <Svg {...p}>
            <path d="M2 8h12M5 4L8 2l3 2M5 12l3 2 3-2" />
        </Svg>
    );
}

export function IconPage(p: IconProps) {
    return (
        <Svg {...p}>
            <rect x="3" y="2" width="10" height="12" rx="1" />
            <line x1="5" y1="5" x2="11" y2="5" />
            <line x1="5" y1="8" x2="11" y2="8" />
            <line x1="5" y1="11" x2="9" y2="11" />
        </Svg>
    );
}

export function IconFile(p: IconProps) {
    return (
        <Svg {...p}>
            <path d="M3 2h6l4 4v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
            <path d="M9 2v4h4" />
        </Svg>
    );
}

export function IconMail(p: IconProps) {
    return (
        <Svg {...p}>
            <rect x="2" y="3.5" width="12" height="9" rx="1" />
            <path d="M2.5 4.5l5.5 4 5.5-4" />
        </Svg>
    );
}

export function IconPhone(p: IconProps) {
    return (
        <Svg {...p}>
            <path d="M4 2.5h2l1 3-1.5 1A8 8 0 0 0 9.5 11l1-1.5 3 1V13a1 1 0 0 1-1 1A11 11 0 0 1 2.5 3a1 1 0 0 1 1-.5z" />
        </Svg>
    );
}

export function IconStroke(p: IconProps) {
    return (
        <Svg {...p}>
            <line x1="2" y1="8" x2="14" y2="8" />
        </Svg>
    );
}

export function IconWeight(p: IconProps) {
    return (
        <Svg {...p}>
            <rect x="2" y="6" width="12" height="4" rx="0.5" />
        </Svg>
    );
}

export function IconAspect(p: IconProps) {
    return (
        <Svg {...p}>
            <rect x="2" y="4" width="12" height="8" rx="1" />
        </Svg>
    );
}

export function IconFit(p: IconProps) {
    return (
        <Svg {...p}>
            <rect x="2" y="2" width="12" height="12" rx="1.5" />
            <rect x="5" y="5" width="6" height="6" />
        </Svg>
    );
}
