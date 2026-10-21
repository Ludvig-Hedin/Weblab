'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useAction, useQuery } from 'convex/react';
import { Code2, Loader2 } from 'lucide-react';

import { Button } from '@weblab/ui/button';

import type { FullDoc, ProjectId } from './types';
import type { Id } from '@convex/_generated/dataModel';

export function EmitButton({ full, projectId }: { full: FullDoc; projectId: ProjectId }) {
    const emitToCloud = useAction(api.wireframeEmit.emitToCloud);
    const project = useQuery(api.projects.get, { projectId });
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const runtime = project?.runtimeMetadata as { local?: { rootPath?: string } } | undefined;
    const localRoot = project?.storageMode === 'local' ? runtime?.local?.rootPath : undefined;

    async function handleEmit() {
        setError(null);
        setBusy(true);
        try {
            if (localRoot) {
                throw new Error('Local wireframe export needs safe multi-file writing and is unavailable.');
            } else {
                const { projectId: newId } = await emitToCloud({
                    docId: full.doc._id as Id<'wireframeDocs'>,
                });
                router.push(`/project/${newId}`);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Create code failed.');
            setBusy(false);
        }
    }

    return (
        <div className="flex items-center gap-2">
            {error && (
                <span className="text-destructive max-w-[220px] truncate text-xs">{error}</span>
            )}
            <Button disabled={busy} onClick={() => void handleEmit()}>
                {busy ? <Loader2 className="animate-spin" /> : <Code2 />} Create code
            </Button>
        </div>
    );
}
