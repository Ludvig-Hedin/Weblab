'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useAction, useQuery } from 'convex/react';
import localforage from 'localforage';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

import type { ImageMessageContext } from '@weblab/models';
import { CloneOutputFramework } from '@weblab/models';

import { useAuthContext } from '@/app/auth/auth-context';
import { LocalForageKeys } from '@/utils/constants';

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

// TODO(sandbox-port): the entire clone flow depends on `api.sandbox.fork`
// (no Convex equivalent yet), `api.sandbox.deleteOrphan` (no Convex
// equivalent yet) and the legacy `project.create` shape that accepted a
// pre-built project + creationData context. Until those are ported to
// Convex, the user-facing entry points throw with a clear message so the
// UI can surface "temporarily unavailable" instead of silently no-op'ing.
//
// `api.utils.scrapeUrl` is already on Convex and is wired below so the rest
// of the pipeline can come back online quickly once sandbox provisioning
// lands. Build it once, throw early.

export function useCloneWebsite() {
    const user = useQuery(api.users.me, {});
    const scrapeUrl = useAction(api.utils.scrapeUrl);
    const { setIsAuthModalOpen } = useAuthContext();
    const router = useRouter();
    const [phase, setPhase] = useState<CloneWebsitePhase>('idle');
    const isCloning = phase !== 'idle';

    // Keep the imports referenced so the future sandbox port doesn't need
    // import housekeeping when this code comes back to life.
    void router;
    void uuidv4;
    void CloneOutputFramework;

    const requireAuth = async () => {
        if (user?._id) return true;
        await localforage.setItem(LocalForageKeys.RETURN_URL, window.location.pathname);
        setIsAuthModalOpen(true);
        return false;
    };

    const unavailable = (label: string) => {
        const message = `${label} is temporarily unavailable while the sandbox provisioning service is migrated.`;
        toast.error('Cloning is unavailable', { description: message });
        throw new Error(message);
    };

    const cloneFromUrl = async ({ url, notes, framework }: CloneFromUrlInput) => {
        if (isCloning) return;
        if (!(await requireAuth())) return;

        try {
            // Surface scrape errors early so we don't show a misleading
            // "sandbox unavailable" message when the URL itself is bad.
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
            void notes;
            void framework;
            // TODO(sandbox-port): from here we used to fork a sandbox, build
            // a creationData context, and call project.create. Re-enable once
            // the sandbox endpoint exists in Convex.
            unavailable('Cloning from URL');
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
            void screenshot;
            void notes;
            void framework;
            // TODO(sandbox-port): screenshot clone is identical to the URL
            // path past the scrape step — both need sandbox provisioning to
            // be ported before they can ship again.
            unavailable('Cloning from screenshot');
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
