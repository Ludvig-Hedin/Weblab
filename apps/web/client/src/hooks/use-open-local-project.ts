'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';

import {
    getNextJsScaffoldFiles,
    getStaticHtmlScaffoldFiles,
    NEXTJS_SCAFFOLD_PORT,
    STATIC_HTML_SCAFFOLD_PORT,
} from '@weblab/code-provider';
import { WEBLAB_LOCAL_DEFAULT_PORT } from '@weblab/constants';

import { Routes } from '@/utils/constants';

// Minimal view of the desktop IPC bridge (apps/desktop/preload.js). Local mode
// is desktop-only; in a normal browser `window.weblabNative` is undefined.
interface LocalFsBridge {
    pickFolder(): Promise<{ rootPath: string } | null>;
    read(
        root: string,
        path: string,
    ): Promise<{ content?: string; error?: string; notFound?: boolean }>;
    write(
        root: string,
        path: string,
        content: string | Uint8Array,
    ): Promise<{ success?: boolean; error?: string }>;
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
    pickPort?(preferredPort?: number | null): Promise<{ port?: number; error?: string }>;
}

function getLocalDev(): LocalDevBridge | undefined {
    if (typeof window === 'undefined') return undefined;
    return (window as unknown as { weblabNative?: { localdev?: LocalDevBridge } }).weblabNative
        ?.localdev;
}

/**
 * Resolve a FREE dev-server port for a new local project so the frame URL is
 * built from a port that's actually open — and uncommon, never the editor's own
 * :3000. Asks the desktop bridge to scan; falls back to `preferred` when the
 * bridge or `pickPort` isn't available (older desktop build). Only meaningful
 * for PORT-honoring frameworks (Next.js) — callers skip it for frameworks that
 * pin their own port (Vite, static `serve`).
 */
async function resolveFreeLocalPort(preferred: number): Promise<number> {
    try {
        const res = await getLocalDev()?.pickPort?.(preferred);
        if (res && typeof res.port === 'number' && res.port > 0) return res.port;
    } catch {
        // fall through to the preferred port
    }
    return preferred;
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
            else framework = 'nextjs';
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

/** True when a folder has no meaningful (non-dotfile) entries. */
async function isFolderEmpty(localfs: LocalFsBridge, rootPath: string): Promise<boolean> {
    const existing = await localfs.list(rootPath, '.');
    const meaningful = (existing.files ?? []).filter((f) => !f.name.startsWith('.'));
    return meaningful.length === 0;
}

/**
 * Open a local folder as a Weblab project (desktop only). Picks a directory via
 * the native dialog, infers framework + port from its package.json, creates a
 * `runtimeType: 'local'` project pointed at that folder, and opens the editor —
 * which boots the folder's dev server locally and renders it on the canvas.
 *
 * Also exposes:
 *  - `openLocalFolderAtPath` — same as above but for a path we already have
 *    (drag-and-drop into the window, or a folder dropped on the dock icon). An
 *    *empty* folder is scaffolded with a Static HTML starter so it's runnable.
 *  - `createLocalBlank` — scaffold a fresh blank project (Next.js or Static
 *    HTML) into an empty folder the user picks.
 */
export function useOpenLocalProject() {
    const user = useQuery(api.users.me);
    const createLocal = useMutation(api.projects.createLocal);
    const router = useRouter();
    const [phase, setPhase] = useState<OpenLocalPhase>('idle');

    /**
     * Open a folder we already have a path for. Non-empty → open as-is with the
     * inferred framework/port. Empty → scaffold a Static HTML starter first so a
     * dropped/opened empty folder lands on a runnable project, not a blank shell.
     */
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

            // Empty folder: scaffold a Static HTML starter so it's immediately
            // runnable. `serve` installs + boots on open via the NodeFs bridge.
            if (localfs.write && (await isFolderEmpty(localfs, rootPath))) {
                setPhase('creating');
                for (const file of getStaticHtmlScaffoldFiles()) {
                    const res = await localfs.write(rootPath, file.path, file.content);
                    if (res.error) throw new Error(`Failed to write ${file.path}: ${res.error}`);
                }
                const project = await createLocal({
                    name,
                    rootPath,
                    framework: 'static-html',
                    port: STATIC_HTML_SCAFFOLD_PORT,
                });
                setPhase('opening');
                router.push(`${Routes.PROJECT}/${project._id}`);
                return;
            }

            // Existing project: infer framework + port from its package.json so
            // the project's frame URL matches the port the dev server binds.
            setPhase('creating');
            const [pkgRes, idxRes] = await Promise.all([
                localfs.read(rootPath, 'package.json'),
                localfs.read(rootPath, 'index.html'),
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
                framework === 'nextjs' && !portIsExplicit ? await resolveFreeLocalPort(port) : port;

            const project = await createLocal({ name, rootPath, framework, port: resolvedPort });
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
        if (!localfs?.write) {
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
                const res = await localfs.write(rootPath, file.path, file.content);
                if (res.error) throw new Error(`Failed to write ${file.path}: ${res.error}`);
            }

            const project = await createLocal({
                name,
                rootPath,
                framework,
                // Next.js scaffold runs `next dev` (honors PORT) → free uncommon
                // port instead of :3000. Static `serve` pins its own -l port.
                port:
                    framework === 'nextjs'
                        ? await resolveFreeLocalPort(NEXTJS_SCAFFOLD_PORT)
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
