'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useAction, useQuery } from 'convex/react';
import { Code2, Loader2 } from 'lucide-react';

import type { EmitPage } from '@weblab/wireframe-blocks';
import { getNextJsScaffoldFiles, WEBLAB_NEXTJS_GLOBALS_CSS } from '@weblab/code-provider';
import { Button } from '@weblab/ui/button';
import {
    asStyleGuideTokens,
    buildEmitFiles,
    mergeEmitDeps,
    styleGuideToGlobalsAppend,
} from '@weblab/wireframe-blocks';

import type { FullDoc, ProjectId } from './types';
import type { Id } from '@convex/_generated/dataModel';

// Desktop (Electron) local-FS bridge surface — present only in the desktop app.
interface LocalFsBridge {
    write(
        root: string,
        path: string,
        content: string,
    ): Promise<{ success?: boolean; error?: string }>;
}
interface LocalDevBridge {
    run(
        root: string,
        command: string,
    ): Promise<{ output?: string; exitCode?: number; error?: string }>;
}
function getNative(): { localfs?: LocalFsBridge; localdev?: LocalDevBridge } | undefined {
    if (typeof window === 'undefined') return undefined;
    return (
        window as unknown as {
            weblabNative?: { localfs?: LocalFsBridge; localdev?: LocalDevBridge };
        }
    ).weblabNative;
}

function toEmitPages(full: FullDoc): EmitPage[] {
    return [...full.wireframePages]
        .sort((a, b) => a.order - b.order)
        .map((page) => ({
            slug: page.slug,
            title: page.title,
            sections: full.wireframeSections
                .filter((s) => s.wireframePageId === page._id)
                .sort((a, b) => a.order - b.order)
                .map((s) => ({ blockId: s.blockId, content: s.content as unknown })),
        }));
}

function emitFilesFor(full: FullDoc) {
    const active =
        full.styleGuides.find((g) => g._id === full.doc.activeStyleGuideId) ??
        full.styleGuides.find((g) => g.isActive) ??
        null;
    const globalsCss =
        WEBLAB_NEXTJS_GLOBALS_CSS +
        styleGuideToGlobalsAppend(asStyleGuideTokens(active?.tokens ?? null));
    const files = buildEmitFiles(toEmitPages(full), { globalsCss });
    const basePkg =
        getNextJsScaffoldFiles().find((f) => f.path === 'package.json')?.content ?? '{}';
    files.push({ path: 'package.json', content: mergeEmitDeps(basePkg) });
    return files;
}

export function EmitButton({ full, projectId }: { full: FullDoc; projectId: ProjectId }) {
    const emitToCloud = useAction(api.wireframeEmit.emitToCloud);
    const project = useQuery(api.projects.get, { projectId });
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const runtime = project?.runtimeMetadata as { local?: { rootPath?: string } } | undefined;
    const localRoot = project?.storageMode === 'local' ? runtime?.local?.rootPath : undefined;

    async function emitLocal(rootPath: string) {
        const native = getNative();
        if (!native?.localfs || !native?.localdev) {
            throw new Error('Local export requires the Weblab desktop app.');
        }
        const files = emitFilesFor(full);
        for (const file of files) {
            const res = await native.localfs.write(rootPath, file.path, file.content);
            if (res.error) throw new Error(`Failed to write ${file.path}: ${res.error}`);
        }
        const install = await native.localdev.run(rootPath, 'bun install');
        if (install.error || (typeof install.exitCode === 'number' && install.exitCode !== 0)) {
            throw new Error(`Dependency install failed: ${install.error ?? install.output ?? ''}`);
        }
        router.push(`/project/${projectId}`);
    }

    async function handleEmit() {
        setError(null);
        setBusy(true);
        try {
            if (localRoot) {
                await emitLocal(localRoot);
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
