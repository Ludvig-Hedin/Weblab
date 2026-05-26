'use client';

import { useMemo } from 'react';
import { observer } from 'mobx-react-lite';

import {
    ColorField,
    ColorRow,
    GroupShell,
    IconNumberInput,
    IconPerCorner,
    IconPerSide,
    IconRadius,
    IconWeight,
    LabeledSelectInput,
    PerCornerPopover,
    PerSidePopover,
} from '../controls';
import { useStyleBatchSetter, useStyleSetter } from '../hooks/use-style-setter';
import { useStyleValue } from '../hooks/use-style-value';
import { Section } from './section';

// ── Constants ──────────────────────────────────────────────────────────────────

const BORDER_STYLE_OPTIONS = [
    { value: 'solid', label: 'Solid' },
    { value: 'dashed', label: 'Dashed' },
    { value: 'dotted', label: 'Dotted' },
    { value: 'double', label: 'Double' },
    { value: 'groove', label: 'Groove' },
    { value: 'ridge', label: 'Ridge' },
    { value: 'inset', label: 'Inset' },
    { value: 'outset', label: 'Outset' },
    { value: 'none', label: 'None' },
] as const;

const STROKE_UNITS = ['px', 'rem', 'em'] as const;
const RADIUS_UNITS = ['px', 'rem', 'em', '%'] as const;

// ── Border section ─────────────────────────────────────────────────────────────

/**
 * Border section (v4) — Stroke + Radius.
 *
 * Stroke group:
 *   - `ColorRow` for border-color (hex + alpha + visibility + picker).
 *   - A 2-col grid: `LabeledSelectInput` for border-style + `IconNumberInput`
 *     for border-width.
 *   - Per-side popover (group action) for individual border-{top|right|bottom|
 *     left}-width overrides; the header Width input writes border-width shorthand.
 *
 * Radius group:
 *   - `IconNumberInput` (linked) for border-radius shorthand.
 *   - Per-corner popover (group action) for individual corner radii.
 *
 * Shorthand vs longhand resolution: reads each individual property directly
 * from `useStyleValue`; the shorthand inputs write the shorthand (e.g.
 * `border-width`) while the per-side / per-corner popovers write longhands.
 * `useStyleBatchSetter` is used for the linked-all-corners write so a single
 * Cmd+Z reverts the whole gesture.
 */
export const BorderSection = observer(function BorderSection() {
    // ── Style reads ────────────────────────────────────────────────────────

    // Stroke
    const borderColor = useStyleValue('border-color');
    const borderStyle = useStyleValue('border-style');
    const borderWidth = useStyleValue('border-width');

    // Per-side widths
    const borderTop = useStyleValue('border-top-width');
    const borderRight = useStyleValue('border-right-width');
    const borderBottom = useStyleValue('border-bottom-width');
    const borderLeft = useStyleValue('border-left-width');

    // Radius (linked shorthand + individual corners)
    const radius = useStyleValue('border-radius');
    const radiusTl = useStyleValue('border-top-left-radius');
    const radiusTr = useStyleValue('border-top-right-radius');
    const radiusBl = useStyleValue('border-bottom-left-radius');
    const radiusBr = useStyleValue('border-bottom-right-radius');

    // ── Style setters ──────────────────────────────────────────────────────

    const borderColorSetter = useStyleSetter('border-color');
    const borderStyleSetter = useStyleSetter('border-style');
    const borderWidthSetter = useStyleSetter('border-width');

    const borderTopSetter = useStyleSetter('border-top-width');
    const borderRightSetter = useStyleSetter('border-right-width');
    const borderBottomSetter = useStyleSetter('border-bottom-width');
    const borderLeftSetter = useStyleSetter('border-left-width');

    const radiusTlSetter = useStyleSetter('border-top-left-radius');
    const radiusTrSetter = useStyleSetter('border-top-right-radius');
    const radiusBlSetter = useStyleSetter('border-bottom-left-radius');
    const radiusBrSetter = useStyleSetter('border-bottom-right-radius');

    const { setMultiple } = useStyleBatchSetter();

    // ── Derived ────────────────────────────────────────────────────────────

    /**
     * Whether any border property is explicitly set — used to drive the
     * visibility eye state and the section dot.
     */
    const isBorderSet =
        borderColor.isSet ||
        borderStyle.isSet ||
        borderWidth.isSet ||
        borderTop.isSet ||
        borderRight.isSet ||
        borderBottom.isSet ||
        borderLeft.isSet;

    /**
     * Derived linked radius value: if all four individual corners exist and are
     * equal, display that value; otherwise fall back to the shorthand. Shows
     * blank when nothing is set.
     */
    const linkedRadius = useMemo(() => {
        const all = [radiusTl.value, radiusTr.value, radiusBl.value, radiusBr.value];
        const anyCornerSet = radiusTl.isSet || radiusTr.isSet || radiusBl.isSet || radiusBr.isSet;
        if (anyCornerSet && all.every((v) => v && v === all[0])) {
            return all[0] ?? '';
        }
        return radius.value;
    }, [
        radius.value,
        radiusTl.value,
        radiusTl.isSet,
        radiusTr.value,
        radiusTr.isSet,
        radiusBl.value,
        radiusBl.isSet,
        radiusBr.value,
        radiusBr.isSet,
    ]);

    // setCount removed in v4 — section dot hidden per design brief.

    // ── Handlers ───────────────────────────────────────────────────────────

    const handleToggleVisible = () => {
        // Toggle clears or sets a default border depending on current state.
        // Off → clear color, style, width so nothing renders.
        // On  → seed a 1px solid black border so the user has something
        //       visible and can immediately tune width / color / style.
        if (isBorderSet) {
            setMultiple([
                { property: 'border-color', value: '' },
                { property: 'border-style', value: '' },
                { property: 'border-width', value: '' },
            ]);
        } else {
            setMultiple([
                { property: 'border-color', value: '#000000' },
                { property: 'border-style', value: 'solid' },
                { property: 'border-width', value: '1px' },
            ]);
        }
    };

    const handleBorderSideCommit = (side: 'top' | 'right' | 'bottom' | 'left', value: string) => {
        switch (side) {
            case 'top':
                borderTopSetter.set(value);
                break;
            case 'right':
                borderRightSetter.set(value);
                break;
            case 'bottom':
                borderBottomSetter.set(value);
                break;
            case 'left':
                borderLeftSetter.set(value);
                break;
        }
    };

    /**
     * Write the linked radius shorthand, which CSS will expand to all four
     * corners. We also write each corner longhand explicitly so the per-corner
     * popover reads back a consistent value. Both writes are batched so a single
     * Cmd+Z reverts the whole gesture.
     */
    const handleRadiusCommit = (value: string) => {
        setMultiple([
            { property: 'border-radius', value },
            { property: 'border-top-left-radius', value },
            { property: 'border-top-right-radius', value },
            { property: 'border-bottom-left-radius', value },
            { property: 'border-bottom-right-radius', value },
        ]);
    };

    const handleRadiusCornerCommit = (corner: 'tl' | 'tr' | 'bl' | 'br', value: string) => {
        switch (corner) {
            case 'tl':
                radiusTlSetter.set(value);
                break;
            case 'tr':
                radiusTrSetter.set(value);
                break;
            case 'bl':
                radiusBlSetter.set(value);
                break;
            case 'br':
                radiusBrSetter.set(value);
                break;
        }
    };

    // ── Render ─────────────────────────────────────────────────────────────

    return (
        <Section id="border" title="Border">
            <div className="flex flex-col gap-3 px-3 pb-3">
                {/* ── Stroke group ──────────────────────────────────────── */}
                <GroupShell
                    label="Stroke"
                    onReset={() =>
                        setMultiple([
                            { property: 'border-color', value: '' },
                            { property: 'border-style', value: '' },
                            { property: 'border-width', value: '' },
                            { property: 'border-top-width', value: '' },
                            { property: 'border-right-width', value: '' },
                            { property: 'border-bottom-width', value: '' },
                            { property: 'border-left-width', value: '' },
                        ])
                    }
                    actions={
                        <PerSidePopover
                            triggerIcon={<IconPerSide />}
                            triggerLabel="Per side"
                            values={{
                                top: borderTop.value,
                                right: borderRight.value,
                                bottom: borderBottom.value,
                                left: borderLeft.value,
                            }}
                            onCommit={handleBorderSideCommit}
                            units={STROKE_UNITS}
                        />
                    }
                >
                    {/* Color row */}
                    <ColorRow
                        value={borderColor.value}
                        onCommit={borderColorSetter.set}
                        visible={isBorderSet}
                        onToggleVisible={handleToggleVisible}
                        pickerContent={
                            <ColorField
                                value={borderColor.value}
                                onCommit={borderColorSetter.set}
                            />
                        }
                        mixed={borderColor.mixed}
                    />

                    {/* Style + Width pair */}
                    <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                        <LabeledSelectInput
                            label="Style"
                            options={BORDER_STYLE_OPTIONS}
                            value={borderStyle.value}
                            onCommit={borderStyleSetter.set}
                            mixed={borderStyle.mixed}
                        />
                        <IconNumberInput
                            glyph={<IconWeight />}
                            value={borderWidth.value}
                            onCommit={borderWidthSetter.set}
                            units={STROKE_UNITS}
                            defaultUnit="px"
                            aria-label="Border width"
                            mixed={borderWidth.mixed}
                        />
                    </div>
                </GroupShell>

                {/* ── Radius group ──────────────────────────────────────── */}
                <GroupShell
                    label="Radius"
                    onReset={() =>
                        setMultiple([
                            { property: 'border-radius', value: '' },
                            { property: 'border-top-left-radius', value: '' },
                            { property: 'border-top-right-radius', value: '' },
                            { property: 'border-bottom-left-radius', value: '' },
                            { property: 'border-bottom-right-radius', value: '' },
                        ])
                    }
                    actions={
                        <PerCornerPopover
                            triggerIcon={<IconPerCorner />}
                            triggerLabel="Per corner"
                            values={{
                                tl: radiusTl.value,
                                tr: radiusTr.value,
                                bl: radiusBl.value,
                                br: radiusBr.value,
                            }}
                            onCommit={handleRadiusCornerCommit}
                            units={RADIUS_UNITS}
                        />
                    }
                >
                    <IconNumberInput
                        glyph={<IconRadius />}
                        value={linkedRadius}
                        onCommit={handleRadiusCommit}
                        units={RADIUS_UNITS}
                        defaultUnit="px"
                        aria-label="Border radius"
                        mixed={radius.mixed}
                    />
                </GroupShell>
            </div>
        </Section>
    );
});
