'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useMutation } from 'convex/react';
import { toast } from 'sonner';

import { Button } from '@weblab/ui/button';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';

export default function NewWorkspacePage() {
    const router = useRouter();
    const [name, setName] = useState('');
    const [pending, setPending] = useState(false);

    const createTeam = useMutation(api.workspaces.createTeam);

    const trimmed = name.trim();
    const disabled = trimmed.length === 0 || pending;

    const handleCreate = async () => {
        if (!trimmed) return;
        setPending(true);
        try {
            const workspace = await createTeam({ name: trimmed });
            toast.success(`Workspace "${workspace.name}" created`);
            router.push(`/w/${workspace.slug}/projects`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to create workspace');
        } finally {
            setPending(false);
        }
    };

    return (
        <div className="flex min-h-screen w-screen items-center justify-center p-6">
            <div className="border-border bg-background-secondary/30 flex w-full max-w-md flex-col gap-4 rounded-md border p-6">
                <header>
                    <h1 className="text-foreground text-xl font-medium">Create workspace</h1>
                    <p className="text-foreground-tertiary mt-1 text-sm">
                        Workspaces group projects and members. You will become the workspace owner.
                    </p>
                </header>
                <div className="flex flex-col gap-2">
                    <Label htmlFor="ws-name">Workspace name</Label>
                    <Input
                        id="ws-name"
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Acme Studio"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !disabled) {
                                void handleCreate();
                            }
                        }}
                    />
                </div>
                <div className="flex gap-2">
                    <Button disabled={disabled} onClick={() => void handleCreate()}>
                        {pending ? 'Creating…' : 'Create workspace'}
                    </Button>
                    <Button variant="ghost" onClick={() => router.back()}>
                        Cancel
                    </Button>
                </div>
            </div>
        </div>
    );
}
