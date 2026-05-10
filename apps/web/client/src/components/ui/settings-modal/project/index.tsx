import { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';

import { DefaultSettings } from '@weblab/constants';
import { toDbProjectSettings } from '@weblab/db';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { Separator } from '@weblab/ui/separator';
import { toast } from '@weblab/ui/sonner';
import { Switch } from '@weblab/ui/switch';

import type { CachedProjectRecord } from '@/services/offline/project-cache';
import { useEditorEngine } from '@/components/store/editor';
import {
    cacheProject,
    evictCachedProject,
    getCachedProject,
    precacheNavigationUrls,
    requestPersistentStorage,
} from '@/services/offline/project-cache';
import { api } from '@/trpc/react';

function formatRelative(ms: number): string {
    const diff = Date.now() - ms;
    if (diff < 60_000) return 'just now';
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

export const ProjectTab = observer(() => {
    const editorEngine = useEditorEngine();
    const utils = api.useUtils();
    const { data: project } = api.project.get.useQuery({ projectId: editorEngine.projectId });
    const { mutateAsync: updateProject } = api.project.update.useMutation();
    const { data: projectSettings } = api.settings.get.useQuery({
        projectId: editorEngine.projectId,
    });
    const { mutateAsync: updateProjectSettings } = api.settings.upsert.useMutation();
    const { data: branches } = api.branch.getByProjectId.useQuery({
        projectId: editorEngine.projectId,
    });
    const { data: isPinnedOffline, refetch: refetchPinned } = api.project.offline.isPinned.useQuery(
        { projectId: editorEngine.projectId },
    );
    const { mutateAsync: pinOffline, isPending: pinningOffline } =
        api.project.offline.pin.useMutation();
    const { mutateAsync: unpinOffline, isPending: unpinningOffline } =
        api.project.offline.unpin.useMutation();
    const offlineBusy = pinningOffline || unpinningOffline;
    const [cachedRecord, setCachedRecord] = useState<CachedProjectRecord | null>(null);
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            const rec = await getCachedProject(editorEngine.projectId);
            if (!cancelled) setCachedRecord(rec);
        };
        void load();
        const interval = setInterval(load, 5_000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [editorEngine.projectId, isPinnedOffline]);

    const handleToggleOffline = async (next: boolean) => {
        try {
            if (next) {
                await pinOffline({ projectId: editorEngine.projectId });
                if (project) {
                    // Refresh the IndexedDB cache so the editor can boot offline immediately.
                    await cacheProject(project, branches ?? []);
                }
                await requestPersistentStorage();
                // Seed the service worker's navigation cache with this
                // project's URL so the first offline visit doesn't fall
                // through to /offline. Safe no-op if SW isn't installed.
                await precacheNavigationUrls([`/project/${editorEngine.projectId}`, '/projects']);
                toast.success('Project marked as available offline.');
            } else {
                await unpinOffline({ projectId: editorEngine.projectId });
                await evictCachedProject(editorEngine.projectId);
                toast.success('Project removed from offline access.');
            }
            await refetchPinned();
        } catch (error) {
            console.error('Failed to toggle offline pin:', error);
            toast.error('Could not update offline availability.');
        }
    };

    const installCommand = projectSettings?.commands?.install ?? DefaultSettings.COMMANDS.install;
    const runCommand = projectSettings?.commands?.run ?? DefaultSettings.COMMANDS.run;
    const buildCommand = projectSettings?.commands?.build ?? DefaultSettings.COMMANDS.build;
    const name = project?.name ?? '';

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
        setIsSaving(true);
        try {
            // Update project name if changed
            if (formData.name !== name) {
                await updateProject({
                    id: editorEngine.projectId,
                    name: formData.name,
                });
                // Invalidate queries to refresh UI
                await Promise.all([
                    utils.project.list.invalidate(),
                    utils.project.get.invalidate({ projectId: editorEngine.projectId }),
                ]);
            }

            // Update commands if any changed
            if (
                formData.install !== installCommand ||
                formData.run !== runCommand ||
                formData.build !== buildCommand
            ) {
                await updateProjectSettings({
                    projectId: editorEngine.projectId,
                    settings: toDbProjectSettings(editorEngine.projectId, {
                        commands: {
                            install: formData.install,
                            run: formData.run,
                            build: formData.build,
                        },
                    }),
                });
            }

            toast.success('Project settings updated successfully.');
        } catch (error) {
            console.error('Failed to update project settings:', error);
            toast.error('Failed to update project settings. Please try again.');
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
                    <h2 className="text-largePlus">Metadata</h2>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <p className="text-muted-foreground">Name</p>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) => updateField('name', e.target.value)}
                                className="w-2/3"
                                disabled={isSaving}
                            />
                        </div>
                    </div>
                </div>
                <Separator />

                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <h2 className="text-largePlus">Offline</h2>
                        <p className="text-small text-foreground-secondary">
                            Cache this project so you can open and edit it without a network
                            connection. Edits queue locally and sync when you reconnect.
                        </p>
                    </div>
                    <div className="flex items-center justify-between">
                        <p className="text-muted-foreground">Available offline</p>
                        <Switch
                            checked={!!isPinnedOffline}
                            disabled={offlineBusy}
                            onCheckedChange={(checked) => {
                                void handleToggleOffline(checked);
                            }}
                        />
                    </div>
                    <div className="text-mini flex items-center justify-between">
                        <p className="text-muted-foreground">Last cached</p>
                        <p className="text-foreground-secondary">
                            {cachedRecord
                                ? formatRelative(cachedRecord.cachedAt)
                                : 'Not yet cached'}
                        </p>
                    </div>
                    <div className="text-mini flex items-center justify-between">
                        <p className="text-muted-foreground">Frames cached</p>
                        <p className="text-foreground-secondary">
                            {cachedRecord?.frames?.length
                                ? `${cachedRecord.frames.length} frame${cachedRecord.frames.length === 1 ? '' : 's'}`
                                : 'No canvas snapshot yet'}
                        </p>
                    </div>
                </div>
                <Separator />

                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <h2 className="text-largePlus">Commands</h2>
                        <p className="text-small text-foreground-secondary">
                            {"Only update these if you know what you're doing!"}
                        </p>
                    </div>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <p className="text-muted-foreground">Install</p>
                            <Input
                                id="install"
                                value={formData.install}
                                onChange={(e) => updateField('install', e.target.value)}
                                className="w-2/3"
                                disabled={isSaving}
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <p className="text-muted-foreground">Run</p>
                            <Input
                                id="run"
                                value={formData.run}
                                onChange={(e) => updateField('run', e.target.value)}
                                className="w-2/3"
                                disabled={isSaving}
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <p className="text-muted-foreground">Build</p>
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
                        <span>Discard changes</span>
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
                        <span>{isSaving ? 'Saving...' : 'Save changes'}</span>
                    </Button>
                </div>
            </div>
        </div>
    );
});
