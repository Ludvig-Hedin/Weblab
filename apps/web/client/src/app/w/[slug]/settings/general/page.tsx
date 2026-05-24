'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';

import { WorkspaceKind } from '@weblab/models';
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
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';

import type { Id } from '../../../../../../convex/_generated/dataModel';
import { useActiveWorkspace } from '../../_components/workspace-context';

export default function WorkspaceGeneralPage() {
    const workspace = useActiveWorkspace();
    const router = useRouter();
    const workspaceId = workspace.id as Id<'workspaces'>;
    const caps = useQuery(api.users.capabilities, { workspaceId });
    const canUpdate = caps?.includes('workspace.update') ?? false;
    const canDelete = caps?.includes('workspace.delete') ?? false;

    const [name, setName] = useState(workspace.name);
    const [confirmDelete, setConfirmDelete] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isLeaving, setIsLeaving] = useState(false);
    const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);

    const updateWorkspace = useMutation(api.workspaces.update);
    const deleteWorkspace = useMutation(api.workspaces.remove);
    const leaveWorkspace = useMutation(api.workspaces.leave);

    const handleUpdate = async () => {
        setIsUpdating(true);
        try {
            await updateWorkspace({
                workspaceId,
                name: name.trim(),
            });
            toast.success('Workspace updated');
            router.refresh();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to update workspace');
        } finally {
            setIsUpdating(false);
        }
    };

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            await deleteWorkspace({ workspaceId });
            toast.success('Workspace deleted');
            router.push('/projects');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to delete workspace');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleLeave = async () => {
        setIsLeaving(true);
        try {
            await leaveWorkspace({ workspaceId });
            toast.success('Left workspace');
            router.push('/projects');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to leave workspace');
        } finally {
            setIsLeaving(false);
        }
    };

    const isPersonal = workspace.kind === WorkspaceKind.PERSONAL;

    return (
        <div className="flex max-w-xl flex-col gap-8">
            <header>
                <h1 className="text-foreground text-title3 font-medium">General settings</h1>
                <p className="text-foreground-tertiary mt-1 text-small">
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
                            !canUpdate ||
                            name.trim().length === 0 ||
                            name.trim() === workspace.name ||
                            isUpdating
                        }
                        onClick={() => void handleUpdate()}
                    >
                        {isUpdating ? 'Saving…' : 'Save changes'}
                    </Button>
                </div>
            </section>

            {!isPersonal && (
                <section className="border-border bg-background-secondary/40 flex flex-col gap-3 rounded-md border p-4">
                    <div>
                        <h2 className="text-foreground text-smallPlus">Leave workspace</h2>
                        <p className="text-foreground-tertiary mt-1 text-mini">
                            Remove yourself from {workspace.name}. If you are the only owner,
                            transfer ownership first.
                        </p>
                    </div>
                    <div>
                        <Button
                            variant="outline"
                            size="compact"
                            disabled={isLeaving}
                            onClick={() => setLeaveDialogOpen(true)}
                        >
                            {isLeaving ? 'Leaving…' : 'Leave workspace'}
                        </Button>
                    </div>
                </section>
            )}

            {!isPersonal && canDelete && (
                <section className="border-destructive/40 flex flex-col gap-3 rounded-md border p-4">
                    <div>
                        <h2 className="text-destructive text-smallPlus">Delete workspace</h2>
                        <p className="text-foreground-tertiary mt-1 text-mini">
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
                            disabled={confirmDelete !== workspace.slug || isDeleting}
                            onClick={() => void handleDelete()}
                        >
                            {isDeleting ? 'Deleting…' : 'Delete workspace'}
                        </Button>
                    </div>
                </section>
            )}

            <AlertDialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Leave workspace</AlertDialogTitle>
                        <AlertDialogDescription>
                            Leave {workspace.name}? You will lose access to its projects unless
                            invited back.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => void handleLeave()}>
                            Leave
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
