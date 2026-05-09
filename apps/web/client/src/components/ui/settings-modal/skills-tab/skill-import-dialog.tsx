'use client';

import { useEffect, useState } from 'react';

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

import { api } from '@/trpc/react';

interface ParsedSkill {
    name: string;
    description: string;
    content: string;
    contentPreview: string;
    contentLength: number;
}

export function SkillImportDialog({
    open,
    onOpenChange,
    projectId,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    projectId: string | null;
}) {
    const [mode, setMode] = useState<'url' | 'paste'>('url');
    const [url, setUrl] = useState('');
    const [rawContent, setRawContent] = useState('');
    const [scope, setScope] = useState<'global' | 'project'>('global');
    const [parsed, setParsed] = useState<ParsedSkill | null>(null);

    useEffect(() => {
        if (open) {
            setMode('url');
            setUrl('');
            setRawContent('');
            setParsed(null);
            setScope('global');
        }
    }, [open]);

    const apiUtils = api.useUtils();
    const previewImport = api.skills.previewImport.useMutation();
    const commitImport = api.skills.commitImport.useMutation();

    const fetchPreview = async () => {
        try {
            setParsed(null);
            const res = await previewImport.mutateAsync(mode === 'url' ? { url } : { rawContent });
            setParsed({
                name: res.name,
                description: res.description,
                content: res.content,
                contentPreview: res.contentPreview,
                contentLength: res.contentLength,
            });
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to read skill');
        }
    };

    const commit = async () => {
        if (!parsed) return;
        try {
            const res = await commitImport.mutateAsync({
                projectId: scope === 'project' && projectId ? projectId : null,
                name: parsed.name,
                description: parsed.description,
                content: parsed.content,
            });
            toast.success(`Imported "${res.skill.name}"`);
            await apiUtils.skills.list.invalidate();
            onOpenChange(false);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to import skill');
        }
    };

    const canFetch =
        (mode === 'url' && url.trim().length > 0) ||
        (mode === 'paste' && rawContent.trim().length > 0);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Import skill</DialogTitle>
                    <DialogDescription>
                        Bring in a skill from a remote URL or paste its SKILL.md content. We parse
                        the frontmatter, show a preview, and only save once you confirm.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <Tabs value={mode} onValueChange={(v) => setMode(v as 'url' | 'paste')}>
                        <TabsList className="w-full">
                            <TabsTrigger value="url" className="flex-1">
                                From URL
                            </TabsTrigger>
                            <TabsTrigger value="paste" className="flex-1">
                                Paste content
                            </TabsTrigger>
                        </TabsList>
                        <TabsContent value="url" className="space-y-2 pt-3">
                            <Label htmlFor="import-url">SKILL.md URL</Label>
                            <Input
                                id="import-url"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="https://raw.githubusercontent.com/.../SKILL.md"
                            />
                            <p className="text-muted-foreground text-mini">
                                Allowed hosts: raw.githubusercontent.com,
                                gist.githubusercontent.com, agentskills.io.
                            </p>
                        </TabsContent>
                        <TabsContent value="paste" className="space-y-2 pt-3">
                            <Label htmlFor="import-raw">SKILL.md content</Label>
                            <Textarea
                                id="import-raw"
                                value={rawContent}
                                onChange={(e) => setRawContent(e.target.value)}
                                placeholder={`---\nname: my-skill\ndescription: Trigger description\n---\n\nBody…`}
                                rows={10}
                                className="text-mini font-mono"
                            />
                        </TabsContent>
                    </Tabs>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            void fetchPreview();
                        }}
                        disabled={!canFetch || previewImport.isPending}
                    >
                        {previewImport.isPending ? 'Reading…' : 'Preview'}
                    </Button>

                    {parsed ? (
                        <div className="bg-background-secondary/40 border-border/40 space-y-2 rounded-md border p-3">
                            <div>
                                <p className="text-muted-foreground text-mini">Name</p>
                                <p className="text-small font-medium">{parsed.name}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground text-mini">Description</p>
                                <p className="text-mini">{parsed.description || '—'}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground text-mini">
                                    Body ({parsed.contentLength} chars)
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
                                    <Label htmlFor="import-scope">Save to</Label>
                                    <Select
                                        value={scope}
                                        onValueChange={(v) => setScope(v as 'global' | 'project')}
                                    >
                                        <SelectTrigger id="import-scope" className="mt-1">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="global">Global</SelectItem>
                                            <SelectItem value="project">This project</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={() => {
                            void commit();
                        }}
                        disabled={!parsed || commitImport.isPending}
                    >
                        {commitImport.isPending ? 'Importing…' : 'Import skill'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
