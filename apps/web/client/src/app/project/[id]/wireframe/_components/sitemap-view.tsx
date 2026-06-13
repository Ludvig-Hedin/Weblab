'use client';

import { useState } from 'react';
import { api } from '@convex/_generated/api';
import { moveInArray } from '@convex/lib/wireframeOrder';
import { useAction, useMutation } from 'convex/react';
import { ArrowRight, ChevronDown, ChevronUp, Loader2, Plus, Trash2, Wand2 } from 'lucide-react';

import { Badge } from '@weblab/ui/badge';
import { Button } from '@weblab/ui/button';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { Textarea } from '@weblab/ui/textarea';

import type { FullDoc } from './types';
import type { Doc } from '@convex/_generated/dataModel';
import { EditableText } from './editable-text';

export function SitemapView({
    full,
    onGotoWireframe,
}: {
    full: FullDoc;
    onGotoWireframe: () => void;
}) {
    const docId = full.doc._id;
    const updateBrief = useMutation(api.wireframes.updateBrief);
    const generateSitemap = useAction(api.wireframeActions.generateSitemap);
    const generateWireframe = useAction(api.wireframeActions.generateWireframe);
    const addPage = useMutation(api.wireframes.addPage);
    const reorderPages = useMutation(api.wireframes.reorderPages);

    const [brief, setBrief] = useState<Doc<'wireframeDocs'>['brief']>(full.doc.brief);
    const [busy, setBusy] = useState<null | 'sitemap' | 'wireframe'>(null);
    const [error, setError] = useState<string | null>(null);

    const pages = [...full.sitemapPages].sort((a, b) => a.order - b.order);

    async function runGenerateSitemap() {
        if (!brief.companyName.trim()) {
            setError('Add at least a company or product name.');
            return;
        }
        setError(null);
        setBusy('sitemap');
        try {
            await updateBrief({ docId, brief });
            await generateSitemap({ docId });
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Sitemap generation failed.');
        } finally {
            setBusy(null);
        }
    }

    async function runGenerateWireframes() {
        setError(null);
        setBusy('wireframe');
        try {
            await generateWireframe({ docId });
            onGotoWireframe();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Wireframe generation failed.');
        } finally {
            setBusy(null);
        }
    }

    async function movePage(index: number, dir: -1 | 1) {
        const ids = pages.map((p) => p._id);
        await reorderPages({
            docId,
            orderedPageIds: moveInArray(ids, index, index + dir),
        });
    }

    if (pages.length === 0) {
        return (
            <div className="mx-auto w-full max-w-2xl px-6 py-10">
                <BriefForm
                    brief={brief}
                    setBrief={setBrief}
                    busy={busy === 'sitemap'}
                    error={error}
                    onGenerate={() => void runGenerateSitemap()}
                    onAddManual={() => void addPage({ docId, title: 'Home' })}
                />
            </div>
        );
    }

    return (
        <div className="mx-auto w-full max-w-3xl px-6 py-8">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-foreground text-lg font-semibold tracking-tight">
                        Sitemap
                    </h2>
                    <p className="text-muted-foreground text-sm">
                        {brief.companyName || 'Your project'} — the source of truth for your pages.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={busy !== null}
                        onClick={() => {
                            if (
                                confirm(
                                    'Regenerate the sitemap? This replaces all pages and any wireframes.',
                                )
                            ) {
                                void runGenerateSitemap();
                            }
                        }}
                    >
                        {busy === 'sitemap' ? <Loader2 className="animate-spin" /> : <Wand2 />}
                        Regenerate
                    </Button>
                    <Button
                        size="sm"
                        disabled={busy !== null}
                        onClick={() => void runGenerateWireframes()}
                    >
                        {busy === 'wireframe' ? (
                            <Loader2 className="animate-spin" />
                        ) : (
                            <ArrowRight />
                        )}
                        Generate wireframes
                    </Button>
                </div>
            </div>

            {error && <p className="text-destructive mb-4 text-sm">{error}</p>}

            <div className="flex flex-col gap-4">
                {pages.map((page, i) => (
                    <PageCard
                        key={page._id}
                        page={page}
                        sections={full.sitemapSections.filter((s) => s.pageId === page._id)}
                        canMoveUp={i > 0}
                        canMoveDown={i < pages.length - 1}
                        onMove={(dir) => void movePage(i, dir)}
                    />
                ))}
                <Button
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() => void addPage({ docId, title: 'New page' })}
                >
                    <Plus /> Add page
                </Button>
            </div>
        </div>
    );
}

function BriefForm({
    brief,
    setBrief,
    busy,
    error,
    onGenerate,
    onAddManual,
}: {
    brief: Doc<'wireframeDocs'>['brief'];
    setBrief: (b: Doc<'wireframeDocs'>['brief']) => void;
    busy: boolean;
    error: string | null;
    onGenerate: () => void;
    onAddManual: () => void;
}) {
    const set = (patch: Partial<Doc<'wireframeDocs'>['brief']>) => setBrief({ ...brief, ...patch });
    return (
        <div className="border-border bg-background flex flex-col gap-5 rounded-xl border p-6">
            <div>
                <h2 className="text-foreground text-lg font-semibold tracking-tight">
                    Start with a brief
                </h2>
                <p className="text-muted-foreground text-sm">
                    A few details and AI drafts your sitemap in seconds.
                </p>
            </div>

            <Field label="Company / product name">
                <Input
                    value={brief.companyName}
                    placeholder="Acme"
                    onChange={(e) => set({ companyName: e.target.value })}
                />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Industry">
                    <Input
                        value={brief.industry ?? ''}
                        placeholder="B2B SaaS"
                        onChange={(e) => set({ industry: e.target.value })}
                    />
                </Field>
                <Field label="Target audience">
                    <Input
                        value={brief.audience ?? ''}
                        placeholder="Ops teams at mid-market companies"
                        onChange={(e) => set({ audience: e.target.value })}
                    />
                </Field>
            </div>
            <Field label="Offer / value proposition">
                <Textarea
                    rows={2}
                    value={brief.offer ?? ''}
                    placeholder="What you do and why it matters."
                    onChange={(e) => set({ offer: e.target.value })}
                />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Tone / style">
                    <Input
                        value={brief.tone ?? ''}
                        placeholder="Confident, plain-spoken"
                        onChange={(e) => set({ tone: e.target.value })}
                    />
                </Field>
                <Field label="Number of pages">
                    <Input
                        type="number"
                        min={1}
                        max={20}
                        value={brief.pageCount ?? 4}
                        onChange={(e) =>
                            set({
                                pageCount: Math.max(1, Math.min(20, Number(e.target.value) || 1)),
                            })
                        }
                    />
                </Field>
            </div>
            <Field label="References (optional)">
                <Input
                    value={brief.references ?? ''}
                    placeholder="Competitor sites, inspiration…"
                    onChange={(e) => set({ references: e.target.value })}
                />
            </Field>

            {error && <p className="text-destructive text-sm">{error}</p>}

            <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={onAddManual} disabled={busy}>
                    Start blank instead
                </Button>
                <Button onClick={onGenerate} disabled={busy}>
                    {busy ? <Loader2 className="animate-spin" /> : <Wand2 />}
                    Generate sitemap
                </Button>
            </div>
        </div>
    );
}

function PageCard({
    page,
    sections,
    canMoveUp,
    canMoveDown,
    onMove,
}: {
    page: Doc<'sitemapPages'>;
    sections: Doc<'sitemapSections'>[];
    canMoveUp: boolean;
    canMoveDown: boolean;
    onMove: (dir: -1 | 1) => void;
}) {
    const updatePage = useMutation(api.wireframes.updatePage);
    const deletePage = useMutation(api.wireframes.deletePage);
    const addSection = useMutation(api.wireframes.addSection);
    const reorderSections = useMutation(api.wireframes.reorderSections);

    const ordered = [...sections].sort((a, b) => a.order - b.order);

    async function moveSection(index: number, dir: -1 | 1) {
        const ids = ordered.map((s) => s._id);
        await reorderSections({
            pageId: page._id,
            orderedSectionIds: moveInArray(ids, index, index + dir),
        });
    }

    return (
        <div className="border-border bg-background rounded-xl border p-4">
            <div className="flex items-center gap-2">
                <div className="flex-1">
                    <EditableText
                        value={page.title}
                        onCommit={(title) => void updatePage({ pageId: page._id, title })}
                        className="font-medium"
                    />
                </div>
                <Badge variant="secondary" className="font-mono text-[11px]">
                    /{page.slug}
                </Badge>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={!canMoveUp}
                    onClick={() => onMove(-1)}
                >
                    <ChevronUp />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={!canMoveDown}
                    onClick={() => onMove(1)}
                >
                    <ChevronDown />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                        if (confirm(`Delete page “${page.title}” and its sections?`)) {
                            void deletePage({ pageId: page._id });
                        }
                    }}
                >
                    <Trash2 />
                </Button>
            </div>

            <div className="mt-3 flex flex-col gap-2 pl-1">
                {ordered.map((section, i) => (
                    <SectionRow
                        key={section._id}
                        section={section}
                        canMoveUp={i > 0}
                        canMoveDown={i < ordered.length - 1}
                        onMove={(dir) => void moveSection(i, dir)}
                    />
                ))}
                <Button
                    variant="ghost"
                    size="sm"
                    className="self-start"
                    onClick={() => void addSection({ pageId: page._id, title: 'New section' })}
                >
                    <Plus /> Add section
                </Button>
            </div>
        </div>
    );
}

function SectionRow({
    section,
    canMoveUp,
    canMoveDown,
    onMove,
}: {
    section: Doc<'sitemapSections'>;
    canMoveUp: boolean;
    canMoveDown: boolean;
    onMove: (dir: -1 | 1) => void;
}) {
    const updateSection = useMutation(api.wireframes.updateSection);
    const deleteSection = useMutation(api.wireframes.deleteSection);
    const [open, setOpen] = useState(false);

    return (
        <div className="border-border bg-background-secondary/40 rounded-lg border">
            <div className="flex items-center gap-2 p-2">
                <Badge variant="outline" className="shrink-0 text-[11px] capitalize">
                    {section.suggestedBlockType}
                </Badge>
                <div className="flex-1">
                    <EditableText
                        value={section.title}
                        onCommit={(title) => void updateSection({ sectionId: section._id, title })}
                        className="h-8 text-sm"
                    />
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => setOpen((v) => !v)}>
                    <ChevronDown
                        className={
                            open ? 'rotate-180 transition-transform' : 'transition-transform'
                        }
                    />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={!canMoveUp}
                    onClick={() => onMove(-1)}
                >
                    <ChevronUp />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={!canMoveDown}
                    onClick={() => onMove(1)}
                >
                    <ChevronDown />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void deleteSection({ sectionId: section._id })}
                >
                    <Trash2 />
                </Button>
            </div>
            {open && (
                <div className="flex flex-col gap-2 px-2 pb-3">
                    <Label className="text-muted-foreground text-xs">
                        Section prompt / description
                    </Label>
                    <Textarea
                        rows={2}
                        defaultValue={section.description}
                        placeholder="What this section should communicate…"
                        onBlur={(e) => {
                            if (e.target.value !== section.description) {
                                void updateSection({
                                    sectionId: section._id,
                                    description: e.target.value,
                                });
                            }
                        }}
                    />
                </div>
            )}
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1.5">
            <Label className="text-muted-foreground text-xs">{label}</Label>
            {children}
        </div>
    );
}
