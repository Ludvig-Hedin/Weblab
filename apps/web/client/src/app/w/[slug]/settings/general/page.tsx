'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { WorkspaceKind } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';

import { api } from '@/trpc/react';
import { useActiveWorkspace } from '../../_components/workspace-context';

export default function WorkspaceGeneralPage() {
    const workspace = useActiveWorkspace();
    const router = useRouter();
    const utils = api.useUtils();
    const { data: caps } = api.user.capabilities.useQuery({ workspaceId: workspace.id });
    const canUpdate = caps?.includes('workspace.update') ?? false;
    const canDelete = caps?.includes('workspace.delete') ?? false;

    const [name, setName] = useState(workspace.name);
    const [confirmDelete, setConfirmDelete] = useState('');

    const updateMutation = api.workspace.update.useMutation({
        onSuccess: async () => {
            toast.success('Workspace updated');
            await utils.workspace.list.invalidate();
            await utils.workspace.getBySlug.invalidate({ slug: workspace.slug });
            router.refresh();
        },
        onError: (err) => toast.error(err.message),
    });

    const deleteMutation = api.workspace.delete.useMutation({
        onSuccess: () => {
            toast.success('Workspace deleted');
            router.push('/projects');
        },
        onError: (err) => toast.error(err.message),
    });

    const leaveMutation = api.workspace.leave.useMutation({
        onSuccess: async () => {
            toast.success('Left workspace');
            await utils.workspace.list.invalidate();
            router.push('/projects');
        },
        onError: (err) => toast.error(err.message),
    });

    const isPersonal = workspace.kind === WorkspaceKind.PERSONAL;

    return (
        <div className="flex max-w-xl flex-col gap-8">
            <header>
                <h1 className="text-foreground text-xl font-medium">General settings</h1>
                <p className="text-foreground-tertiary mt-1 text-sm">
                    Manage how {workspace.name} appears across the dashboard.
                </p>
            </header>

            <section className="flex flex-col gap-3">
                <Label htmlFor="ws-name">Workspace name</Label>
                <Input
                    id="ws-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={!canUpdate}
                />
                <div>
                    <Button
                        variant="default"
                        size="compact"
                        disabled={
                            !canUpdate || name.trim() === workspace.name || updateMutation.isPending
                        }
                        onClick={() =>
                            updateMutation.mutate({
                                workspaceId: workspace.id,
                                name: name.trim(),
                            })
                        }
                    >
                        {updateMutation.isPending ? 'Saving…' : 'Save changes'}
                    </Button>
                </div>
            </section>

            {!isPersonal && (
                <section className="border-border bg-background-secondary/40 flex flex-col gap-3 rounded-md border p-4">
                    <div>
                        <h2 className="text-foreground text-sm font-medium">Leave workspace</h2>
                        <p className="text-foreground-tertiary mt-1 text-xs">
                            Remove yourself from {workspace.name}. If you are the only owner,
                            transfer ownership first.
                        </p>
                    </div>
                    <div>
                        <Button
                            variant="outline"
                            size="compact"
                            disabled={leaveMutation.isPending}
                            onClick={() => {
                                if (
                                    window.confirm(
                                        `Leave ${workspace.name}? You will lose access to its projects unless invited back.`,
                                    )
                                ) {
                                    leaveMutation.mutate({ workspaceId: workspace.id });
                                }
                            }}
                        >
                            {leaveMutation.isPending ? 'Leaving…' : 'Leave workspace'}
                        </Button>
                    </div>
                </section>
            )}

            {!isPersonal && canDelete && (
                <section className="border-destructive/40 flex flex-col gap-3 rounded-md border p-4">
                    <div>
                        <h2 className="text-destructive text-sm font-medium">Delete workspace</h2>
                        <p className="text-foreground-tertiary mt-1 text-xs">
                            This permanently removes the workspace, its members, and pending
                            invites. Projects must be moved or deleted first.
                        </p>
                    </div>
                    <Label htmlFor="ws-delete-confirm" className="text-xs">
                        Type <span className="font-medium">{workspace.slug}</span> to confirm
                    </Label>
                    <Input
                        id="ws-delete-confirm"
                        value={confirmDelete}
                        onChange={(e) => setConfirmDelete(e.target.value)}
                        placeholder={workspace.slug}
                    />
                    <div>
                        <Button
                            variant="destructive"
                            size="compact"
                            disabled={confirmDelete !== workspace.slug || deleteMutation.isPending}
                            onClick={() => deleteMutation.mutate({ workspaceId: workspace.id })}
                        >
                            {deleteMutation.isPending ? 'Deleting…' : 'Delete workspace'}
                        </Button>
                    </div>
                </section>
            )}
        </div>
    );
}
