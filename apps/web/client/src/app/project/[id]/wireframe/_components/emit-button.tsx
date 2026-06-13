'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useAction } from 'convex/react';
import { Code2, Loader2 } from 'lucide-react';

import { Button } from '@weblab/ui/button';

import type { Id } from '@convex/_generated/dataModel';

/** Emits the designed pages to a real Next.js project and opens the editor. */
export function EmitButton({ docId }: { docId: Id<'wireframeDocs'> }) {
    const emit = useAction(api.wireframeEmit.emitToCloud);
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleEmit() {
        setError(null);
        setBusy(true);
        try {
            const { projectId } = await emit({ docId });
            router.push(`/project/${projectId}`);
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
