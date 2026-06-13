'use client';

import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import {
    GroupShell,
    IconButtonSm,
    IconFlipH,
    IconFlipV,
    IconNumberInput,
    IconRotate,
    LabeledSelectInput,
    PairRow,
    PinPad,
} from '../controls';
import { useStyleBatchSetter, useStyleSetter } from '../hooks/use-style-setter';
import { useStyleValue } from '../hooks/use-style-value';
import { Section } from './section';

// POSITION_OPTIONS defined inside PositionSection to use translations

/**
 * Position section — variant C (super-tight, Figma-approved).
 *
 * When `position === static`: only the Type select is shown.
 * Otherwise: PinPad + Type/Z-index pair + Rotate/Flip pair.
 *
 * Transform flip implementation is intentionally simple: reads the
 * current `transform` value and checks for `scaleX(-1)` / `scaleY(-1)`.
 * Composing with other transforms (rotate, translate) is a v4.1 follow-up.
 */
export const PositionSection = observer(function PositionSection() {
    const t = useTranslations('editor.stylePanel');

    const POSITION_OPTIONS = [
        { value: 'static', label: t('position.static') },
        { value: 'relative', label: t('position.relative') },
        { value: 'absolute', label: t('position.absolute') },
        { value: 'fixed', label: t('position.fixed') },
        { value: 'sticky', label: t('position.sticky') },
    ] as const;

    const position = useStyleValue('position');
    const top = useStyleValue('top');
    const right = useStyleValue('right');
    const bottom = useStyleValue('bottom');
    const left = useStyleValue('left');
    const zIndex = useStyleValue('z-index');
    const rotate = useStyleValue('rotate');
    const transform = useStyleValue('transform');

    const positionSetter = useStyleSetter('position');
    const rotateSetter = useStyleSetter('rotate');
    const transformSetter = useStyleSetter('transform');
    const { setMultiple } = useStyleBatchSetter();

    const positionValue = position.value || 'static';
    const isStatic = positionValue === 'static';

    // ── Pin-pad handlers ─────────────────────────────────────────────────

    const handleTogglePin = (side: 'top' | 'right' | 'bottom' | 'left') => {
        const current = {
            top: top.value,
            right: right.value,
            bottom: bottom.value,
            left: left.value,
        }[side];

        const isUnset = current === '' || current === 'auto';
        setMultiple([{ property: side, value: isUnset ? '0' : 'auto' }]);
    };

    const handleCommitSide = (side: 'top' | 'right' | 'bottom' | 'left', value: string) => {
        setMultiple([{ property: side, value: value.trim() === '' ? 'auto' : value }]);
    };

    // ── Flip helpers ─────────────────────────────────────────────────────

    const rawTransform = transform.value;

    const isFlippedH = rawTransform.includes('scaleX(-1)');
    const isFlippedV = rawTransform.includes('scaleY(-1)');

    const handleFlipH = () => {
        // Simple toggle: inject or remove scaleX(-1).
        // TODO (v4.1): use @weblab/parser transform composition helper so
        // flip composes cleanly with rotate and translate instead of
        // overwriting them.
        if (isFlippedH) {
            const next = rawTransform.replace(/\s*scaleX\(-1\)/g, '').trim();
            transformSetter.set(next || '');
        } else {
            const base = rawTransform.trim();
            transformSetter.set(base ? `${base} scaleX(-1)` : 'scaleX(-1)');
        }
    };

    const handleFlipV = () => {
        if (isFlippedV) {
            const next = rawTransform.replace(/\s*scaleY\(-1\)/g, '').trim();
            transformSetter.set(next || '');
        } else {
            const base = rawTransform.trim();
            transformSetter.set(base ? `${base} scaleY(-1)` : 'scaleY(-1)');
        }
    };

    // ── Rotate helper ────────────────────────────────────────────────────

    const handleRotateCommit = (value: string) => {
        rotateSetter.set(value);
    };

    // ── Render ───────────────────────────────────────────────────────────

    return (
        <Section id="position" title={t('section.position')}>
            <div className="flex flex-col gap-3 px-3 pt-1 pb-3">
                {isStatic ? (
                    <>
                        <GroupShell>
                            <LabeledSelectInput
                                label={t('position.type')}
                                value={positionValue}
                                options={POSITION_OPTIONS}
                                onCommit={positionSetter.set}
                            />
                        </GroupShell>
                        <p className="text-foreground-tertiary text-mini px-0.5">
                            {t('position.staticHint')}
                        </p>
                    </>
                ) : (
                    <>
                        {/* Pin-pad offsets */}
                        <GroupShell
                            label={t('position.offsets')}
                            onReset={() =>
                                setMultiple([
                                    { property: 'top', value: '' },
                                    { property: 'right', value: '' },
                                    { property: 'bottom', value: '' },
                                    { property: 'left', value: '' },
                                ])
                            }
                        >
                            <PinPad
                                sides={{
                                    top: top.value,
                                    right: right.value,
                                    bottom: bottom.value,
                                    left: left.value,
                                }}
                                onTogglePin={handleTogglePin}
                                onCommitSide={handleCommitSide}
                                onClearAll={() =>
                                    setMultiple([
                                        { property: 'top', value: '' },
                                        { property: 'right', value: '' },
                                        { property: 'bottom', value: '' },
                                        { property: 'left', value: '' },
                                    ])
                                }
                            />
                        </GroupShell>

                        {/* Type · Z-index */}
                        <PairRow>
                            <GroupShell>
                                <LabeledSelectInput
                                    label={t('position.type')}
                                    value={positionValue}
                                    options={POSITION_OPTIONS}
                                    onCommit={positionSetter.set}
                                />
                            </GroupShell>
                            <GroupShell>
                                <IconNumberInput
                                    glyph={null}
                                    value={zIndex.value}
                                    onCommit={(v) =>
                                        setMultiple([{ property: 'z-index', value: v }])
                                    }
                                    units={[]}
                                    keywords={['auto']}
                                    defaultUnit=""
                                    allowKeywords
                                    placeholder="Z"
                                    aria-label={t('position.zIndex')}
                                />
                            </GroupShell>
                        </PairRow>

                        {/* Rotate · Flip */}
                        <PairRow>
                            <GroupShell>
                                <IconNumberInput
                                    glyph={<IconRotate />}
                                    value={rotate.value}
                                    onCommit={handleRotateCommit}
                                    units={['deg', 'rad', 'turn']}
                                    defaultUnit="deg"
                                    allowKeywords={false}
                                    placeholder="0"
                                    aria-label={t('position.rotation')}
                                />
                            </GroupShell>
                            <div className="flex items-end gap-1">
                                <IconButtonSm
                                    label={t('position.flipHorizontal')}
                                    pressed={isFlippedH}
                                    onClick={handleFlipH}
                                >
                                    <IconFlipH />
                                </IconButtonSm>
                                <IconButtonSm
                                    label={t('position.flipVertical')}
                                    pressed={isFlippedV}
                                    onClick={handleFlipV}
                                >
                                    <IconFlipV />
                                </IconButtonSm>
                            </div>
                        </PairRow>
                    </>
                )}
            </div>
        </Section>
    );
});
