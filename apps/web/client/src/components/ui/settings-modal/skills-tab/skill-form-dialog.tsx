'use client';

import { useEffect, useMemo, useState } from 'react';

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
import { Textarea } from '@weblab/ui/textarea';
import { cn } from '@weblab/ui/utils';

import { api } from '@/trpc/react';
import { ScopeBadge } from './scope-badge';

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;

export type SkillFormScope = 'global' | 'project';

interface InitialSkill {
    id: string;
    name: string;
    description: string;
    content: string;
    projectId: string | null;
}

export function SkillFormDialog({
    open,
    onOpenChange,
    projectId,
    builtInNames,
    initial,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** When set, the user is in a project context and can choose project scope. */
    projectId: string | null;
    /** Built-in names — used to warn (informational) if user shadows one. */
    builtInNames: ReadonlySet<string>;
    /** When provided, the dialog is in edit mode for this DB skill. */
    initial?: InitialSkill;
}) {
    const isEditing = Boolean(initial);
    const [name, setName] = useState(initial?.name ?? '');
    const [description, setDescription] = useState(initial?.description ?? '');
    const [content, setContent] = useState(initial?.content ?? '');
    const [scope, setScope] = useState<SkillFormScope>(initial?.projectId ? 'project' : 'global');

    useEffect(() => {
        if (open) {
            setName(initial?.name ?? '');
            setDescription(initial?.description ?? '');
            setContent(initial?.content ?? '');
            setScope(initial?.projectId ? 'project' : 'global');
        }
    }, [open, initial]);

    const apiUtils = api.useUtils();
    const create = api.skills.create.useMutation({
        onSuccess: async () => {
            await apiUtils.skills.list.invalidate();
            toast.success(`Saved skill "${name}"`);
            onOpenChange(false);
        },
        onError: (err) => toast.error(err.message),
    });
    const update = api.skills.update.useMutation({
        onSuccess: async () => {
            await apiUtils.skills.list.invalidate();
            toast.success(`Updated skill "${name}"`);
            onOpenChange(false);
        },
        onError: (err) => toast.error(err.message),
    });

    const nameError = useMemo(() => {
        if (!name) return null;
        if (!NAME_RE.test(name)) {
            return 'Use lowercase letters, digits, hyphens. 2–40 chars.';
        }
        return null;
    }, [name]);

    const shadowsBuiltIn = !isEditing && builtInNames.has(name);

    const canSubmit =
        Boolean(name) &&
        !nameError &&
        Boolean(content.trim()) &&
        !create.isPending &&
        !update.isPending;

    const submit = () => {
        if (!canSubmit) return;
        if (isEditing && initial) {
            update.mutate({
                skillId: initial.id,
                name,
                description,
                content,
            });
            return;
        }
        create.mutate({
            projectId: scope === 'project' && projectId ? projectId : null,
            name,
            description,
            content,
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {isEditing ? 'Edit skill' : 'New skill'}
                        {isEditing && initial ? (
                            <ScopeBadge scope={initial.projectId ? 'project' : 'global'} />
                        ) : null}
                    </DialogTitle>
                    <DialogDescription>
                        Skills teach the AI how to handle specific tasks. Add a name, a one-line
                        trigger description, and the markdown body the AI reads via{' '}
                        <code className="bg-muted text-mini rounded px-1 py-0.5">read_skill</code>.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="skill-name">Name</Label>
                        <Input
                            id="skill-name"
                            value={name}
                            onChange={(e) => setName(e.target.value.toLowerCase())}
                            placeholder="my-skill-name"
                            disabled={isEditing}
                            aria-invalid={Boolean(nameError)}
                        />
                        {nameError ? (
                            <p className="text-destructive text-mini">{nameError}</p>
                        ) : shadowsBuiltIn ? (
                            <p className="text-muted-foreground text-mini">
                                Heads up: this overrides the built-in &quot;{name}&quot; skill.
                            </p>
                        ) : (
                            <p className="text-muted-foreground text-mini">
                                Lowercase letters, digits, hyphens. The AI uses this to find the
                                skill.
                            </p>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="skill-description">Description</Label>
                        <Input
                            id="skill-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value.slice(0, 200))}
                            placeholder="One sentence — when should the AI use this skill?"
                            maxLength={200}
                        />
                        <p className="text-muted-foreground text-mini">
                            {description.length}/200 — shown to the AI in the system prompt.
                        </p>
                    </div>

                    {!isEditing && projectId ? (
                        <div className="space-y-1.5">
                            <Label htmlFor="skill-scope">Scope</Label>
                            <Select
                                value={scope}
                                onValueChange={(v) => setScope(v as SkillFormScope)}
                            >
                                <SelectTrigger id="skill-scope">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="global">
                                        Global — available in every project
                                    </SelectItem>
                                    <SelectItem value="project">This project only</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    ) : null}

                    <div className="space-y-1.5">
                        <Label htmlFor="skill-content">Body</Label>
                        <Textarea
                            id="skill-content"
                            value={content}
                            onChange={(e) => setContent(e.target.value.slice(0, 50_000))}
                            placeholder={`# When to use\n\nDescribe the trigger — "Use this skill when the user asks to ..."\n\n# Rules\n\n- ...`}
                            rows={16}
                            className={cn('text-mini font-mono')}
                        />
                        <p className="text-muted-foreground text-mini">
                            {content.length}/50,000 — markdown body the AI reads via read_skill.
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={!canSubmit}>
                        {create.isPending || update.isPending
                            ? 'Saving…'
                            : isEditing
                              ? 'Save changes'
                              : 'Create skill'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
