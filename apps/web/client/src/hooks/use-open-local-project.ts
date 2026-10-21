'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';

import {
    getNextJsScaffoldFiles,
    getStaticHtmlScaffoldFiles,
    NEXTJS_SCAFFOLD_PORT,
    STATIC_HTML_SCAFFOLD_PORT,
} from '@weblab/code-provider';
import { APP_NAME, WEBLAB_LOCAL_DEFAULT_PORT } from '@weblab/constants';

import { Routes } from '@/utils/constants';

// Minimal view of the desktop IPC bridge (apps/desktop/preload.js). Local mode
// is desktop-only; in a normal browser `window.weblabNative` is undefined.
interface LocalFsBridge {
    pickFolder(): Promise<{ rootPath?: string; error?: string } | null>;
    createPrivateWorkingCopy(sourceRoot: string): Promise<{
        rootPath?: string;
        sourceRootPath?: string;
        copyId?: string;
        priorCopyId?: string;
        priorRootPath?: string;
        reused?: boolean;
        previewNeedsInstall?: boolean;
        excludedPaths?: string[];
        exclusions?: { path: string; reason: 'credentials' | 'dependencies' | 'generated' }[];
        error?: string;
    }>;
    read(
        root: string,
        path: string,
    ): Promise<{ content?: string; error?: string; notFound?: boolean }>;
    writeIfUnchanged(
        root: string,
        path: string,
        content: string,
        expectedSha256: string | null,
    ): Promise<{ success?: boolean; conflict?: boolean; error?: string }>;
    list(
        root: string,
        path: string,
    ): Promise<{
        files?: { name: string; type: 'file' | 'directory'; isSymlink: boolean }[];
        error?: string;
    }>;
}

function getLocalFs(): LocalFsBridge | undefined {
    if (typeof window === 'undefined') return undefined;
    return (window as unknown as { weblabNative?: { localfs?: LocalFsBridge } }).weblabNative
        ?.localfs;
}

/** True only inside the Weblab desktop app, where local folders can be opened. */
export function isDesktopLocalAvailable(): boolean {
    return !!getLocalFs();
}

interface LocalDevBridge {
    pickPort?(root: string, preferredPort?: number | null): Promise<{ port?: number; error?: string }>;
}

function getLocalDev(): LocalDevBridge | undefined {
    if (typeof window === 'undefined') return undefined;
    return (window as unknown as { weblabNative?: { localdev?: LocalDevBridge } }).weblabNative
        ?.localdev;
}

/**
 * Resolve a FREE dev-server port for a new local project so the frame URL is
 * built from a port that's actually open and uncommon. The desktop bridge
 * must confirm the choice; callers skip this for frameworks that pin a port.
 */
async function resolveFreeLocalPort(rootPath: string, preferred: number): Promise<number> {
    const pickPort = getLocalDev()?.pickPort;
    if (!pickPort) throw new Error('The desktop app cannot reserve a local preview port.');
    const res = await pickPort(rootPath, preferred);
    if (res.error || !res.port) {
        throw new Error(res.error ?? 'Could not reserve a local preview port.');
    }
    return res.port;
}

function inferPortFromDevScript(devScript: string): number | null {
    const match =
        /(?:--port|-p|--listen|-l)\s+(?:tcp:\/\/[^:]+:)?(\d{2,5})\b/.exec(devScript) ??
        /(?:localhost|0\.0\.0\.0|127\.0\.0\.1):(\d{2,5})\b/.exec(devScript);
    if (!match?.[1]) return null;
    const port = Number.parseInt(match[1], 10);
    return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

function defaultPortForFramework(framework: string): number {
    // Vite binds 5173 regardless of the PORT env, so we keep its default.
    // Everything else here (Next.js) honors PORT, so it defaults to our
    // uncommon local port — never :3000, which is the editor's own dev server.
    return framework === 'vite-react' ? 5173 : WEBLAB_LOCAL_DEFAULT_PORT;
}

/**
 * Infer the framework + dev-server port from a folder's package.json so the
 * project's frame URL matches the port the local dev server will actually bind.
 * Falls back to static-html when an index.html exists and there's no package.json.
 *
 * `portIsExplicit` is true when the port came from a flag in the dev script
 * (e.g. `next dev -p 4000`, `serve -l 8080`) — those pin the port themselves, so
 * the caller must NOT swap in a free port (the dev server would ignore it).
 */
function inferFrameworkAndPort(
    pkgJson: string | undefined,
    hasIndexHtml: boolean,
): { framework: string; port: number; portIsExplicit: boolean } {
    let framework = hasIndexHtml ? 'static-html' : 'nextjs';
    let devScript = '';
    if (pkgJson) {
        try {
            const pkg = JSON.parse(pkgJson) as {
                dependencies?: Record<string, string>;
                devDependencies?: Record<string, string>;
                scripts?: { dev?: string };
            };
            const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
            devScript = pkg.scripts?.dev ?? '';
            if (deps.next) framework = 'nextjs';
            else if (deps.vite) framework = 'vite-react';
            else if (deps['@remix-run/react'] || deps['@remix-run/node']) framework = 'remix';
            else if (deps.astro) framework = 'astro';
            else framework = hasIndexHtml ? 'static-html' : 'nextjs';
        } catch {
            // keep defaults
        }
    }
    const explicitPort = inferPortFromDevScript(devScript);
    const port = explicitPort ?? defaultPortForFramework(framework);
    return { framework, port, portIsExplicit: explicitPort !== null };
}

export type OpenLocalPhase = 'idle' | 'picking' | 'creating' | 'opening';

/** Frameworks we can scaffold onto local disk today (Cloud supports more). */
export type LocalBlankFramework = 'nextjs' | 'static-html';

/** Last path segment of a folder, used as the project's display name. */
function nameFromPath(rootPath: string): string {
    return rootPath.split(/[\\/]/).filter(Boolean).pop() ?? 'Local project';
}

/** True only for a truly empty folder, including hidden Git metadata. */
async function isFolderEmpty(localfs: LocalFsBridge, rootPath: string): Promise<boolean> {
    const existing = await localfs.list(rootPath, '.');
    if (existing.error) throw new Error(existing.error);
    return (existing.files ?? []).length === 0;
}

/**
 * Open a local folder as a Weblab project (desktop only). Picks a directory via
 * the native dialog, infers framework + port from its package.json, creates a
 * `runtimeType: 'local'` project pointed at that folder, and opens the editor —
 * which loads the folder's source without changing it. Preview starts only
 * after the user requests it.
 *
 * Also exposes:
 *  - `openLocalFolderAtPath` — same as above but for a path we already have
 *    (drag-and-drop into the window, or a folder dropped on the dock icon).
 *  - `createLocalBlank` — scaffold a fresh blank project (Next.js or Static
 *    HTML) into an empty folder the user picks.
 */
export function useOpenLocalProject() {
    const gitText = useTranslations('editor.git');
    const user = useQuery(api.users.me);
    const convex = useConvex();
    const createLocal = useMutation(api.projects.createLocal);
    const router = useRouter();
    const [phase, setPhase] = useState<OpenLocalPhase>('idle');

    /** Open a read-only Git source through an app-owned working copy. */
    const openLocalFolderAtPath = async (rootPath: string) => {
        const localfs = getLocalFs();
        if (!localfs) {
            toast.error('Local projects are only available in the Weblab desktop app.');
            return;
        }
        if (phase !== 'idle') return;
        if (!rootPath) return;

        try {
            const name = nameFromPath(rootPath);
            setPhase('creating');
            const copy = await localfs.createPrivateWorkingCopy(rootPath);
            if (copy.error || !copy.rootPath) {
                throw new Error(copy.error ?? 'Could not create a private working copy.');
            }
            if (copy.priorCopyId) {
                toast.warning(gitText('handoffNewCopy', { appName: APP_NAME }), {
                    description: copy.priorRootPath,
                });
            }
            if (copy.exclusions?.some((entry) => entry.reason === 'credentials')) {
                toast.warning(gitText('copyCredentialsOmitted'));
            }
            const workingRoot = copy.rootPath;
            const cacheKey = copy.copyId && user?._id
                ? `weblab:local-project:${user._id}:${copy.copyId}`
                : null;
            if (cacheKey) {
                try {
                    const cachedId = window.localStorage.getItem(cacheKey);
                    if (cachedId) {
                        const existing = await convex.query(api.projects.get, {
                            projectId: cachedId as Id<'projects'>,
                        });
                        if (existing?.storageMode === 'local') {
                            setPhase('opening');
                            router.push(`${Routes.PROJECT}/${cachedId}`);
                            return;
                        }
                        window.localStorage.removeItem(cacheKey);
                    }
                } catch {
                    // A stale or inaccessible project can be recreated below.
                    try { window.localStorage.removeItem(cacheKey); } catch { /* storage unavailable */ }
                }
            }

            // Infer framework + port from the private copy so
            // the project's frame URL matches the port the dev server binds.
            const [pkgRes, idxRes] = await Promise.all([
                localfs.read(workingRoot, 'package.json'),
                localfs.read(workingRoot, 'index.html'),
            ]);
            const hasIndexHtml = !idxRes.error && !!idxRes.content;
            const { framework, port, portIsExplicit } = inferFrameworkAndPort(
                pkgRes.content,
                hasIndexHtml,
            );
            // Next.js honors PORT, so swap in a guaranteed-free uncommon port
            // (never the editor's :3000). Frameworks that pin their own port
            // (explicit dev-script flag, or Vite/static which ignore PORT) keep
            // the inferred port so the frame URL matches what the server binds.
            const resolvedPort =
                framework === 'nextjs' && !portIsExplicit
                    ? await resolveFreeLocalPort(workingRoot, port)
                    : port;

            const project = await createLocal({
                name,
                rootPath: workingRoot,
                framework,
                port: resolvedPort,
            });
            if (cacheKey) {
                try { window.localStorage.setItem(cacheKey, project._id); }
                catch { /* project creation succeeded even if browser storage is unavailable */ }
            }
            setPhase('opening');
            router.push(`${Routes.PROJECT}/${project._id}`);
        } catch (err) {
            console.error('[useOpenLocalProject] failed to open local folder', err);
            toast.error(err instanceof Error ? err.message : 'Could not open the local folder.');
            setPhase('idle');
        }
    };

    /** Pick a folder via the native dialog, then open it (see above). */
    const openLocalFolder = async () => {
        const localfs = getLocalFs();
        if (!localfs) {
            toast.error('Local projects are only available in the Weblab desktop app.');
            return;
        }
        if (phase !== 'idle') return;

        setPhase('picking');
        const picked = await localfs.pickFolder();
        if (picked?.error) {
            toast.error(picked.error);
            setPhase('idle');
            return;
        }
        if (!picked?.rootPath) {
            setPhase('idle');
            return;
        }
        // Hand off to the shared core. It re-checks `phase`, so reset to idle
        // first (we left 'picking' above) — the picker is done.
        setPhase('idle');
        await openLocalFolderAtPath(picked.rootPath);
    };

    /**
     * Scaffold a fresh blank project (Next.js or Static HTML) into an empty
     * folder the user picks, then open it. Mirrors the cloud "Start blank" but
     * writes the files straight to disk.
     */
    const createLocalBlank = async (framework: LocalBlankFramework) => {
        const localfs = getLocalFs();
        if (!localfs?.writeIfUnchanged) {
            toast.error('Local projects are only available in the Weblab desktop app.');
            return;
        }
        if (phase !== 'idle') return;

        try {
            setPhase('picking');
            const picked = await localfs.pickFolder();
            if (!picked?.rootPath) {
                setPhase('idle');
                return;
            }
            const rootPath = picked.rootPath;
            const name = nameFromPath(rootPath);

            // Guard: scaffolding writes files. Refuse a non-empty folder so we
            // never clobber the user's existing files — "Open folder" handles
            // existing projects.
            if (!(await isFolderEmpty(localfs, rootPath))) {
                toast.error(
                    'That folder already has files. Pick an empty folder for a new project, or use "Open folder" to edit it.',
                );
                setPhase('idle');
                return;
            }

            setPhase('creating');
            const files =
                framework === 'nextjs' ? getNextJsScaffoldFiles() : getStaticHtmlScaffoldFiles();
            for (const file of files) {
                const res = await localfs.writeIfUnchanged(rootPath, file.path, file.content, null);
                if (!res.success) {
                    throw new Error(`Failed to write ${file.path}: ${res.error ?? 'file already exists'}`);
                }
            }

            const project = await createLocal({
                name,
                rootPath,
                framework,
                // Next.js scaffold runs `next dev` (honors PORT) → free uncommon
                // port instead of :3000. Static `serve` pins its own -l port.
                port:
                    framework === 'nextjs'
                        ? await resolveFreeLocalPort(rootPath, NEXTJS_SCAFFOLD_PORT)
                        : STATIC_HTML_SCAFFOLD_PORT,
            });

            setPhase('opening');
            router.push(`${Routes.PROJECT}/${project._id}`);
        } catch (err) {
            console.error('[useOpenLocalProject] failed to create local project', err);
            toast.error(err instanceof Error ? err.message : 'Could not create the local project.');
            setPhase('idle');
        }
    };

    return {
        openLocalFolder,
        openLocalFolderAtPath,
        createLocalBlank,
        phase,
        isBusy: phase !== 'idle',
        isAuthed: !!user,
        isDesktop: isDesktopLocalAvailable(),
    };
}
