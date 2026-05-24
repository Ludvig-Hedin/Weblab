'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';

import { APP_NAME } from '@weblab/constants';
import { Button } from '@weblab/ui/button';

interface WorkspaceInvitationMainProps {
    id: string;
    token: string | null;
}

export function WorkspaceInvitationMain({ id: _id, token }: WorkspaceInvitationMainProps) {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [isAccepting, setIsAccepting] = useState(false);

    // Convex workspace invitations are looked up by token (the original
    // workspaceInvitation.getWithoutToken by id is not yet ported); the URL
    // already provides the token so we can switch lookups without changing
    // the page contract.
    const invitation = useQuery(api.workspaces.inviteGetByToken, token ? { token } : 'skip');
    const isLoading = token ? invitation === undefined : false;

    const workspace =
        invitation && 'workspace' in invitation && invitation.workspace
            ? (invitation.workspace as { id: string; slug: string; name: string })
            : null;

    const acceptMutation = useMutation(api.workspaces.inviteAccept);

    const handleAccept = async () => {
        if (!token) return;
        setIsAccepting(true);
        setError(null);
        try {
            await acceptMutation({ token });
            toast.success(`Joined ${workspace?.name ?? 'workspace'}`);
            // Land directly in the workspace the user just joined. Falls back
            // to /projects (which redirects to first available workspace) if
            // the relation wasn't loaded for some reason.
            router.push(workspace ? `/w/${workspace.slug}/projects` : '/projects');
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsAccepting(false);
        }
    };

    if (isLoading) {
        return <CenteredCard>Loading…</CenteredCard>;
    }
    if (!token) {
        return <CenteredCard>Invitation link is missing its token.</CenteredCard>;
    }
    if (!invitation) {
        return <CenteredCard>Invitation not found.</CenteredCard>;
    }

    const workspaceName = workspace?.name ?? 'a workspace';

    return (
        <CenteredCard>
            <h1 className="text-foreground text-xl font-medium">
                Join {workspaceName} on {APP_NAME}
            </h1>
            <p className="text-foreground-tertiary text-sm">
                You have been invited to join <strong>{workspaceName}</strong> as{' '}
                <strong>{invitation.role}</strong>.
            </p>
            <p className="text-foreground-tertiary text-xs">
                You will see workspace projects shared with members. You will not see other
                workspaces.
            </p>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <div className="flex gap-2">
                <Button onClick={() => void handleAccept()} disabled={isAccepting}>
                    {isAccepting ? 'Accepting…' : 'Accept invitation'}
                </Button>
                <Button variant="ghost" onClick={() => router.push('/projects')}>
                    Decline
                </Button>
            </div>
        </CenteredCard>
    );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex min-h-screen w-screen items-center justify-center p-6">
            <div className="border-border bg-background-secondary/30 flex w-full max-w-md flex-col gap-4 rounded-md border p-6">
                {children}
            </div>
        </div>
    );
}
