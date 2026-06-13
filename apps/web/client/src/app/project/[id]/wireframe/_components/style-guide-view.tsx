'use client';

import { useEffect, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useAction, useMutation } from 'convex/react';
import { Check, Loader2, Wand2 } from 'lucide-react';

import type { StyleGuideTokens } from '@weblab/wireframe-blocks';
import { Button } from '@weblab/ui/button';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { asStyleGuideTokens, getBlockMeta, styleGuideToCssVars } from '@weblab/wireframe-blocks';

import type { FullDoc } from './types';
import { BlockFrame } from './block-frame';

const COLOR_FIELDS: Array<[keyof StyleGuideTokens, string]> = [
    ['primary', 'Primary'],
    ['background', 'Background'],
    ['foreground', 'Foreground'],
    ['secondary', 'Secondary'],
    ['muted', 'Muted'],
    ['accent', 'Accent'],
    ['border', 'Border'],
    ['ring', 'Ring'],
    ['brandAccent', 'Brand accent'],
];

function sampleSections(): Array<{
    _id: string;
    blockId: string;
    content: unknown;
}> {
    return ['hero-1', 'feature-grid-10', 'cta-1'].map((id, i) => ({
        _id: `sample-${i}`,
        blockId: id,
        content: getBlockMeta(id)?.defaultContent ?? {},
    }));
}

export function StyleGuideView({ full }: { full: FullDoc }) {
    const generate = useAction(api.wireframeActions.generateStyleGuide);
    const update = useMutation(api.wireframes.updateStyleGuide);
    const apply = useMutation(api.wireframes.applyStyleGuide);

    const active = full.styleGuides.find((g) => g.isActive) ?? full.styleGuides[0] ?? null;
    const [tokens, setTokens] = useState<StyleGuideTokens>(() =>
        active ? asStyleGuideTokens(active.tokens) : {},
    );
    const [conceptName, setConceptName] = useState(active?.conceptName ?? '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (active) {
            setTokens(asStyleGuideTokens(active.tokens));
            setConceptName(active.conceptName);
        }
    }, [active?._id]); // eslint-disable-line react-hooks/exhaustive-deps

    async function runGenerate() {
        setError(null);
        setBusy(true);
        try {
            await generate({ docId: full.doc._id });
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Style guide generation failed.');
        } finally {
            setBusy(false);
        }
    }

    async function handleSaveApply() {
        if (!active) return;
        await update({ styleGuideId: active._id, conceptName, tokens });
        await apply({ styleGuideId: active._id });
    }

    if (!active) {
        return (
            <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-20 text-center">
                <h2 className="text-foreground text-lg font-semibold">No style guide yet</h2>
                <p className="text-muted-foreground text-sm">
                    Generate one concept — colors, typography, and radius — from your brief.
                </p>
                {error && <p className="text-destructive text-sm">{error}</p>}
                <Button onClick={() => void runGenerate()} disabled={busy}>
                    {busy ? <Loader2 className="animate-spin" /> : <Wand2 />} Generate style guide
                </Button>
            </div>
        );
    }

    const firstPage = [...full.wireframePages].sort((a, b) => a.order - b.order)[0];
    const previewSections = firstPage
        ? full.wireframeSections
              .filter((s) => s.wireframePageId === firstPage._id)
              .sort((a, b) => a.order - b.order)
              .map((s) => ({ _id: s._id, blockId: s.blockId, content: s.content as unknown }))
        : sampleSections();

    const setColor = (key: keyof StyleGuideTokens, value: string) =>
        setTokens((t) => ({ ...t, [key]: value }));

    return (
        <div className="flex h-full">
            <aside className="border-border w-80 shrink-0 overflow-auto border-r p-5">
                <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-muted-foreground text-xs">Concept name</Label>
                        <Input
                            value={conceptName}
                            onChange={(e) => setConceptName(e.target.value)}
                        />
                    </div>

                    <div className="flex flex-col gap-3">
                        <Label className="text-muted-foreground text-xs">Colors</Label>
                        {COLOR_FIELDS.map(([key, label]) => (
                            <div key={key} className="flex items-center gap-2">
                                <span
                                    className="border-border h-6 w-6 shrink-0 rounded-md border"
                                    style={{ background: tokens[key] ?? 'transparent' }}
                                />
                                <span className="text-foreground w-24 shrink-0 text-xs">
                                    {label}
                                </span>
                                <Input
                                    value={tokens[key] ?? ''}
                                    placeholder="oklch(…) or #…"
                                    className="h-8 font-mono text-xs"
                                    onChange={(e) => setColor(key, e.target.value)}
                                />
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-muted-foreground text-xs">Radius</Label>
                            <Input
                                value={tokens.radius ?? ''}
                                placeholder="0.625rem"
                                className="h-8 text-xs"
                                onChange={(e) => setColor('radius', e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-muted-foreground text-xs">Heading font</Label>
                            <Input
                                value={tokens.fontHeading ?? ''}
                                placeholder="Sora"
                                className="h-8 text-xs"
                                onChange={(e) => setColor('fontHeading', e.target.value)}
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-muted-foreground text-xs">Body font</Label>
                            <Input
                                value={tokens.fontBody ?? ''}
                                placeholder="Inter"
                                className="h-8 text-xs"
                                onChange={(e) => setColor('fontBody', e.target.value)}
                            />
                        </div>
                    </div>

                    {error && <p className="text-destructive text-sm">{error}</p>}

                    <div className="flex flex-col gap-2">
                        <Button onClick={() => void handleSaveApply()}>
                            <Check /> Save & apply to all pages
                        </Button>
                        <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() => void runGenerate()}
                        >
                            {busy ? <Loader2 className="animate-spin" /> : <Wand2 />} Regenerate
                            concept
                        </Button>
                    </div>
                </div>
            </aside>

            <div className="flex-1 overflow-auto bg-[color:var(--background-secondary,#f6f6f6)] p-8">
                <div className="border-border bg-background mx-auto max-w-4xl overflow-hidden rounded-xl border shadow-sm">
                    <div style={styleGuideToCssVars(tokens)}>
                        <BlockFrame sections={previewSections} />
                    </div>
                </div>
            </div>
        </div>
    );
}
