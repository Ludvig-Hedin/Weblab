'use client';

import { observer } from 'mobx-react-lite';

import {
    AlignPad,
    FlowSegment,
    GroupShell,
    IconBlock,
    IconFlexCol,
    IconFlexRow,
    IconGap,
    IconGrid,
    IconMarginH,
    IconMarginV,
    IconNumberInput,
    IconPadH,
    IconPadV,
    IconPerSide,
    IconPerSideDashed,
    PerSidePopover,
} from '../controls';
import { useStyleBatchSetter, useStyleSetter } from '../hooks/use-style-setter';
import { useStyleValue } from '../hooks/use-style-value';
import { Section } from './section';

/** Segmented flow options: Block / Flex col / Flex row / Grid */
const FLOW_OPTIONS = [
    { value: 'block', label: 'Block', icon: <IconBlock /> },
    { value: 'flex-col', label: 'Flex column', icon: <IconFlexCol /> },
    { value: 'flex-row', label: 'Flex row', icon: <IconFlexRow /> },
    { value: 'grid', label: 'Grid', icon: <IconGrid /> },
] as const;

/**
 * Derive the FlowSegment active value from the current display + flex-direction.
 * Returns one of: 'block' | 'flex-col' | 'flex-row' | 'grid' | ''.
 */
function resolveFlowValue(display: string, direction: string): string {
    const d = display === 'inline-flex' ? 'flex' : display === 'inline-grid' ? 'grid' : display;
    if (d === 'flex') {
        const isCol = direction === 'column' || direction === 'column-reverse';
        return isCol ? 'flex-col' : 'flex-row';
    }
    if (d === 'grid') return 'grid';
    if (d === 'block' || d === 'inline-block' || d === 'inline') return 'block';
    return '';
}

const PAD_UNITS = ['px', 'rem', 'em', '%'] as const;

/**
 * Layout — v4 rewrite.
 *
 * Rows (top to bottom):
 *   1. Flow segmented (always visible): Block / Flex col / Flex row / Grid
 *   2. Alignment + Gap (visible only when display===flex / inline-flex)
 *   3. Padding group (H+V inputs + per-side popover)
 *   4. Margin group (H+V inputs + per-side popover)
 */
export const LayoutSection = observer(function LayoutSection() {
    // ── Read current values ───────────────────────────────────────────────
    const display = useStyleValue('display');
    const direction = useStyleValue('flex-direction');
    const justifyContent = useStyleValue('justify-content');
    const alignItems = useStyleValue('align-items');
    const gap = useStyleValue('gap');

    const padTop = useStyleValue('padding-top');
    const padRight = useStyleValue('padding-right');
    const padBottom = useStyleValue('padding-bottom');
    const padLeft = useStyleValue('padding-left');

    const marginTop = useStyleValue('margin-top');
    const marginRight = useStyleValue('margin-right');
    const marginBottom = useStyleValue('margin-bottom');
    const marginLeft = useStyleValue('margin-left');

    // ── Setters ───────────────────────────────────────────────────────────
    const displaySetter = useStyleSetter('display');
    const gapSetter = useStyleSetter('gap');
    const { setMultiple } = useStyleBatchSetter();

    // ── Derived state ─────────────────────────────────────────────────────
    const flowValue = resolveFlowValue(display.value, direction.value);
    const isFlex = display.value === 'flex' || display.value === 'inline-flex';

    // setCount removed in v4 — section dot hidden per design brief.

    // ── Flow commit ───────────────────────────────────────────────────────
    function commitFlow(value: string) {
        if (value === 'block') {
            displaySetter.set('block');
        } else if (value === 'flex-col') {
            setMultiple([
                { property: 'display', value: 'flex' },
                { property: 'flex-direction', value: 'column' },
            ]);
        } else if (value === 'flex-row') {
            setMultiple([
                { property: 'display', value: 'flex' },
                { property: 'flex-direction', value: 'row' },
            ]);
        } else if (value === 'grid') {
            displaySetter.set('grid');
        }
    }

    // ── Align + Gap commits ───────────────────────────────────────────────
    function commitAlign(justify: string, align: string) {
        setMultiple([
            { property: 'justify-content', value: justify },
            { property: 'align-items', value: align },
        ]);
    }

    // ── Padding commits ───────────────────────────────────────────────────
    function commitPadH(value: string) {
        setMultiple([
            { property: 'padding-left', value },
            { property: 'padding-right', value },
        ]);
    }
    function commitPadV(value: string) {
        setMultiple([
            { property: 'padding-top', value },
            { property: 'padding-bottom', value },
        ]);
    }
    function commitPadSide(side: 'top' | 'right' | 'bottom' | 'left', value: string) {
        setMultiple([{ property: `padding-${side}`, value }]);
    }

    // ── Margin commits ────────────────────────────────────────────────────
    function commitMarginH(value: string) {
        setMultiple([
            { property: 'margin-left', value },
            { property: 'margin-right', value },
        ]);
    }
    function commitMarginV(value: string) {
        setMultiple([
            { property: 'margin-top', value },
            { property: 'margin-bottom', value },
        ]);
    }
    function commitMarginSide(side: 'top' | 'right' | 'bottom' | 'left', value: string) {
        setMultiple([{ property: `margin-${side}`, value }]);
    }

    // ── Padding / margin display values ──────────────────────────────────
    // Always read left (for H) and top (for V). The per-side popover exposes
    // individual overrides; the H/V fields show the "representative" side.
    const padHValue = padLeft.value;
    const padVValue = padTop.value;
    const marginHValue = marginLeft.value;
    const marginVValue = marginTop.value;

    return (
        <Section id="layout" title="Layout">
            <div className="flex flex-col gap-3 px-3 pb-3">
                {/* 1. Flow */}
                <GroupShell label="Flow">
                    <FlowSegment
                        value={flowValue}
                        options={FLOW_OPTIONS}
                        onCommit={commitFlow}
                        ariaLabel="Display flow"
                    />
                </GroupShell>

                {/* 2. Alignment + Gap (flex only) */}
                {isFlex && (
                    <div
                        className="grid items-end gap-2"
                        style={{ gridTemplateColumns: '130px 1fr' }}
                    >
                        <GroupShell label="Alignment">
                            <AlignPad
                                justify={justifyContent.value}
                                align={alignItems.value}
                                onCommit={commitAlign}
                            />
                        </GroupShell>
                        <GroupShell label="Gap">
                            <IconNumberInput
                                glyph={<IconGap />}
                                value={gap.value}
                                onCommit={(v) => gapSetter.set(v)}
                                units={PAD_UNITS}
                                defaultUnit="px"
                                aria-label="Gap"
                                mixed={gap.mixed}
                            />
                        </GroupShell>
                    </div>
                )}

                {/* 3. Padding */}
                <GroupShell
                    label="Padding"
                    onReset={() =>
                        setMultiple([
                            { property: 'padding-top', value: '' },
                            { property: 'padding-right', value: '' },
                            { property: 'padding-bottom', value: '' },
                            { property: 'padding-left', value: '' },
                        ])
                    }
                    actions={
                        <PerSidePopover
                            triggerIcon={<IconPerSide />}
                            triggerLabel="Per-side padding"
                            values={{
                                top: padTop.value,
                                right: padRight.value,
                                bottom: padBottom.value,
                                left: padLeft.value,
                            }}
                            onCommit={commitPadSide}
                            units={PAD_UNITS}
                        />
                    }
                >
                    <div className="grid grid-cols-2 gap-1.5">
                        <IconNumberInput
                            glyph={<IconPadH />}
                            value={padHValue}
                            onCommit={commitPadH}
                            units={PAD_UNITS}
                            defaultUnit="px"
                            aria-label="Horizontal padding"
                            mixed={padLeft.mixed}
                        />
                        <IconNumberInput
                            glyph={<IconPadV />}
                            value={padVValue}
                            onCommit={commitPadV}
                            units={PAD_UNITS}
                            defaultUnit="px"
                            aria-label="Vertical padding"
                            mixed={padTop.mixed}
                        />
                    </div>
                </GroupShell>

                {/* 4. Margin */}
                <GroupShell
                    label="Margin"
                    onReset={() =>
                        setMultiple([
                            { property: 'margin-top', value: '' },
                            { property: 'margin-right', value: '' },
                            { property: 'margin-bottom', value: '' },
                            { property: 'margin-left', value: '' },
                        ])
                    }
                    actions={
                        <PerSidePopover
                            triggerIcon={<IconPerSideDashed />}
                            triggerLabel="Per-side margin"
                            values={{
                                top: marginTop.value,
                                right: marginRight.value,
                                bottom: marginBottom.value,
                                left: marginLeft.value,
                            }}
                            onCommit={commitMarginSide}
                            units={PAD_UNITS}
                            keywords={['auto']}
                        />
                    }
                >
                    <div className="grid grid-cols-2 gap-1.5">
                        <IconNumberInput
                            glyph={<IconMarginH />}
                            value={marginHValue}
                            onCommit={commitMarginH}
                            units={PAD_UNITS}
                            keywords={['auto']}
                            defaultUnit="px"
                            aria-label="Horizontal margin"
                            mixed={marginLeft.mixed}
                        />
                        <IconNumberInput
                            glyph={<IconMarginV />}
                            value={marginVValue}
                            onCommit={commitMarginV}
                            units={PAD_UNITS}
                            keywords={['auto']}
                            defaultUnit="px"
                            aria-label="Vertical margin"
                            mixed={marginTop.mixed}
                        />
                    </div>
                </GroupShell>
            </div>
        </Section>
    );
});
