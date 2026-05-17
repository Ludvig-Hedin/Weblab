'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@weblab/ui/button';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';

import { api } from '@/trpc/react';

export default function NewWorkspacePage() {
    const router = useRouter();
    const utils = api.useUtils();
    const [name, setName] = useState('');

    const createTeam = api.workspace.createTeam.useMutation({
        onSuccess: async (workspace) => {
            toast.success(`Workspace "${workspace.name}" created`);
            await utils.workspace.list.invalidate();
            router.push(`/w/${workspace.slug}/projects`);
        },
        onError: (err) => toast.error(err.message),
    });

    const trimmed = name.trim();
    const disabled = trimmed.length === 0 || createTeam.isPending;

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
                                createTeam.mutate({ name: trimmed });
                            }
                        }}
                    />
                </div>
                <div className="flex gap-2">
                    <Button
                        disabled={disabled}
                        onClick={() => createTeam.mutate({ name: trimmed })}
                    >
                        {createTeam.isPending ? 'Creating…' : 'Create workspace'}
                    </Button>
                    <Button variant="ghost" onClick={() => router.back()}>
                        Cancel
                    </Button>
                </div>
            </div>
        </div>
    );
}
