'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useAction, useQuery } from 'convex/react';
import localforage from 'localforage';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

import type { CreateRequestContext, ImageMessageContext } from '@weblab/models';
import { createDefaultProject } from '@weblab/db';
import { getFrameworkAdapter } from '@weblab/framework';
import { CloneOutputFramework, CreateRequestContextType } from '@weblab/models';

import { useAuthContext } from '@/app/auth/auth-context';
import { api as trpcApi } from '@/trpc/react';
import { LocalForageKeys, Routes } from '@/utils/constants';

export type CloneWebsitePhase =
    | 'idle'
    | 'forking-sandbox'
    | 'scraping-url'
    | 'creating-project'
    | 'opening-editor';

interface CloneFromUrlInput {
    url: string;
    notes?: string;
    framework: CloneOutputFramework;
}

interface CloneFromScreenshotInput {
    screenshot: ImageMessageContext;
    notes?: string;
    framework: CloneOutputFramework;
}

function adapterIdFor(framework: CloneOutputFramework): 'nextjs' | 'static-html' {
    return framework === CloneOutputFramework.STATIC_HTML ? 'static-html' : 'nextjs';
}

function buildCloneProjectName(source: string): string {
    const trimmed = source
        .trim()
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '');
    if (!trimmed) {
        return 'Cloned site';
    }
    const host = trimmed.split('/')[0] ?? trimmed;
    return `Clone · ${host.slice(0, 48)}`;
}

export function useCloneWebsite() {
    const user = useQuery(api.users.me);
    // TODO(convex): sandbox.fork, sandbox.deleteOrphan, project.create not yet ported.
    // Keep tRPC for those until they exist as Convex actions/mutations.
    const { mutateAsync: forkSandbox } = trpcApi.sandbox.fork.useMutation();
    const { mutateAsync: createProject } = trpcApi.project.create.useMutation();
    const { mutateAsync: deleteOrphanSandbox } = trpcApi.sandbox.deleteOrphan.useMutation();
    const scrapeUrl = useAction(api.utils.scrapeUrl);
    const { setIsAuthModalOpen } = useAuthContext();
    const router = useRouter();
    const [phase, setPhase] = useState<CloneWebsitePhase>('idle');
    const isCloning = phase !== 'idle';

    const requireAuth = async () => {
        if (user?._id) return true;
        await localforage.setItem(LocalForageKeys.RETURN_URL, window.location.pathname);
        setIsAuthModalOpen(true);
        return false;
    };

    const forkTemplate = async (framework: CloneOutputFramework, label: string) => {
        const adapter = getFrameworkAdapter(adapterIdFor(framework));
        return await forkSandbox({
            sandbox: {
                id: adapter.template.codesandboxId,
                port: adapter.template.port,
            },
            provider: adapter.id === 'nextjs' ? undefined : 'code_sandbox',
            config: {
                title: label,
                tags: ['clone', framework],
            },
        });
    };

    const createProjectFromContext = async ({
        sandboxId,
        previewUrl,
        sandboxRuntime,
        framework,
        name,
        context,
    }: {
        sandboxId: string;
        previewUrl: string;
        sandboxRuntime?: {
            provider: 'code_sandbox' | 'vercel_sandbox';
            snapshotId?: string;
            port?: number;
            devCommand?: string;
            runtime?: string;
        };
        framework: CloneOutputFramework;
        name: string;
        context: CreateRequestContext[];
    }) => {
        const project = createDefaultProject({
            overrides: {
                name,
                tags: ['clone'],
                runtimeMetadata: { framework },
            },
        });
        return await createProject({
            project,
            sandboxId,
            sandboxUrl: previewUrl,
            sandboxRuntime,
            creationData: { context },
        });
    };

    const cleanupOrphan = async (sandboxId: string | null) => {
        if (!sandboxId) return;
        await deleteOrphanSandbox({ sandboxId }).catch((err: any) => {
            console.warn('[useCloneWebsite] failed to clean up orphan sandbox', {
                sandboxId,
                error: err instanceof Error ? err.message : String(err),
            });
        });
    };

    const cloneFromUrl = async ({ url, notes, framework }: CloneFromUrlInput) => {
        if (isCloning) return;
        if (!(await requireAuth())) return;

        let forkedSandboxId: string | null = null;
        try {
            // Scrape FIRST so we fail fast on a bad URL or a Firecrawl error
            // before paying for a sandbox fork.
            setPhase('scraping-url');
            const scrape = await scrapeUrl({
                url,
                formats: ['markdown', 'branding', 'screenshot'],
                onlyMainContent: true,
            });
            if (scrape.error || (!scrape.result && !scrape.screenshotBase64)) {
                throw new Error(
                    scrape.error ??
                        'Could not extract any content from this URL. Try a different page or use the screenshot tab.',
                );
            }
            // Server-side CDN download of the screenshot is best-effort and
            // can silently fail (timeout, 4xx, etc.) leaving us with a CDN
            // URL but no inlined bytes. The clone flow only consumes the
            // base64 path, so flag the degradation explicitly instead of
            // shipping a clone with no visual reference.
            if (scrape.screenshotUrl && !scrape.screenshotBase64) {
                console.warn(
                    '[useCloneWebsite] screenshot URL returned but inline bytes missing — clone will proceed without screenshot context',
                    { screenshotUrl: scrape.screenshotUrl },
                );
            }

            setPhase('forking-sandbox');
            const { sandboxId, previewUrl, sandboxRuntime } = await forkTemplate(
                framework,
                `Clone of ${url}`,
            );
            forkedSandboxId = sandboxId;

            setPhase('creating-project');
            const context: CreateRequestContext[] = [
                {
                    type: CreateRequestContextType.WEBSITE_URL,
                    content: url,
                    framework,
                },
            ];
            if (scrape.result) {
                context.push({
                    type: CreateRequestContextType.WEBSITE_SCRAPE,
                    content: scrape.result,
                });
            }
            if (scrape.screenshotBase64) {
                context.push({
                    type: CreateRequestContextType.IMAGE,
                    content: scrape.screenshotBase64,
                    mimeType: scrape.screenshotMimeType ?? 'image/png',
                });
            }
            if (notes && notes.trim().length > 0) {
                context.push({
                    type: CreateRequestContextType.PROMPT,
                    content: notes.trim(),
                });
            }

            const newProject = await createProjectFromContext({
                sandboxId,
                previewUrl,
                sandboxRuntime,
                framework,
                name: buildCloneProjectName(url),
                context,
            });
            forkedSandboxId = null;

            if (newProject) {
                setPhase('opening-editor');
                router.push(`${Routes.PROJECT}/${newProject.id}`);
                return newProject;
            }
            setPhase('idle');
        } catch (error: unknown) {
            await cleanupOrphan(forkedSandboxId);
            console.error('Error cloning website from URL:', error);
            const description = error instanceof Error ? error.message : String(error);
            toast.error('Failed to clone website', { description });
            setPhase('idle');
            throw error;
        }
    };

    const cloneFromScreenshot = async ({
        screenshot,
        notes,
        framework,
    }: CloneFromScreenshotInput) => {
        if (isCloning) return;
        if (!(await requireAuth())) return;

        let forkedSandboxId: string | null = null;
        try {
            setPhase('forking-sandbox');
            const { sandboxId, previewUrl, sandboxRuntime } = await forkTemplate(
                framework,
                'Clone from screenshot',
            );
            forkedSandboxId = sandboxId;

            setPhase('creating-project');
            const context: CreateRequestContext[] = [
                {
                    type: CreateRequestContextType.WEBSITE_URL,
                    content: '',
                    framework,
                },
                {
                    type: CreateRequestContextType.IMAGE,
                    content: screenshot.content,
                    mimeType: screenshot.mimeType,
                },
            ];
            if (notes && notes.trim().length > 0) {
                context.push({
                    type: CreateRequestContextType.PROMPT,
                    content: notes.trim(),
                });
            }

            const name = `Clone · ${screenshot.displayName ?? 'screenshot'}-${uuidv4().slice(0, 4)}`;
            const newProject = await createProjectFromContext({
                sandboxId,
                previewUrl,
                sandboxRuntime,
                framework,
                name,
                context,
            });
            forkedSandboxId = null;

            if (newProject) {
                setPhase('opening-editor');
                router.push(`${Routes.PROJECT}/${newProject.id}`);
                return newProject;
            }
            setPhase('idle');
        } catch (error: unknown) {
            await cleanupOrphan(forkedSandboxId);
            console.error('Error cloning website from screenshot:', error);
            const description = error instanceof Error ? error.message : String(error);
            toast.error('Failed to clone website', { description });
            setPhase('idle');
            throw error;
        }
    };

    return {
        cloneFromUrl,
        cloneFromScreenshot,
        isCloning,
        phase,
    };
}
