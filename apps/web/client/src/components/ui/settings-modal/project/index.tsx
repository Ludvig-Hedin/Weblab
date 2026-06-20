import { useEffect, useMemo, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import localforage from 'localforage';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import type { PageNode } from '@weblab/models';
import { DefaultSettings } from '@weblab/constants';
import { DeploymentStatus, DeploymentType } from '@weblab/models/hosting';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import { Separator } from '@weblab/ui/separator';
import { toast } from '@weblab/ui/sonner';
import { Switch } from '@weblab/ui/switch';

import type { ProjectFolder } from '@/app/projects/_components/select/project-card-utils';
import type { CachedProjectRecord } from '@/services/offline/project-cache';
import type { Id } from '@convex/_generated/dataModel';
import { CreateFolderDialog } from '@/app/projects/_components/select/create-folder-dialog';
import {
    getFoldersStorageKey,
    moveProjectIdsToFolder,
} from '@/app/projects/_components/select/project-card-utils';
import { useEditorEngine } from '@/components/store/editor';
import {
    cacheProject,
    evictCachedProject,
    getCachedProject,
    precacheNavigationUrls,
    requestPersistentStorage,
} from '@/services/offline/project-cache';

function formatRelative(ms: number, t: (key: string, values?: Record<string, unknown>) => string): string {
    const diff = Date.now() - ms;
    if (diff < 60_000) return t('justNow');
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 60) return t('minutesAgo', { minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('hoursAgo', { hours });
    const days = Math.floor(hours / 24);
    return t('daysAgo', { days });
}

function formatDate(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

// Pages tree is folder/page nodes; count only the leaves that are real pages.
function countPages(nodes: PageNode[]): number {
    let total = 0;
    for (const node of nodes) {
        if (node.kind === 'page') total += 1;
        if (node.children?.length) total += countPages(node.children);
    }
    return total;
}

// A small labelled row used throughout the Overview section.
function OverviewRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <p className="text-muted-foreground">{label}</p>
            <div className="text-foreground-secondary flex min-w-0 items-center gap-1.5">
                {children}
            </div>
        </div>
    );
}

// Sentinel Select values (Radix SelectItem can't use an empty string).
const NO_FOLDER_VALUE = 'none';
const NEW_FOLDER_VALUE = '__new__';

export const ProjectTab = observer(() => {
    const t = useTranslations('settings.project');
    // Loose adapter so plain-string key helpers (e.g. formatRelative) can call t without TS narrowing errors.
    const tStr = (key: string, values?: Record<string, unknown>) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        t(key as Parameters<typeof t>[0], values as any);
    const editorEngine = useEditorEngine();
    const projectId = editorEngine.projectId as Id<'projects'>;

    const project = useQuery(api.projects.get, { projectId });
    const updateProject = useMutation(api.projects.update);
    const deployments = useQuery(api.deployments.list, { projectId, limit: 25 });
    const projectSettings = useQuery(api.projectSettings.get, { projectId });
    const updateProjectSettings = useMutation(api.projectSettings.upsert);
    const branches = useQuery(api.branches.getByProjectId, { projectId });
    const isPinnedOffline = useQuery(api.projectOffline.isPinned, { projectId });
    const pinOffline = useMutation(api.projectOffline.pin);
    const unpinOffline = useMutation(api.projectOffline.unpin);

    const [offlineBusy, setOfflineBusy] = useState(false);
    const [cachedRecord, setCachedRecord] = useState<CachedProjectRecord | null>(null);
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            const rec = await getCachedProject(editorEngine.projectId);
            if (!cancelled) setCachedRecord(rec);
        };
        void load();
        const interval = setInterval(() => void load(), 5_000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [editorEngine.projectId, isPinnedOffline]);

    const handleToggleOffline = async (next: boolean) => {
        setOfflineBusy(true);
        try {
            if (next) {
                await pinOffline({ projectId });
                if (project) {
                    // Refresh the IndexedDB cache so the editor can boot offline immediately.
                    // TODO(convex): adapter for project/branches cache shape may need updating.
                    await cacheProject(
                        project as unknown as Parameters<typeof cacheProject>[0],
                        (branches ?? []) as unknown as Parameters<typeof cacheProject>[1],
                    );
                }
                await requestPersistentStorage();
                // Seed the service worker's navigation cache with this
                // project's URL so the first offline visit doesn't fall
                // through to /offline. Safe no-op if SW isn't installed.
                await precacheNavigationUrls([`/project/${editorEngine.projectId}`, '/projects']);
                toast.success(t('toastOfflineOn'));
            } else {
                await unpinOffline({ projectId });
                await evictCachedProject(editorEngine.projectId);
                toast.success(t('toastOfflineOff'));
            }
        } catch (error) {
            console.error('Failed to toggle offline pin:', error);
            toast.error(t('toastOfflineFailed'));
        } finally {
            setOfflineBusy(false);
        }
    };

    const installCommand = projectSettings?.installCommand ?? DefaultSettings.COMMANDS.install;
    const runCommand = projectSettings?.runCommand ?? DefaultSettings.COMMANDS.run;
    const buildCommand = projectSettings?.buildCommand ?? DefaultSettings.COMMANDS.build;
    const name = project?.name ?? '';

    // Overview — most recent successful publish (preview or custom domain).
    const lastPublishedAt = useMemo(() => {
        const published = (deployments ?? []).find((d) => {
            const type = d.type as DeploymentType;
            return (
                (type === DeploymentType.PREVIEW || type === DeploymentType.CUSTOM) &&
                (d.status as DeploymentStatus) === DeploymentStatus.COMPLETED
            );
        });
        return published?._creationTime ?? null;
    }, [deployments]);
    const pagesCount = countPages(editorEngine.pages.tree ?? []);

    const [copiedId, setCopiedId] = useState(false);
    const copyProjectId = async () => {
        try {
            await navigator.clipboard.writeText(projectId);
            setCopiedId(true);
            setTimeout(() => setCopiedId(false), 1500);
        } catch {
            toast.error(t('toastCopyIdFailed'));
        }
    };

    // ── Folders (shared with the projects dashboard via localforage) ──────────
    const me = useQuery(api.users.me, {});
    const [folders, setFolders] = useState<ProjectFolder[]>([]);
    const [showCreateFolder, setShowCreateFolder] = useState(false);
    const foldersKey = useMemo(() => getFoldersStorageKey(me?._id), [me?._id]);

    useEffect(() => {
        void (async () => {
            try {
                const saved = await localforage.getItem<ProjectFolder[]>(foldersKey);
                setFolders(Array.isArray(saved) ? saved : []);
            } catch (error) {
                console.error('Failed to load folders:', error);
            }
        })();
    }, [foldersKey]);

    const currentFolderId = folders.find((f) => f.projectIds.includes(projectId))?.id ?? null;

    const persistFolders = async (next: ProjectFolder[]) => {
        const previous = folders;
        setFolders(next);
        try {
            await localforage.setItem(foldersKey, next);
        } catch (error) {
            console.error('Failed to save folders:', error);
            setFolders(previous);
            toast.error(t('toastFolderFailed'));
        }
    };

    const handleFolderChange = async (value: string) => {
        if (value === NEW_FOLDER_VALUE) {
            setShowCreateFolder(true);
            return;
        }
        const folderId = value === NO_FOLDER_VALUE ? null : value;
        await persistFolders(moveProjectIdsToFolder(folders, [projectId], folderId));
        toast.success(folderId ? t('toastFolderMoved') : t('toastFolderRemoved'));
    };

    const handleCreateFolder = async (name: string) => {
        const cleared = moveProjectIdsToFolder(folders, [projectId], null);
        const folder: ProjectFolder = {
            id: crypto.randomUUID(),
            name,
            projectIds: [projectId],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        await persistFolders([...cleared, folder]);
        toast.success(t('toastFolderCreated'));
    };

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        install: '',
        run: '',
        build: '',
    });
    const [isSaving, setIsSaving] = useState(false);

    // Initialize and sync form data
    useEffect(() => {
        setFormData({
            name,
            install: installCommand,
            run: runCommand,
            build: buildCommand,
        });
    }, [name, installCommand, runCommand, buildCommand]);

    // Check if form has changes
    const isDirty = useMemo(() => {
        return (
            formData.name !== name ||
            formData.install !== installCommand ||
            formData.run !== runCommand ||
            formData.build !== buildCommand
        );
    }, [formData, name, installCommand, runCommand, buildCommand]);

    const handleSave = async () => {
        // The backend trims + rejects an empty name with a BAD_REQUEST that
        // surfaces here only as a generic "save failed" toast, and a
        // leading/trailing-space name leaves the form perpetually dirty
        // (formData.name !== the saved, trimmed name). Validate + normalize
        // client-side first.
        const trimmedName = formData.name.trim();
        if (trimmedName.length === 0) {
            toast.error('Project name cannot be empty');
            return;
        }
        setIsSaving(true);
        try {
            // Update project name if changed
            if (trimmedName !== name) {
                await updateProject({
                    projectId,
                    name: trimmedName,
                });
            }
            // Reflect the trimmed value so a space-only edit doesn't keep the
            // form in a dirty state with nothing left to save.
            if (trimmedName !== formData.name) {
                setFormData((prev) => ({ ...prev, name: trimmedName }));
            }

            // Update commands if any changed
            if (
                formData.install !== installCommand ||
                formData.run !== runCommand ||
                formData.build !== buildCommand
            ) {
                await updateProjectSettings({
                    projectId,
                    installCommand: formData.install,
                    runCommand: formData.run,
                    buildCommand: formData.build,
                });
            }

            toast.success(t('toastSaveSuccess'));
        } catch (error) {
            console.error('Failed to update project settings:', error);
            toast.error(t('toastSaveFailed'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleDiscard = () => {
        setFormData({
            name,
            install: installCommand,
            run: runCommand,
            build: buildCommand,
        });
    };

    const updateField = (field: keyof typeof formData, value: string) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    return (
        <div className="text-regular flex h-full flex-col">
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6 pb-24">
                <div className="flex flex-col gap-4">
                    <h2 className="text-largePlus">{t('overviewTitle')}</h2>
                    <div className="space-y-3">
                        <OverviewRow label={t('siteIdLabel')}>
                            <code className="text-mini truncate font-mono">{projectId}</code>
                            <Button
                                variant="ghost"
                                size="icon-xs"
                                type="button"
                                aria-label={t('copyId')}
                                onClick={() => void copyProjectId()}
                            >
                                {copiedId ? (
                                    <Icons.Check className="h-3.5 w-3.5" />
                                ) : (
                                    <Icons.Copy className="h-3.5 w-3.5" />
                                )}
                            </Button>
                        </OverviewRow>
                        <OverviewRow label={t('pagesLabel')}>
                            <span>{editorEngine.pages.isScanning ? '—' : pagesCount}</span>
                        </OverviewRow>
                        <OverviewRow label={t('lastPublished')}>
                            <span>
                                {lastPublishedAt ? formatRelative(lastPublishedAt, tStr) : t('never')}
                            </span>
                        </OverviewRow>
                        <OverviewRow label={t('lastUpdated')}>
                            <span>
                                {project?.updatedAt ? formatRelative(project.updatedAt, tStr) : '—'}
                            </span>
                        </OverviewRow>
                        <OverviewRow label={t('created')}>
                            <span>
                                {project?._creationTime ? formatDate(project._creationTime) : '—'}
                            </span>
                        </OverviewRow>
                    </div>
                </div>
                <Separator />

                <div className="flex flex-col gap-4">
                    <h2 className="text-largePlus">{t('metadataTitle')}</h2>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <p className="text-muted-foreground">{t('nameLabel')}</p>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) => updateField('name', e.target.value)}
                                className="w-2/3"
                                disabled={isSaving}
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <p className="text-muted-foreground">{t('folderLabel')}</p>
                            <Select
                                value={currentFolderId ?? NO_FOLDER_VALUE}
                                onValueChange={(v) => void handleFolderChange(v)}
                            >
                                <SelectTrigger className="w-2/3">
                                    <SelectValue placeholder={t('noFolder')} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NO_FOLDER_VALUE}>{t('noFolder')}</SelectItem>
                                    {folders.map((folder) => (
                                        <SelectItem key={folder.id} value={folder.id}>
                                            {folder.name}
                                        </SelectItem>
                                    ))}
                                    <SelectItem value={NEW_FOLDER_VALUE}>{t('newFolder')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
                <Separator />

                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <h2 className="text-largePlus">{t('offlineTitle')}</h2>
                        <p className="text-small text-foreground-secondary">
                            {t('offlineDesc')}
                        </p>
                    </div>
                    <div className="flex items-center justify-between">
                        <p className="text-muted-foreground">{t('availableOffline')}</p>
                        <Switch
                            checked={!!isPinnedOffline}
                            disabled={offlineBusy}
                            onCheckedChange={(checked) => {
                                void handleToggleOffline(checked);
                            }}
                        />
                    </div>
                    <div className="text-mini flex items-center justify-between">
                        <p className="text-muted-foreground">{t('lastCached')}</p>
                        <p className="text-foreground-secondary">
                            {cachedRecord
                                ? formatRelative(cachedRecord.cachedAt, tStr)
                                : t('notYetCached')}
                        </p>
                    </div>
                    <div className="text-mini flex items-center justify-between">
                        <p className="text-muted-foreground">{t('framesCached')}</p>
                        <p className="text-foreground-secondary">
                            {cachedRecord?.frames?.length
                                ? t('framesCount', { count: cachedRecord.frames.length })
                                : t('noSnapshot')}
                        </p>
                    </div>
                </div>
                <Separator />

                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <h2 className="text-largePlus">{t('commandsTitle')}</h2>
                        <p className="text-small text-foreground-secondary">
                            {t('commandsWarning')}
                        </p>
                    </div>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <p className="text-muted-foreground">{t('installLabel')}</p>
                            <Input
                                id="install"
                                value={formData.install}
                                onChange={(e) => updateField('install', e.target.value)}
                                className="w-2/3"
                                disabled={isSaving}
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <p className="text-muted-foreground">{t('runLabel')}</p>
                            <Input
                                id="run"
                                value={formData.run}
                                onChange={(e) => updateField('run', e.target.value)}
                                className="w-2/3"
                                disabled={isSaving}
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <p className="text-muted-foreground">{t('buildLabel')}</p>
                            <Input
                                id="build"
                                value={formData.build}
                                onChange={(e) => updateField('build', e.target.value)}
                                className="w-2/3"
                                disabled={isSaving}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Save/Discard buttons matching site tab pattern */}
            <div
                className="bg-background border-border/50 sticky bottom-0 border-t p-6"
                style={{ borderTopWidth: '0.5px' }}
            >
                <div className="flex justify-end gap-4">
                    <Button
                        variant="outline"
                        className="bg-background border-border/50 flex items-center gap-2 border px-4 py-2"
                        type="button"
                        onClick={handleDiscard}
                        disabled={!isDirty || isSaving}
                    >
                        <span>{t('discardChanges')}</span>
                    </Button>
                    <Button
                        variant="secondary"
                        className="flex items-center gap-2 px-4 py-2"
                        type="button"
                        onClick={() => {
                            void handleSave();
                        }}
                        disabled={!isDirty || isSaving}
                    >
                        {isSaving && <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />}
                        <span>{isSaving ? t('saving') : t('saveChanges')}</span>
                    </Button>
                </div>
            </div>
            <CreateFolderDialog
                open={showCreateFolder}
                onOpenChange={setShowCreateFolder}
                onCreateFolder={handleCreateFolder}
                existingNames={folders.map((f) => f.name)}
            />
        </div>
    );
});
