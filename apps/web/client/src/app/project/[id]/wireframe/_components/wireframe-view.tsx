'use client';

import { useState } from 'react';
import { api } from '@convex/_generated/api';
import { moveInArray } from '@convex/lib/wireframeOrder';
import { useAction, useMutation } from 'convex/react';
import {
    ChevronDown,
    ChevronUp,
    Loader2,
    Minus,
    Monitor,
    Plus,
    Smartphone,
    Tablet,
    Trash2,
} from 'lucide-react';

import { Badge } from '@weblab/ui/badge';
import { Button } from '@weblab/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import { getBlockMeta, variantsForBlock } from '@weblab/wireframe-blocks';

import type { FullDoc } from './types';
import type { Doc } from '@convex/_generated/dataModel';
import { BlockFrame } from './block-frame';
import { ContentEditor } from './content-editor';
import { FramePreview } from './frame-preview';

const WIDTHS = { desktop: 1280, tablet: 834, mobile: 390 } as const;
type Responsive = keyof typeof WIDTHS;

export function WireframeView({
    full,
    onGotoSitemap,
}: {
    full: FullDoc;
    onGotoSitemap: () => void;
}) {
    const generateWireframe = useAction(api.wireframeActions.generateWireframe);
    const [responsive, setResponsive] = useState<Responsive>('desktop');
    const [scale, setScale] = useState(0.36);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const pages = [...full.wireframePages].sort((a, b) => a.order - b.order);

    async function regenerate() {
        setError(null);
        setBusy(true);
        try {
            await generateWireframe({ docId: full.doc._id });
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Generation failed.');
        } finally {
            setBusy(false);
        }
    }

    if (pages.length === 0) {
        const hasSitemap = full.sitemapPages.length > 0;
        return (
            <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-20 text-center">
                <h2 className="text-foreground text-lg font-semibold">No wireframes yet</h2>
                <p className="text-muted-foreground text-sm">
                    {hasSitemap
                        ? 'Generate wireframes from your sitemap — every section maps to a real block.'
                        : 'Create a sitemap first, then generate wireframes from it.'}
                </p>
                {error && <p className="text-destructive text-sm">{error}</p>}
                {hasSitemap ? (
                    <Button onClick={() => void regenerate()} disabled={busy}>
                        {busy ? <Loader2 className="animate-spin" /> : null} Generate wireframes
                    </Button>
                ) : (
                    <Button onClick={onGotoSitemap}>Go to sitemap</Button>
                )}
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col">
            <Toolbar
                responsive={responsive}
                setResponsive={setResponsive}
                scale={scale}
                setScale={setScale}
                busy={busy}
                onRegenerate={() => {
                    if (
                        confirm(
                            'Regenerate all wireframes from the sitemap? This replaces current wireframe edits.',
                        )
                    ) {
                        void regenerate();
                    }
                }}
            />
            {error && <p className="text-destructive px-6 py-2 text-sm">{error}</p>}
            <div className="flex-1 overflow-auto px-6 py-6">
                <div className="flex flex-col gap-10">
                    {pages.map((page) => (
                        <WireframePageBlock
                            key={page._id}
                            page={page}
                            sections={full.wireframeSections.filter(
                                (s) => s.wireframePageId === page._id,
                            )}
                            frameWidth={WIDTHS[responsive]}
                            scale={scale}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

function Toolbar({
    responsive,
    setResponsive,
    scale,
    setScale,
    busy,
    onRegenerate,
}: {
    responsive: Responsive;
    setResponsive: (r: Responsive) => void;
    scale: number;
    setScale: (s: number) => void;
    busy: boolean;
    onRegenerate: () => void;
}) {
    return (
        <div className="border-border flex items-center justify-between gap-3 border-b px-6 py-2">
            <div className="border-border inline-flex items-center gap-1 rounded-lg border p-1">
                <Button
                    variant={responsive === 'desktop' ? 'default' : 'ghost'}
                    size="icon-sm"
                    onClick={() => setResponsive('desktop')}
                >
                    <Monitor />
                </Button>
                <Button
                    variant={responsive === 'tablet' ? 'default' : 'ghost'}
                    size="icon-sm"
                    onClick={() => setResponsive('tablet')}
                >
                    <Tablet />
                </Button>
                <Button
                    variant={responsive === 'mobile' ? 'default' : 'ghost'}
                    size="icon-sm"
                    onClick={() => setResponsive('mobile')}
                >
                    <Smartphone />
                </Button>
            </div>
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setScale(Math.max(0.2, scale - 0.04))}
                    >
                        <Minus />
                    </Button>
                    <span className="text-muted-foreground w-10 text-center text-xs tabular-nums">
                        {Math.round(scale * 100)}%
                    </span>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setScale(Math.min(0.6, scale + 0.04))}
                    >
                        <Plus />
                    </Button>
                </div>
                <Button variant="outline" size="sm" disabled={busy} onClick={onRegenerate}>
                    {busy ? <Loader2 className="animate-spin" /> : null} Regenerate
                </Button>
            </div>
        </div>
    );
}

function WireframePageBlock({
    page,
    sections,
    frameWidth,
    scale,
}: {
    page: Doc<'wireframePages'>;
    sections: Doc<'wireframeSections'>[];
    frameWidth: number;
    scale: number;
}) {
    const addWireframeSection = useMutation(api.wireframes.addWireframeSection);
    const ordered = [...sections].sort((a, b) => a.order - b.order);

    return (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            <div className="shrink-0">
                <FramePreview title={page.title} frameWidth={frameWidth} scale={scale}>
                    <BlockFrame
                        sections={ordered.map((s) => ({
                            _id: s._id,
                            blockId: s.blockId,
                            content: s.content as unknown,
                        }))}
                        grayscale
                    />
                </FramePreview>
            </div>
            <div className="flex w-full max-w-md flex-col gap-2">
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    {page.title} — sections
                </p>
                {ordered.map((section, i) => (
                    <WireframeSectionRow
                        key={section._id}
                        section={section}
                        canMoveUp={i > 0}
                        canMoveDown={i < ordered.length - 1}
                        orderedIds={ordered.map((s) => s._id)}
                        index={i}
                        pageId={page._id}
                    />
                ))}
                <Button
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() =>
                        void addWireframeSection({
                            wireframePageId: page._id,
                            blockId: 'feature-grid-10',
                        })
                    }
                >
                    <Plus /> Add section
                </Button>
            </div>
        </div>
    );
}

function WireframeSectionRow({
    section,
    canMoveUp,
    canMoveDown,
    orderedIds,
    index,
    pageId,
}: {
    section: Doc<'wireframeSections'>;
    canMoveUp: boolean;
    canMoveDown: boolean;
    orderedIds: Doc<'wireframeSections'>['_id'][];
    index: number;
    pageId: Doc<'wireframePages'>['_id'];
}) {
    const swapBlock = useMutation(api.wireframes.swapWireframeBlock);
    const deleteSection = useMutation(api.wireframes.deleteWireframeSection);
    const setContent = useMutation(api.wireframes.setWireframeContent);
    const reorder = useMutation(api.wireframes.reorderWireframeSections);
    const [editing, setEditing] = useState(false);

    const meta = getBlockMeta(section.blockId);
    const variants = variantsForBlock(section.blockId);

    function move(dir: -1 | 1) {
        void reorder({
            wireframePageId: pageId,
            orderedSectionIds: moveInArray(orderedIds, index, index + dir),
        });
    }

    return (
        <div className="border-border bg-background rounded-lg border">
            <div className="flex items-center gap-2 p-2">
                <Badge variant="outline" className="shrink-0 text-[11px] capitalize">
                    {section.blockCategory}
                </Badge>
                <div className="min-w-0 flex-1">
                    {variants.length > 1 ? (
                        <Select
                            value={section.blockId}
                            onValueChange={(blockId) =>
                                void swapBlock({ wireframeSectionId: section._id, blockId })
                            }
                        >
                            <SelectTrigger size="sm" className="h-8 w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {variants.map((variant) => (
                                    <SelectItem key={variant.id} value={variant.id}>
                                        {variant.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : (
                        <span className="text-foreground truncate text-sm">
                            {meta?.name ?? section.blockId}
                        </span>
                    )}
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => setEditing((v) => !v)}>
                    <ChevronDown
                        className={
                            editing ? 'rotate-180 transition-transform' : 'transition-transform'
                        }
                    />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={!canMoveUp}
                    onClick={() => move(-1)}
                >
                    <ChevronUp />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={!canMoveDown}
                    onClick={() => move(1)}
                >
                    <ChevronDown />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void deleteSection({ wireframeSectionId: section._id })}
                >
                    <Trash2 />
                </Button>
            </div>
            {editing && (
                <div className="border-border border-t p-3">
                    <ContentEditor
                        content={section.content as unknown}
                        onCancel={() => setEditing(false)}
                        onSave={(content) => {
                            void setContent({ wireframeSectionId: section._id, content });
                            setEditing(false);
                        }}
                    />
                </div>
            )}
        </div>
    );
}
