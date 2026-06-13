'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useMutation } from 'convex/react';
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
import { Textarea } from '@weblab/ui/textarea';
import { cn } from '@weblab/ui/utils';

import type { Id } from '@convex/_generated/dataModel';
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
    const t = useTranslations('settings.skills');
    const isEditing = Boolean(initial);
    const [name, setName] = useState(initial?.name ?? '');
    const [description, setDescription] = useState(initial?.description ?? '');
    const [content, setContent] = useState(initial?.content ?? '');
    const [scope, setScope] = useState<SkillFormScope>(initial?.projectId ? 'project' : 'global');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (open) {
            setName(initial?.name ?? '');
            setDescription(initial?.description ?? '');
            setContent(initial?.content ?? '');
            setScope(initial?.projectId ? 'project' : 'global');
        }
    }, [open, initial]);

    const createSkill = useMutation(api.skills.create);
    const updateSkill = useMutation(api.skills.update);

    const nameError = useMemo(() => {
        if (!name) return null;
        if (!NAME_RE.test(name)) {
            return t('formNameChars');
        }
        return null;
    }, [name, t]);

    const shadowsBuiltIn = !isEditing && builtInNames.has(name);

    const canSubmit = Boolean(name) && !nameError && Boolean(content.trim()) && !isSaving;

    const submit = async () => {
        if (!canSubmit) return;
        setIsSaving(true);
        try {
            if (isEditing && initial) {
                await updateSkill({
                    skillId: initial.id as Id<'skills'>,
                    name,
                    description,
                    content,
                });
                toast.success(t('formSaveSuccess', { name }));
            } else {
                await createSkill({
                    ...(scope === 'project' && projectId
                        ? { projectId: projectId as Id<'projects'> }
                        : {}),
                    name,
                    description,
                    content,
                });
                toast.success(t('formCreateSuccess', { name }));
            }
            onOpenChange(false);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t('formSaveFailed'));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {isEditing ? t('formEditTitle') : t('formNewTitle')}
                        {isEditing && initial ? (
                            <ScopeBadge scope={initial.projectId ? 'project' : 'global'} />
                        ) : null}
                    </DialogTitle>
                    <DialogDescription>
                        {t('description')}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label htmlFor="skill-name">{t('formNameLabel')}</Label>
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
                                {t('formOverrideBuiltIn', { name })}
                            </p>
                        ) : (
                            <p className="text-muted-foreground text-mini">
                                {t('formNameHint')}
                            </p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="skill-description">{t('formDescLabel')}</Label>
                        <Input
                            id="skill-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value.slice(0, 200))}
                            placeholder={t('formDescHint')}
                            maxLength={200}
                        />
                        <p className="text-muted-foreground text-mini">
                            {description.length}{t('formDescChars')}
                        </p>
                    </div>

                    {!isEditing && projectId ? (
                        <div className="space-y-2">
                            <Label htmlFor="skill-scope">{t('formScopeLabel')}</Label>
                            <Select
                                value={scope}
                                onValueChange={(v) => setScope(v as SkillFormScope)}
                            >
                                <SelectTrigger id="skill-scope">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="global">
                                        {t('formScopeGlobal')}
                                    </SelectItem>
                                    <SelectItem value="project">{t('formScopeProject')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    ) : null}

                    <div className="space-y-2">
                        <Label htmlFor="skill-content">{t('formBodyLabel')}</Label>
                        <Textarea
                            id="skill-content"
                            value={content}
                            onChange={(e) => setContent(e.target.value.slice(0, 50_000))}
                            placeholder={`# When to use\n\nDescribe the trigger — "Use this skill when the user asks to ..."\n\n# Rules\n\n- ...`}
                            rows={16}
                            className={cn('text-mini font-mono')}
                        />
                        <p className="text-muted-foreground text-mini">
                            {content.length}{t('formBodyHint')}
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        {t('formCancel')}
                    </Button>
                    <Button onClick={() => void submit()} disabled={!canSubmit}>
                        {isSaving ? t('formSaving') : isEditing ? t('formSave') : t('formCreate')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
