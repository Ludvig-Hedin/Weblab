'use client';

import { useMemo, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { observer } from 'mobx-react-lite';

import { EMBEDDED_SKILLS } from '@weblab/ai/client';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@weblab/ui/alert-dialog';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import { toast } from '@weblab/ui/sonner';

import type { SkillRowItem } from './skill-row';
import type { Id } from '@convex/_generated/dataModel';
import { ScopeBadge } from './scope-badge';
import { SkillFormDialog } from './skill-form-dialog';
import { SkillImportDialog } from './skill-import-dialog';
import { SkillRow } from './skill-row';

type ScopeFilter = 'all' | 'global' | 'project';

interface DbSkill {
    id: string;
    userId: string;
    projectId: string | null;
    name: string;
    description: string;
    content: string;
    enabled: boolean;
}

interface ConvexSkill {
    _id: string;
    userId: string;
    projectId?: string;
    name: string;
    description?: string;
    content?: string;
    enabled?: boolean;
}

const EXPLORE_URL = 'https://agentskills.io';

export const SkillsTab = observer(({ projectId }: { projectId?: string }) => {
    const inProject = Boolean(projectId);

    const [scope, setScope] = useState<ScopeFilter>('all');
    const [formOpen, setFormOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [editing, setEditing] = useState<DbSkill | undefined>();
    const [confirmDelete, setConfirmDelete] = useState<SkillRowItem | null>(null);

    const skillsRaw = useQuery(api.skills.list, {
        ...(projectId ? { projectId: projectId as Id<'projects'> } : {}),
        scope: 'all',
    });
    const isLoading = skillsRaw === undefined;
    const dbSkills: DbSkill[] = useMemo(() => {
        return ((skillsRaw ?? []) as ConvexSkill[]).map((s) => ({
            id: s._id,
            userId: s.userId,
            projectId: s.projectId ?? null,
            name: s.name,
            description: s.description ?? '',
            content: s.content ?? '',
            enabled: s.enabled ?? true,
        }));
    }, [skillsRaw]);

    const removeSkillMutation = useMutation(api.skills.remove);

    const builtInNames = useMemo(() => new Set(EMBEDDED_SKILLS.map((s) => s.name)), []);

    const dbByName = useMemo(() => {
        const map = new Map<string, DbSkill>();
        for (const s of dbSkills) {
            map.set(s.name, s);
        }
        return map;
    }, [dbSkills]);

    const rows = useMemo<SkillRowItem[]>(() => {
        const out: SkillRowItem[] = [];
        // Built-ins first (when not filtered out by scope), but only if no
        // user override exists for that name.
        if (scope === 'all') {
            for (const s of EMBEDDED_SKILLS) {
                if (dbByName.has(s.name)) continue;
                out.push({
                    name: s.name,
                    description: s.description,
                    scope: 'built-in',
                });
            }
        }
        for (const s of dbSkills) {
            const isProject = s.projectId !== null;
            const rowScope: SkillRowItem['scope'] = isProject ? 'project' : 'global';
            if (scope === 'global' && rowScope !== 'global') continue;
            if (scope === 'project' && rowScope !== 'project') continue;
            out.push({
                id: s.id,
                name: s.name,
                description: s.description,
                scope: rowScope,
            });
        }
        return out.sort((a, b) => a.name.localeCompare(b.name));
    }, [scope, dbSkills, dbByName]);

    const handleEdit = (row: SkillRowItem) => {
        if (!row.id) return;
        const skill = dbSkills.find((s) => s.id === row.id);
        if (skill) {
            setEditing(skill);
            setFormOpen(true);
        }
    };

    const handleDelete = (row: SkillRowItem) => {
        if (!row.id) return;
        setConfirmDelete(row);
    };

    const confirmDeleteAction = async () => {
        if (!confirmDelete?.id) {
            setConfirmDelete(null);
            return;
        }
        const skillId = confirmDelete.id as Id<'skills'>;
        setConfirmDelete(null);
        try {
            await removeSkillMutation({ skillId });
            toast.success('Skill deleted');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to delete skill');
        }
    };

    return (
        <div className="flex h-full flex-col">
            <div className="space-y-1 px-5 pt-5 pb-3">
                <h2 className="text-largePlus">Skills</h2>
                <p className="text-muted-foreground text-mini">
                    Skills teach the AI how to handle specific tasks. The AI lists them via{' '}
                    <code className="bg-muted text-mini rounded px-1 py-0.5">list_skills</code> and
                    reads the body via{' '}
                    <code className="bg-muted text-mini rounded px-1 py-0.5">read_skill</code>.
                </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
                <Select value={scope} onValueChange={(v) => setScope(v as ScopeFilter)}>
                    <SelectTrigger className="w-44">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All skills</SelectItem>
                        <SelectItem value="global">
                            <span className="flex items-center gap-2">
                                <ScopeBadge scope="global" /> only
                            </span>
                        </SelectItem>
                        {inProject ? (
                            <SelectItem value="project">
                                <span className="flex items-center gap-2">
                                    <ScopeBadge scope="project" /> only
                                </span>
                            </SelectItem>
                        ) : null}
                    </SelectContent>
                </Select>

                <div className="ml-auto flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                        <Icons.Download className="mr-1.5 h-3.5 w-3.5" />
                        Import
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => {
                            setEditing(undefined);
                            setFormOpen(true);
                        }}
                    >
                        <Icons.Plus className="mr-1.5 h-3.5 w-3.5" />
                        New skill
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-5">
                {isLoading ? (
                    <div className="text-muted-foreground text-mini flex items-center gap-2 px-1 py-6">
                        <Icons.LoadingSpinner className="h-3.5 w-3.5 animate-spin" />
                        Loading skills…
                    </div>
                ) : rows.length === 0 ? (
                    <div className="border-border/40 text-muted-foreground text-mini rounded-md border border-dashed p-6 text-center">
                        No skills in this scope yet. Create one or import from the community.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {rows.map((row) => (
                            <SkillRow
                                key={row.id ?? `builtin-${row.name}`}
                                skill={row}
                                onEdit={handleEdit}
                                onDelete={handleDelete}
                            />
                        ))}
                    </div>
                )}
                <div className="text-muted-foreground text-mini mt-4 flex items-center justify-center gap-1.5">
                    <Icons.ExternalLink className="h-3 w-3" />
                    <a
                        href={EXPLORE_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-foreground underline-offset-4 hover:underline"
                    >
                        Explore community skills
                    </a>
                </div>
            </div>

            <SkillFormDialog
                open={formOpen}
                onOpenChange={(open) => {
                    setFormOpen(open);
                    if (!open) setEditing(undefined);
                }}
                projectId={projectId ?? null}
                builtInNames={builtInNames}
                {...(editing
                    ? {
                          initial: {
                              id: editing.id,
                              name: editing.name,
                              description: editing.description,
                              content: editing.content,
                              projectId: editing.projectId,
                          },
                      }
                    : {})}
            />
            <SkillImportDialog
                open={importOpen}
                onOpenChange={setImportOpen}
                projectId={projectId ?? null}
            />

            <AlertDialog
                open={Boolean(confirmDelete)}
                onOpenChange={(open) => !open && setConfirmDelete(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete skill?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirmDelete
                                ? `"${confirmDelete.name}" will be removed for ${
                                      confirmDelete.scope === 'project'
                                          ? 'this project'
                                          : 'all your projects'
                                  }. This can't be undone.`
                                : ''}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => void confirmDeleteAction()}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
});
