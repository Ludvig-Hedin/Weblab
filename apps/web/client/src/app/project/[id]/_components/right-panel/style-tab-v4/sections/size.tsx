'use client';

import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import {
    GroupShell,
    IconAspect,
    IconHeight,
    IconNumberInput,
    IconWidth,
    LabeledNumberInput,
    LabeledSelectInput,
    LinkAspectButton,
    ModeNumberCell,
} from '../controls';
import { useStyleBatchSetter, useStyleSetter } from '../hooks/use-style-setter';
import { useStyleValue } from '../hooks/use-style-value';
import { Section } from './section';

// ── Static option lists ────────────────────────────────────────────────

const DIMENSION_KEYWORDS = ['auto', 'hug', 'fit', 'fill'] as const;
const DIMENSION_UNITS = ['px', '%', 'rem', 'em', 'vh', 'vw'] as const;
const CONSTRAINT_UNITS = ['px', '%', 'rem', 'em'] as const;

const FIT_OPTIONS = [
    { value: 'cover', label: 'Cover' },
    { value: 'contain', label: 'Contain' },
    { value: 'fill', label: 'Fill' },
    { value: 'none', label: 'None' },
    { value: 'scale-down', label: 'Scale down' },
] as const;

const OVERFLOW_OPTIONS = [
    { value: 'visible', label: 'Visible' },
    { value: 'hidden', label: 'Hidden' },
    { value: 'auto', label: 'Auto' },
    { value: 'scroll', label: 'Scroll' },
    { value: 'clip', label: 'Clip' },
] as const;

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Parse a numeric value + unit string (e.g. `"132px"`) and return only the
 * numeric part. Returns `null` if the value isn't a plain number+unit pair.
 */
function extractNumeric(value: string): number | null {
    const m = /^([-+]?[0-9]*\.?[0-9]+)([a-zA-Z%]*)$/.exec(value.trim());
    if (!m) return null;
    return Number.parseFloat(m[1] ?? '0');
}

/**
 * Extract the unit from a numeric value string. Falls back to `px`.
 */
function extractUnit(value: string, fallback = 'px'): string {
    const m = /^[-+]?[0-9]*\.?[0-9]+([a-zA-Z%]+)$/.exec(value.trim());
    return m?.[1] ?? fallback;
}

// ── Component ──────────────────────────────────────────────────────────

/**
 * Size section (v4) — Dimensions / Constraints / Aspect & Fit / Behavior.
 *
 * Dimensions group:
 *   3-col `1fr 28px 1fr` grid: ModeNumberCell(W) · LinkAspectButton · ModeNumberCell(H)
 *   When the chain is locked, editing W proportionally updates H via
 *   useStyleBatchSetter so the two writes land as a single undo entry.
 *
 * Constraints group:
 *   2-col pair rows for min-width/min-height and max-width/max-height.
 *   Placeholder ∞ for max fields.
 *
 * Aspect & Fit group:
 *   IconNumberInput for aspect-ratio (free text, e.g. `16/9`) + LabeledSelectInput
 *   for object-fit.
 *
 * Behavior group:
 *   LabeledNumberInput for flex-grow + LabeledSelectInput for overflow.
 */
export const SizeSection = observer(function SizeSection() {
    const t = useTranslations('editor.stylePanel');

    // ── Style reads ──────────────────────────────────────────────────────

    const width = useStyleValue('width');
    const height = useStyleValue('height');
    const minWidth = useStyleValue('min-width');
    const minHeight = useStyleValue('min-height');
    const maxWidth = useStyleValue('max-width');
    const maxHeight = useStyleValue('max-height');
    const aspectRatio = useStyleValue('aspect-ratio');
    const objectFit = useStyleValue('object-fit');
    const overflow = useStyleValue('overflow');
    const overflowX = useStyleValue('overflow-x');
    const overflowY = useStyleValue('overflow-y');
    const flexGrow = useStyleValue('flex-grow');

    // ── Style setters ────────────────────────────────────────────────────

    const widthSetter = useStyleSetter('width');
    const heightSetter = useStyleSetter('height');
    const minWidthSetter = useStyleSetter('min-width');
    const minHeightSetter = useStyleSetter('min-height');
    const maxWidthSetter = useStyleSetter('max-width');
    const maxHeightSetter = useStyleSetter('max-height');
    const aspectRatioSetter = useStyleSetter('aspect-ratio');
    const objectFitSetter = useStyleSetter('object-fit');
    const overflowSetter = useStyleSetter('overflow');
    const flexGrowSetter = useStyleSetter('flex-grow');
    const { setMultiple } = useStyleBatchSetter();

    // ── Local state ──────────────────────────────────────────────────────

    /** Whether the aspect-ratio chain lock is engaged. */
    const [aspectLocked, setAspectLocked] = useState(false);

    /**
     * Locked ratio (W / H). Re-computed whenever the lock is toggled ON from
     * the current live values. Stored in a ref-like state to avoid
     * recalculation on every render.
     */
    const [lockedRatio, setLockedRatio] = useState<number | null>(null);

    // ── Derived ──────────────────────────────────────────────────────────

    // Reflect actual state — prefer shorthand, then fall back to whichever
    // axis longhand is set. When axes disagree, show `mixed` so the user knows
    // the select would clobber per-axis state.
    const overflowValue = (() => {
        if (overflow.value) return overflow.value;
        const x = overflowX.value;
        const y = overflowY.value;
        if (x && y) return x === y ? x : 'mixed';
        return x || y || '';
    })();

    // setCount removed in v4 — section dot hidden per design brief.

    // ── Handlers ─────────────────────────────────────────────────────────

    const handleToggleAspectLock = () => {
        if (!aspectLocked) {
            // Compute ratio from current values when engaging the lock.
            const w = extractNumeric(width.value);
            const h = extractNumeric(height.value);
            setLockedRatio(w !== null && h !== null && h !== 0 ? w / h : null);
        }
        setAspectLocked((prev) => !prev);
    };

    /**
     * Commit width. When locked, derive new height proportionally and batch-
     * write both as a single undo entry.
     */
    const handleWidthCommit = (value: string) => {
        if (!aspectLocked || lockedRatio === null) {
            widthSetter.set(value);
            return;
        }
        const num = extractNumeric(value);
        if (num === null) {
            widthSetter.set(value);
            return;
        }
        const unit = extractUnit(value);
        const newH = Number.parseFloat((num / lockedRatio).toFixed(2));
        setMultiple([
            { property: 'width', value },
            { property: 'height', value: `${newH}${unit}` },
        ]);
    };

    /**
     * Commit height. When locked, derive new width proportionally and batch-
     * write both as a single undo entry.
     */
    const handleHeightCommit = (value: string) => {
        if (!aspectLocked || lockedRatio === null) {
            heightSetter.set(value);
            return;
        }
        const num = extractNumeric(value);
        if (num === null) {
            heightSetter.set(value);
            return;
        }
        const unit = extractUnit(value);
        const newW = Number.parseFloat((num * lockedRatio).toFixed(2));
        setMultiple([
            { property: 'width', value: `${newW}${unit}` },
            { property: 'height', value },
        ]);
    };

    // ── Render ───────────────────────────────────────────────────────────

    return (
        <Section id="size" title={t('section.size')}>
            <div className="flex flex-col gap-3 px-3 pb-3">
                {/* ── Dimensions ─────────────────────────────────────── */}
                <GroupShell
                    label={t('size.dimensions')}
                    onReset={() =>
                        setMultiple([
                            { property: 'width', value: '' },
                            { property: 'height', value: '' },
                        ])
                    }
                >
                    <div
                        className="grid items-center gap-1.5"
                        style={{ gridTemplateColumns: '1fr 28px 1fr' }}
                    >
                        <ModeNumberCell
                            glyph={<IconWidth />}
                            value={width.value}
                            onCommit={handleWidthCommit}
                            keywords={DIMENSION_KEYWORDS}
                            units={DIMENSION_UNITS}
                            defaultUnit="px"
                            ariaLabel={t('size.width')}
                            mixed={width.mixed}
                        />
                        <LinkAspectButton locked={aspectLocked} onToggle={handleToggleAspectLock} />
                        <ModeNumberCell
                            glyph={<IconHeight />}
                            value={height.value}
                            onCommit={handleHeightCommit}
                            keywords={DIMENSION_KEYWORDS}
                            units={DIMENSION_UNITS}
                            defaultUnit="px"
                            ariaLabel={t('size.height')}
                            mixed={height.mixed}
                        />
                    </div>
                </GroupShell>

                {/* ── Constraints ────────────────────────────────────── */}
                <GroupShell
                    label={t('size.constraints')}
                    onReset={() =>
                        setMultiple([
                            { property: 'min-width', value: '' },
                            { property: 'min-height', value: '' },
                            { property: 'max-width', value: '' },
                            { property: 'max-height', value: '' },
                        ])
                    }
                >
                    <div className="grid grid-cols-2 gap-1.5">
                        <LabeledNumberInput
                            label={t('size.minWidth')}
                            value={minWidth.value}
                            onCommit={minWidthSetter.set}
                            units={CONSTRAINT_UNITS}
                            defaultUnit="px"
                            aria-label={t('size.minWidthAria')}
                            mixed={minWidth.mixed}
                        />
                        <LabeledNumberInput
                            label={t('size.minHeight')}
                            value={minHeight.value}
                            onCommit={minHeightSetter.set}
                            units={CONSTRAINT_UNITS}
                            defaultUnit="px"
                            aria-label={t('size.minHeightAria')}
                            mixed={minHeight.mixed}
                        />
                    </div>
                    <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                        <LabeledNumberInput
                            label={t('size.maxWidth')}
                            value={maxWidth.value}
                            onCommit={maxWidthSetter.set}
                            units={CONSTRAINT_UNITS}
                            defaultUnit="px"
                            placeholder="∞"
                            aria-label={t('size.maxWidthAria')}
                            mixed={maxWidth.mixed}
                        />
                        <LabeledNumberInput
                            label={t('size.maxHeight')}
                            value={maxHeight.value}
                            onCommit={maxHeightSetter.set}
                            units={CONSTRAINT_UNITS}
                            defaultUnit="px"
                            placeholder="∞"
                            aria-label={t('size.maxHeightAria')}
                            mixed={maxHeight.mixed}
                        />
                    </div>
                </GroupShell>

                {/* ── Aspect & Fit ────────────────────────────────────── */}
                <GroupShell label={t('size.aspectFit')}>
                    <div className="grid grid-cols-2 gap-1.5">
                        {/*
                         * aspect-ratio accepts free text: `16/9`, `4/3`, `1.5`.
                         * We write the raw input verbatim — CSS aspect-ratio
                         * accepts both `<number>` and `<width> / <height>` forms.
                         * When the user types `16/9` we normalise the slash
                         * spacing to `16 / 9` on commit so the stored value is
                         * valid CSS.
                         */}
                        <IconNumberInput
                            glyph={<IconAspect />}
                            value={aspectRatio.value}
                            onCommit={(raw) => {
                                // Normalise `16/9` → `16 / 9` for CSS compliance.
                                const normalised = raw.trim().replace(/\s*\/\s*/g, ' / ');
                                aspectRatioSetter.set(normalised);
                            }}
                            units={[]}
                            keywords={[]}
                            defaultUnit=""
                            allowKeywords
                            placeholder="e.g. 16 / 9"
                            aria-label={t('size.aspectRatio')}
                            hidePill
                            mixed={aspectRatio.mixed}
                        />
                        <LabeledSelectInput
                            label={t('size.fit')}
                            value={objectFit.value}
                            options={FIT_OPTIONS}
                            onCommit={objectFitSetter.set}
                            mixed={objectFit.mixed}
                        />
                    </div>
                </GroupShell>

                {/* ── Behavior ───────────────────────────────────────── */}
                <GroupShell label={t('size.behavior')}>
                    <div className="grid grid-cols-2 gap-1.5">
                        <LabeledNumberInput
                            label={t('size.grow')}
                            value={flexGrow.value}
                            onCommit={flexGrowSetter.set}
                            unit=""
                            units={[]}
                            defaultUnit=""
                            placeholder="0"
                            aria-label={t('size.flexGrow')}
                            mixed={flexGrow.mixed}
                        />
                        <LabeledSelectInput
                            label={t('size.overflow')}
                            value={overflowValue}
                            options={OVERFLOW_OPTIONS}
                            onCommit={overflowSetter.set}
                            mixed={overflow.mixed}
                        />
                    </div>
                </GroupShell>
            </div>
        </Section>
    );
});
