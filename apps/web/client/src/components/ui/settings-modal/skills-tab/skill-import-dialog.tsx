'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useAction, useMutation } from 'convex/react';
import { strFromU8, unzipSync } from 'fflate';
import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@weblab/ui/dialog';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import { toast } from '@weblab/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@weblab/ui/tabs';
import { Textarea } from '@weblab/ui/textarea';
import { cn } from '@weblab/ui/utils';

import type { Id } from '@convex/_generated/dataModel';

interface ParsedSkill {
    name: string;
    description: string;
    content: string;
    contentPreview: string;
    contentLength: number;
}

// Matches the server-side cap in convex/skillActions.ts (previewImport). We
// check here too so oversized files fail fast with a clear message.
const MAX_SKILL_BYTES = 2 * 1024 * 1024;

export function SkillImportDialog({
    open,
    onOpenChange,
    projectId,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    projectId: string | null;
}) {
    const t = useTranslations('editor.settings.skillImportDialog');
    const [mode, setMode] = useState<'upload' | 'paste' | 'url'>('upload');
    const [url, setUrl] = useState('');
    const [rawContent, setRawContent] = useState('');
    const [fileName, setFileName] = useState<string | null>(null);
    const [scope, setScope] = useState<'global' | 'project'>('global');
    const [parsed, setParsed] = useState<ParsedSkill | null>(null);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (open) {
            setMode('upload');
            setUrl('');
            setRawContent('');
            setFileName(null);
            setIsDragging(false);
            setParsed(null);
            setScope('global');
        }
    }, [open]);

    const previewImport = useAction(api.skillActions.previewImport);
    const commitImport = useMutation(api.skills.commitImport);

    const runPreview = async (input: { url: string } | { rawContent: string }) => {
        setIsPreviewing(true);
        try {
            setParsed(null);
            const res = await previewImport(input);
            setParsed({
                name: res.name,
                description: res.description,
                content: res.content,
                contentPreview: res.contentPreview,
                contentLength: res.contentLength,
            });
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t('toastReadFailed'));
        } finally {
            setIsPreviewing(false);
        }
    };

    const fetchPreview = () => runPreview(mode === 'url' ? { url } : { rawContent });

    const commit = async () => {
        if (!parsed) return;
        setIsImporting(true);
        try {
            const res = await commitImport({
                ...(scope === 'project' && projectId
                    ? { projectId: projectId as Id<'projects'> }
                    : {}),
                name: parsed.name,
                description: parsed.description,
                content: parsed.content,
            });
            toast.success(t('toastImported', { name: res.skill.name }));
            onOpenChange(false);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t('toastImportFailed'));
        } finally {
            setIsImporting(false);
        }
    };

    const handleFile = async (file: File) => {
        setParsed(null);
        setRawContent('');
        setFileName(null);
        if (file.size > MAX_SKILL_BYTES) {
            toast.error(t('toastFileTooLarge'));
            return;
        }
        const isZip = file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip';
        try {
            let text: string;
            if (isZip) {
                const bytes = new Uint8Array(await file.arrayBuffer());
                const entries = unzipSync(bytes);
                const names = Object.keys(entries);
                // Prefer a SKILL.md at any depth; fall back to the first markdown.
                const key =
                    names.find((n) => /(^|\/)SKILL\.md$/i.test(n)) ??
                    names.find((n) => n.toLowerCase().endsWith('.md'));
                const entry = key ? entries[key] : undefined;
                if (!entry) {
                    toast.error(t('toastNoSkillMd'));
                    return;
                }
                text = strFromU8(entry);
            } else {
                text = await file.text();
            }
            if (text.length > MAX_SKILL_BYTES) {
                toast.error(t('toastFileTooLarge'));
                return;
            }
            if (text.trim().length === 0) {
                toast.error(t('toastEmptyFile'));
                return;
            }
            setRawContent(text);
            setFileName(file.name);
            // Auto-preview on upload so the user goes straight from file → Import.
            void runPreview({ rawContent: text });
        } catch {
            toast.error(t('toastUnzipFailed'));
        }
    };

    const canFetch =
        (mode === 'url' && url.trim().length > 0) ||
        ((mode === 'paste' || mode === 'upload') && rawContent.trim().length > 0);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{t('title')}</DialogTitle>
                    <DialogDescription>{t('description')}</DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <Tabs
                        value={mode}
                        onValueChange={(v) => setMode(v as 'upload' | 'paste' | 'url')}
                    >
                        <TabsList className="w-full">
                            <TabsTrigger value="upload" className="flex-1">
                                {t('tabs.upload')}
                            </TabsTrigger>
                            <TabsTrigger value="paste" className="flex-1">
                                {t('tabs.paste')}
                            </TabsTrigger>
                            <TabsTrigger value="url" className="flex-1">
                                {t('tabs.url')}
                            </TabsTrigger>
                        </TabsList>
                        <TabsContent value="upload" className="space-y-2 pt-3">
                            <Label>{t('uploadLabel')}</Label>
                            <div
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    setIsDragging(true);
                                }}
                                onDragLeave={() => setIsDragging(false)}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    setIsDragging(false);
                                    const f = e.dataTransfer.files?.[0];
                                    if (f) void handleFile(f);
                                }}
                                className={cn(
                                    'flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-6 text-center transition-colors',
                                    isDragging ? 'border-primary bg-primary/5' : 'border-border/60',
                                )}
                            >
                                <p className="text-muted-foreground text-mini">
                                    {t('uploadDropHint')}
                                </p>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    {t('uploadCta')}
                                </Button>
                                {fileName ? (
                                    <p className="text-small font-medium break-all">{fileName}</p>
                                ) : null}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    aria-label={t('uploadLabel')}
                                    accept=".md,.zip,text/markdown,application/zip"
                                    className="hidden"
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) void handleFile(f);
                                        // Allow re-selecting the same file name.
                                        e.target.value = '';
                                    }}
                                />
                            </div>
                            <p className="text-muted-foreground text-mini">{t('uploadHint')}</p>
                        </TabsContent>
                        <TabsContent value="paste" className="space-y-2 pt-3">
                            <Label htmlFor="import-raw">{t('pasteLabel')}</Label>
                            <Textarea
                                id="import-raw"
                                value={rawContent}
                                onChange={(e) => setRawContent(e.target.value)}
                                placeholder={t('pastePlaceholder')}
                                rows={10}
                                className="text-mini font-mono"
                            />
                        </TabsContent>
                        <TabsContent value="url" className="space-y-2 pt-3">
                            <Label htmlFor="import-url">{t('urlLabel')}</Label>
                            <Input
                                id="import-url"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder={t('urlPlaceholder')}
                            />
                            <p className="text-muted-foreground text-mini">{t('urlHint')}</p>
                        </TabsContent>
                    </Tabs>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            void fetchPreview();
                        }}
                        disabled={!canFetch || isPreviewing}
                    >
                        {isPreviewing ? t('previewing') : t('preview')}
                    </Button>

                    {parsed ? (
                        <div className="bg-background-secondary/40 border-border/40 space-y-2 rounded-md border p-3">
                            <div>
                                <p className="text-muted-foreground text-mini">
                                    {t('previewSection.name')}
                                </p>
                                <p className="text-small font-medium">{parsed.name}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground text-mini">
                                    {t('previewSection.description')}
                                </p>
                                <p className="text-mini">{parsed.description || '—'}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground text-mini">
                                    {t('previewSection.body', {
                                        count: String(parsed.contentLength),
                                    })}
                                </p>
                                <pre className="bg-background text-mini mt-1 max-h-32 overflow-auto rounded p-2 whitespace-pre-wrap">
                                    {parsed.contentPreview}
                                    {parsed.contentLength > parsed.contentPreview.length
                                        ? '\n…'
                                        : ''}
                                </pre>
                            </div>
                            {projectId ? (
                                <div className="pt-2">
                                    <Label htmlFor="import-scope">{t('scopeLabel')}</Label>
                                    <Select
                                        value={scope}
                                        onValueChange={(v) => setScope(v as 'global' | 'project')}
                                    >
                                        <SelectTrigger id="import-scope" className="mt-1">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="global">
                                                {t('scopeGlobal')}
                                            </SelectItem>
                                            <SelectItem value="project">
                                                {t('scopeProject')}
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        {t('cancel')}
                    </Button>
                    <Button
                        onClick={() => {
                            void commit();
                        }}
                        disabled={!parsed || isImporting}
                    >
                        {isImporting ? t('importing') : t('import')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
