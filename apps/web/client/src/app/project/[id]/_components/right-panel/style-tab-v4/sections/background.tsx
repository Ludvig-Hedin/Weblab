'use client';

import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';

import {
    ColorField,
    ColorRow,
    FlowSegment,
    GroupShell,
    IconBgGradient,
    IconBgImage,
    IconBgNone,
    IconBgSolid,
    LabeledSelectInput,
    LabeledTextInput,
} from '../controls';
import { useStyleBatchSetter, useStyleSetter } from '../hooks/use-style-setter';
import { useStyleValue } from '../hooks/use-style-value';
import { Section } from './section';

// ── Constants ──────────────────────────────────────────────────────────

const BG_TYPE_OPTIONS = [
    { value: 'solid', label: 'Solid', icon: <IconBgSolid /> },
    { value: 'gradient', label: 'Gradient', icon: <IconBgGradient /> },
    { value: 'image', label: 'Image', icon: <IconBgImage /> },
    { value: 'none', label: 'None', icon: <IconBgNone /> },
] as const;

const BG_SIZE_OPTIONS = [
    { value: 'cover', label: 'Cover' },
    { value: 'contain', label: 'Contain' },
    { value: 'auto', label: 'Auto' },
] as const;

const BG_REPEAT_OPTIONS = [
    { value: 'no-repeat', label: 'No repeat' },
    { value: 'repeat', label: 'Repeat' },
    { value: 'repeat-x', label: 'Repeat X' },
    { value: 'repeat-y', label: 'Repeat Y' },
] as const;

// ── Type detection ─────────────────────────────────────────────────────

type BackgroundType = 'solid' | 'gradient' | 'image' | 'none';

function detectType(bgImage: string, bgColor: string): BackgroundType {
    if (bgImage) {
        if (bgImage.startsWith('linear-gradient(') || bgImage.startsWith('radial-gradient(')) {
            return 'gradient';
        }
        if (bgImage.startsWith('url(')) {
            return 'image';
        }
    }
    if (bgColor) {
        return 'solid';
    }
    return 'none';
}

// ── Extract URL from background-image: url("...") ─────────────────────

function extractUrl(bgImage: string): string {
    const match = /^url\(['"]?(.*?)['"]?\)$/.exec(bgImage.trim());
    return match?.[1] ?? '';
}

function wrapUrl(raw: string): string {
    if (!raw) return '';
    return `url("${raw}")`;
}

// ── Main component ─────────────────────────────────────────────────────

export const BackgroundSection = observer(function BackgroundSection() {
    const bgColor = useStyleValue('background-color');
    const bgImage = useStyleValue('background-image');
    const bgSize = useStyleValue('background-size');
    const bgRepeat = useStyleValue('background-repeat');

    const bgColorSetter = useStyleSetter('background-color');
    const bgImageSetter = useStyleSetter('background-image');
    const bgSizeSetter = useStyleSetter('background-size');
    const bgRepeatSetter = useStyleSetter('background-repeat');
    const { setMultiple } = useStyleBatchSetter();

    // Derive initial type from current CSS, then let local state track it.
    const [type, setType] = useState<BackgroundType>(() =>
        detectType(bgImage.value, bgColor.value),
    );

    // Keep type in sync when external style changes drive a type shift (e.g.
    // user edits the raw CSS or selects a different element on canvas).
    //
    // No early-return here — when both values become empty we want to flip
    // back to 'none', otherwise the previous element's mode leaks into the
    // current selection. Local handler-driven type changes (Image w/o url)
    // are preserved via a tick because state updates batch.
    const bgImageValue = bgImage.value;
    const bgColorValue = bgColor.value;
    useEffect(() => {
        const derived = detectType(bgImageValue, bgColorValue);
        // Avoid clobbering Image / Gradient modes the user just picked locally
        // when nothing is committed yet (e.g. user switched to Image and is
        // about to type a URL).
        setType((prev) => {
            if ((prev === 'image' || prev === 'gradient') && derived === 'none' && !bgImage.isSet) {
                return prev;
            }
            return derived;
        });
    }, [bgImageValue, bgColorValue, bgImage.isSet]);

    // ── Handlers ────────────────────────────────────────────────────────

    const handleTypeChange = (next: string) => {
        const t = next as BackgroundType;
        setType(t);

        if (t === 'solid') {
            // Clear image; keep (or seed) color.
            const entries: { property: string; value: string }[] = [
                { property: 'background-image', value: '' },
            ];
            if (!bgColor.value) {
                entries.push({ property: 'background-color', value: '#000000' });
            }
            setMultiple(entries);
        } else if (t === 'image') {
            // Clear color. Don't seed an invalid `url()` — leave bg-image
            // empty until the user actually picks an asset; the URL row's
            // placeholder advertises affordance without polluting the AST.
            setMultiple([{ property: 'background-color', value: '' }]);
        } else if (t === 'none') {
            setMultiple([
                { property: 'background-color', value: '' },
                { property: 'background-image', value: '' },
            ]);
        } else if (t === 'gradient') {
            // Clear color; leave image for future gradient editor.
            setMultiple([{ property: 'background-color', value: '' }]);
        }
    };

    const handleColorCommit = (value: string) => {
        bgColorSetter.set(value);
    };

    const handleImageUrlCommit = (rawUrl: string) => {
        bgImageSetter.set(wrapUrl(rawUrl));
    };

    const handleSizeCommit = (value: string) => {
        bgSizeSetter.set(value);
    };

    const handleRepeatCommit = (value: string) => {
        bgRepeatSetter.set(value);
    };

    // ── setCount calculation removed in v4 — section dot hidden per spec.

    // ── Image URL display value ─────────────────────────────────────────

    const imageUrlValue = extractUrl(bgImage.value);

    return (
        <Section id="background" title="Background">
            <div className="flex flex-col gap-3 px-3 pb-3">
                {/* Type selector */}
                <GroupShell label="Type">
                    <FlowSegment
                        ariaLabel="Background type"
                        value={type}
                        options={BG_TYPE_OPTIONS}
                        onCommit={handleTypeChange}
                    />
                </GroupShell>

                {/* Solid — color row */}
                {type === 'solid' && (
                    <GroupShell label="Color">
                        <ColorRow
                            value={bgColor.value}
                            onCommit={handleColorCommit}
                            pickerContent={
                                <ColorField value={bgColor.value} onCommit={handleColorCommit} />
                            }
                        />
                    </GroupShell>
                )}

                {/* Image — URL + size + repeat */}
                {type === 'image' && (
                    <>
                        <GroupShell label="Image">
                            <LabeledTextInput
                                glyph={<IconBgImage size={14} />}
                                value={imageUrlValue}
                                onCommit={handleImageUrlCommit}
                                placeholder="URL or asset…"
                                aria-label="Background image URL"
                            />
                        </GroupShell>
                        <div className="grid grid-cols-2 gap-1.5">
                            <LabeledSelectInput
                                label="Size"
                                options={BG_SIZE_OPTIONS}
                                value={bgSize.value}
                                onCommit={handleSizeCommit}
                            />
                            <LabeledSelectInput
                                label="Repeat"
                                options={BG_REPEAT_OPTIONS}
                                value={bgRepeat.value}
                                onCommit={handleRepeatCommit}
                            />
                        </div>
                    </>
                )}

                {/* Gradient — placeholder */}
                {type === 'gradient' && (
                    <p className="text-muted-foreground text-mini px-1 py-2">
                        Gradient editor — coming soon
                    </p>
                )}
            </div>
        </Section>
    );
});
