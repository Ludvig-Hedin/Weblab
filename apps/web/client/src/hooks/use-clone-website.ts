'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useAction, useQuery } from 'convex/react';
import localforage from 'localforage';
import { toast } from 'sonner';

import type { CloneOutputFramework, ImageMessageContext } from '@weblab/models';

import type { Id } from '@convex/_generated/dataModel';
import { useAuthContext } from '@/app/auth/auth-context';
import { readActiveWorkspaceId } from '@/utils/active-workspace';
import { LocalForageKeys, Routes } from '@/utils/constants';
import { capScrapedContent, toFrameworkLiteral } from './clone-prompt';

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

export function useCloneWebsite() {
    const user = useQuery(api.users.me, {});
    const scrapeUrl = useAction(api.utils.scrapeUrl);
    const cloneWebsite = useAction(api.projectActions.createFromWebsiteClone);
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

    const cloneFromUrl = async ({ url, notes, framework }: CloneFromUrlInput) => {
        if (isCloning) return;
        if (!(await requireAuth())) return;

        try {
            // 1. Scrape the source page first. Surfacing scrape errors here
            // (before provisioning) means a bad/unreachable URL fails fast
            // without burning a sandbox.
            setPhase('scraping-url');
            // Heavy / JS-rendered pages can exceed Firecrawl's budget while
            // rendering the screenshot (408). Try the full scrape (with
            // screenshot) on a generous timeout; if it times out, retry
            // markdown-only (no render) so the clone still proceeds from the
            // page content instead of failing outright.
            let scrape = await scrapeUrl({
                url,
                formats: ['markdown', 'branding', 'screenshot'],
                onlyMainContent: true,
                timeout: 90_000,
            });
            if (scrape.error && /\b408\b|timed?\s*out|timeout/i.test(scrape.error)) {
                scrape = await scrapeUrl({
                    url,
                    formats: ['markdown', 'branding'],
                    onlyMainContent: true,
                    timeout: 90_000,
                });
            }
            if (scrape.error || (!scrape.result && !scrape.screenshotBase64)) {
                throw new Error(
                    scrape.error ??
                        'Could not extract any content from this URL. Try a different page or use the screenshot tab.',
                );
            }

            // 2. Provision a sandbox + seed the clone context (WEBSITE_URL +
            // WEBSITE_SCRAPE + screenshot + notes). The editor's resumeCreate
            // turns this into a framework-specific clone prompt on open.
            const { content: scrapeContent } = capScrapedContent(scrape.result);
            setPhase('creating-project');
            const { projectId } = await cloneWebsite({
                url,
                notes,
                scrapeContent: scrapeContent || undefined,
                screenshot: scrape.screenshotBase64
                    ? {
                          content: scrape.screenshotBase64,
                          mimeType: scrape.screenshotMimeType ?? 'image/png',
                      }
                    : undefined,
                framework: toFrameworkLiteral(framework),
                workspaceId: readActiveWorkspaceId() as Id<'workspaces'> | undefined,
            });

            // 3. Open the editor. Leave phase non-idle so the dialog's loader
            // overlay stays up through the route transition (the new route
            // unmounts this hook's consumer).
            setPhase('opening-editor');
            router.push(`${Routes.PROJECT}/${projectId}`);
        } catch (error: unknown) {
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

        try {
            // No scrape step — the user supplied the screenshot directly. The
            // action seeds an empty WEBSITE_URL context so the editor still
            // takes the clone-guidance branch (vs a bare prompt).
            setPhase('creating-project');
            const { projectId } = await cloneWebsite({
                notes,
                screenshot: { content: screenshot.content, mimeType: screenshot.mimeType },
                framework: toFrameworkLiteral(framework),
                workspaceId: readActiveWorkspaceId() as Id<'workspaces'> | undefined,
            });

            setPhase('opening-editor');
            router.push(`${Routes.PROJECT}/${projectId}`);
        } catch (error: unknown) {
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
