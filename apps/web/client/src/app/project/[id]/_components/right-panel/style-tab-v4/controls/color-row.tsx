'use client';

import * as React from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@weblab/ui/popover';
import { cn } from '@weblab/ui/utils';

import { FIELD_BASE_CLASSES } from './constants';
import { IconConnectToken, IconEye, IconEyedropper, IconEyeOff } from './glyphs';
import { IconButtonSm } from './icon-button-sm';

export interface ColorRowProps {
    /** Current full value (`#ff0000`, `rgba(0,0,0,0.5)`, var(--accent), etc.). */
    value: string;
    /** Commit handler when hex/alpha/visibility changes. */
    onCommit: (value: string) => void;
    /** Whether the property is currently set on the element. Drives the eye-icon state. */
    visible?: boolean;
    /** Toggle property visibility (set/unset). */
    onToggleVisible?: () => void;
    /** Open the color picker popover content (passes the existing v3 ColorField popover if available). */
    pickerContent?: React.ReactNode;
    /** Optional connect-to-token slot — if provided, renders the connect button which calls this on click. */
    onConnect?: () => void;
    /** Optional eyedropper handler. */
    onEyedropper?: () => void;
    /** When true, multiple selected elements have different color values. */
    mixed?: boolean;
    className?: string;
}

interface ParsedColor {
    /** Uppercase 6-digit hex (no leading `#`) when the input was hex-resolvable. */
    hex: string;
    /** 0–100 alpha percent. */
    alpha: number;
    /**
     * The original CSS value when the input could not be reduced to a hex
     * (named color, var(), hsl(), currentColor, etc.). Used so the swatch
     * can render the real color via a sample div and the hex input can
     * show the raw value rather than going blank.
     */
    raw: string | null;
}

/**
 * Resolve ANY CSS color — `hsl()`, named, `lab()`, `oklch()`, `color()`,
 * `var()`-resolved — to hex + alpha by rasterizing one pixel on a canvas.
 *
 * Real pages increasingly compute to modern color spaces: a `getComputedStyle`
 * read of a plain element now commonly returns `lab(48.496 0 0)` / `oklch(...)`,
 * which a `rgb()`-only regex can't parse — so the panel was showing the raw
 * "LAB(48.496 0 0)" string instead of an editable hex. Canvas rasterization
 * collapses every color space to straight rgba bytes, so the swatch + hex input
 * always get a real hex.
 */
function cssColorToHex(value: string): { hex: string; alpha: number } | null {
    if (typeof document === 'undefined') return null;
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return null;

        // Validity probe: the browser silently ignores an unparseable color
        // assignment, leaving `fillStyle` at its prior value. Assigning `value`
        // over two different defaults and comparing detects that — if `value`
        // is invalid the two reads differ, so we bail rather than return a
        // bogus default color.
        ctx.fillStyle = '#000000';
        ctx.fillStyle = value;
        const probeA = ctx.fillStyle;
        ctx.fillStyle = '#ffffff';
        ctx.fillStyle = value;
        const probeB = ctx.fillStyle;
        if (probeA !== probeB) return null;

        ctx.clearRect(0, 0, 1, 1);
        ctx.fillRect(0, 0, 1, 1);
        const data = ctx.getImageData(0, 0, 1, 1).data;
        const r = data[0] ?? 0;
        const g = data[1] ?? 0;
        const b = data[2] ?? 0;
        const a = data[3] ?? 255;
        return {
            hex: toHex2(r) + toHex2(g) + toHex2(b),
            alpha: Math.round((a / 255) * 100),
        };
    } catch {
        return null;
    }
}

function parseHex(input: string): ParsedColor {
    const raw = input.trim();
    const trimmed = raw.replace(/^#/, '');
    if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
        return { hex: trimmed.toUpperCase(), alpha: 100, raw: null };
    }
    if (/^[0-9a-fA-F]{8}$/.test(trimmed)) {
        const alphaHex = trimmed.slice(6);
        const alpha = Math.round((parseInt(alphaHex, 16) / 255) * 100);
        return { hex: trimmed.slice(0, 6).toUpperCase(), alpha, raw: null };
    }
    if (/^[0-9a-fA-F]{3}$/.test(trimmed)) {
        const expanded = trimmed
            .split('')
            .map((c) => c + c)
            .join('')
            .toUpperCase();
        return { hex: expanded, alpha: 100, raw: null };
    }
    const rgba = /^rgba?\(([^)]+)\)$/.exec(raw);
    if (rgba?.[1]) {
        const parts = rgba[1].split(',').map((s) => s.trim());
        const [r, g, b, a] = parts;
        const hex =
            toHex2(parseInt(r ?? '0', 10)) +
            toHex2(parseInt(g ?? '0', 10)) +
            toHex2(parseInt(b ?? '0', 10));
        const alpha = a ? Math.round(parseFloat(a) * 100) : 100;
        return { hex, alpha, raw: null };
    }
    if (raw === '' || raw === 'transparent' || raw === 'inherit' || raw === 'currentColor') {
        return { hex: '', alpha: 100, raw: raw || null };
    }
    // Fallback: ask the browser to resolve hsl(), named colors, etc.
    const resolved = cssColorToHex(raw);
    if (resolved) return { ...resolved, raw: null };
    // Last resort: keep the raw string so the swatch can render it and the
    // hex input doesn't go blank.
    return { hex: '', alpha: 100, raw };
}

function toHex2(n: number): string {
    const v = Math.max(0, Math.min(255, Math.round(n)));
    return v.toString(16).padStart(2, '0').toUpperCase();
}

function buildHexWithAlpha(hex: string, alpha: number): string {
    if (!hex) return '';
    if (alpha >= 100) return `#${hex}`;
    const a = Math.max(0, Math.min(255, Math.round((alpha / 100) * 255)));
    return `#${hex}${a.toString(16).padStart(2, '0').toUpperCase()}`;
}

/**
 * Unified color row used by Fill / Text color / Stroke / Outline.
 * Layout:
 *   [ 20×20 swatch ] [ hex input ] [ alpha % ] [ eye ] [ eyedropper ] [ connect ]
 */
export function ColorRow({
    value,
    onCommit,
    visible = true,
    onToggleVisible,
    pickerContent,
    onConnect,
    onEyedropper,
    mixed,
    className,
}: ColorRowProps) {
    const { hex, alpha, raw } = parseHex(value);
    // Logical-OR is intentional here: `hex` and `raw` are strings that can be
    // empty, and we want empty to fall through to the next option, not be
    // preserved like `??` would.
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const [hexDraft, setHexDraft] = React.useState(hex || raw || '');
    const [alphaDraft, setAlphaDraft] = React.useState(alpha);

    React.useEffect(() => {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        setHexDraft(hex || raw || '');
        setAlphaDraft(alpha);
    }, [hex, alpha, raw]);

    const commitHex = (nextHex: string) => {
        const cleaned = nextHex.replace(/^#/, '').toUpperCase();
        if (cleaned === hex) return;
        // When the user types something hex-shaped, normalise to hex; otherwise
        // commit the raw value verbatim so var(--token) / named colors round-trip.
        if (/^[0-9A-F]{3}$/.test(cleaned)) {
            // Expand 3-digit shorthand to 6-digit before appending alpha,
            // otherwise `#F00` + alpha 50 = `#F0080` (5 chars, invalid CSS).
            const expanded = cleaned
                .split('')
                .map((c) => c + c)
                .join('');
            const next = buildHexWithAlpha(expanded, alphaDraft);
            if (next) onCommit(next);
        } else if (/^[0-9A-F]{6}$/.test(cleaned)) {
            const next = buildHexWithAlpha(cleaned, alphaDraft);
            if (next) onCommit(next);
        } else if (/^[0-9A-F]{8}$/.test(cleaned)) {
            // 8-digit input already embeds alpha — don't re-append alphaDraft
            // (that would produce a 10-char string and an invalid color).
            onCommit(`#${cleaned}`);
        } else if (nextHex.trim() !== value) {
            onCommit(nextHex.trim());
        }
    };

    const commitAlpha = (nextAlpha: number) => {
        const clamped = Math.max(0, Math.min(100, nextAlpha));
        if (clamped === alpha) return;
        // Only build a hex+alpha when we actually have a parsed hex. For raw
        // `var(--token)` / named-color values, alpha would produce garbage
        // like `#var(--accent)80`, so skip the commit (alpha-on-token is a
        // separate UX problem — out of scope for this control).
        if (!hex) return;
        const next = buildHexWithAlpha(hex, clamped);
        if (next) onCommit(next);
    };

    return (
        <div
            className={cn(
                FIELD_BASE_CLASSES,
                'flex h-[32px] min-w-0 items-center gap-2 pr-[6px] pl-[6px]',
                className,
            )}
        >
            {/* Swatch — opens picker via popover (pickerContent prop) */}
            <Popover>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        aria-label="Open color picker"
                        title="Open color picker"
                        className="border-foreground/25 focus-visible:ring-foreground-brand/40 ml-[2px] h-[20px] w-[20px] shrink-0 cursor-pointer rounded-xs border outline-none focus-visible:ring-[3px]"
                        style={(() => {
                            // Mixed → checkerboard-style diagonal stripe to indicate divergent values.
                            if (mixed)
                                return {
                                    backgroundImage:
                                        'linear-gradient(45deg, hsl(var(--foreground)/0.15) 25%, transparent 25%, transparent 50%, hsl(var(--foreground)/0.15) 50%, hsl(var(--foreground)/0.15) 75%, transparent 75%, transparent)',
                                    backgroundSize: '6px 6px',
                                };
                            // Hex value rendered as-is. Raw CSS value (var, named, hsl)
                            // gets passed straight through so the swatch shows the
                            // real colour. Empty value → diagonal red-hatch pattern.
                            if (hex) return { backgroundColor: `#${hex}` };
                            if (raw) return { backgroundColor: raw };
                            return {
                                backgroundColor: 'transparent',
                                backgroundImage:
                                    'linear-gradient(45deg, rgba(255,0,0,0.4) 25%, transparent 25%, transparent 50%, rgba(255,0,0,0.4) 50%, rgba(255,0,0,0.4) 75%, transparent 75%, transparent)',
                                backgroundSize: '6px 6px',
                            };
                        })()}
                    />
                </PopoverTrigger>
                {pickerContent && (
                    <PopoverContent align="start" className="w-[260px] p-2">
                        {pickerContent}
                    </PopoverContent>
                )}
            </Popover>

            {/* Hex input — tabular */}
            <input
                type="text"
                value={hexDraft}
                spellCheck={false}
                placeholder={mixed ? 'Mixed' : undefined}
                onChange={(e) => {
                    // Only uppercase when the input still looks hex-shaped.
                    // Raw `var(--token)` / named-color values are case-sensitive
                    // (`--accent` ≠ `--ACCENT`), so blanket uppercase would
                    // silently break them on commit.
                    const v = e.target.value.replace(/^#/, '');
                    setHexDraft(/^[0-9a-fA-F]{0,8}$/.test(v) ? v.toUpperCase() : v);
                }}
                onBlur={() => commitHex(hexDraft)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        commitHex(hexDraft);
                        e.currentTarget.blur();
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        // Restore the same value the draft was seeded with —
                        // for raw `var(--token)` / named colors `hex` is '',
                        // so falling through to `raw` keeps the original.
                        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                        setHexDraft(hex || raw || '');
                        e.currentTarget.blur();
                    }
                }}
                aria-label="Hex value"
                className={cn(
                    'text-foreground-primary placeholder:text-muted-foreground text-mini min-w-0 flex-1 cursor-text bg-transparent uppercase tabular-nums outline-none',
                    mixed &&
                        'placeholder:text-foreground-tertiary/70 placeholder:normal-case placeholder:italic',
                )}
                style={{ fontVariantNumeric: 'tabular-nums' }}
            />

            {/* Alpha — fixed width, divider left */}
            <div className="border-foreground/[0.05] flex h-full shrink-0 items-center border-l pl-2">
                <input
                    type="text"
                    inputMode="numeric"
                    value={alphaDraft}
                    onChange={(e) => {
                        const cleaned = e.target.value.replace(/[^0-9]/g, '');
                        if (cleaned === '') {
                            // Empty input on blur would commit alpha 0
                            // (fully transparent) — treat field-clear as
                            // "no change" instead of snapping to 0.
                            setAlphaDraft(alpha);
                            return;
                        }
                        const n = Number.parseInt(cleaned, 10);
                        setAlphaDraft(Number.isNaN(n) ? alpha : n);
                    }}
                    onBlur={() => commitAlpha(alphaDraft)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            commitAlpha(alphaDraft);
                            e.currentTarget.blur();
                        }
                    }}
                    aria-label="Alpha"
                    className="text-foreground-secondary w-[28px] cursor-text bg-transparent text-right text-[12px] tabular-nums outline-none"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                />
                <span className="text-muted-foreground ml-0.5 text-[11px]">%</span>
            </div>

            {/* Visibility eye */}
            {onToggleVisible && (
                <IconButtonSm label={visible ? 'Hide' : 'Show'} onClick={onToggleVisible}>
                    {visible ? <IconEye size={13} /> : <IconEyeOff size={13} />}
                </IconButtonSm>
            )}

            {/* Eyedropper */}
            {onEyedropper && (
                <IconButtonSm label="Pick from canvas" onClick={onEyedropper}>
                    <IconEyedropper size={13} />
                </IconButtonSm>
            )}

            {/* Connect to token */}
            {onConnect && (
                <IconButtonSm label="Connect to color token" onClick={onConnect}>
                    <IconConnectToken size={13} />
                </IconButtonSm>
            )}
        </div>
    );
}
