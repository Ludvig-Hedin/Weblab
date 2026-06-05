'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';

import { getStaticHtmlScaffoldFiles, STATIC_HTML_SCAFFOLD_PORT } from '@weblab/code-provider';

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

function inferPortFromDevScript(devScript: string): number | null {
    const match =
        /(?:--port|-p|--listen|-l)\s+(?:tcp:\/\/[^:]+:)?(\d{2,5})\b/.exec(devScript) ??
        /(?:localhost|0\.0\.0\.0|127\.0\.0\.1):(\d{2,5})\b/.exec(devScript);
    if (!match?.[1]) return null;
    const port = Number.parseInt(match[1], 10);
    return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

function defaultPortForFramework(framework: string): number {
    // Vite binds 5173 by default; Next.js / static-html `serve` default to 3000.
    return framework === 'vite-react' ? 5173 : 3000;
}

/**
 * Infer the framework + dev-server port from a folder's package.json so the
 * project's frame URL matches the port the local dev server will actually bind.
 * Falls back to static-html when an index.html exists and there's no package.json.
 */
function inferFrameworkAndPort(
    pkgJson: string | undefined,
    hasIndexHtml: boolean,
): { framework: string; port: number } {
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
    const port = inferPortFromDevScript(devScript) ?? defaultPortForFramework(framework);
    return { framework, port };
}

export type OpenLocalPhase = 'idle' | 'picking' | 'creating' | 'opening';

/**
 * Open a local folder as a Weblab project (desktop only). Picks a directory via
 * the native dialog, infers framework + port from its package.json, creates a
 * `runtimeType: 'local'` project pointed at that folder, and opens the editor —
 * which boots the folder's dev server locally and renders it on the canvas.
 */
export function useOpenLocalProject() {
    const user = useQuery(api.users.me);
    const createLocal = useMutation(api.projects.createLocal);
    const router = useRouter();
    const [phase, setPhase] = useState<OpenLocalPhase>('idle');

    const openLocalFolder = async () => {
        const localfs = getLocalFs();
        if (!localfs) {
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
            const name = rootPath.split(/[\\/]/).filter(Boolean).pop() ?? 'Local project';

            const [pkgRes, idxRes] = await Promise.all([
                localfs.read(rootPath, 'package.json'),
                localfs.read(rootPath, 'index.html'),
            ]);
            const hasIndexHtml = !idxRes.error && !!idxRes.content;
            const { framework, port } = inferFrameworkAndPort(pkgRes.content, hasIndexHtml);

            setPhase('creating');
            const project = await createLocal({ name, rootPath, framework, port });

            setPhase('opening');
            router.push(`${Routes.PROJECT}/${project._id}`);
        } catch (err) {
            console.error('[useOpenLocalProject] failed to open local folder', err);
            toast.error(err instanceof Error ? err.message : 'Could not open the local folder.');
            setPhase('idle');
        }
    };

    const createLocalFolder = async () => {
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
            const name = rootPath.split(/[\\/]/).filter(Boolean).pop() ?? 'Local project';

            // Scaffold a blank static-HTML project into the chosen folder (the
            // same file set the cloud uses), then create + open it. The dev
            // server (`serve`) installs + boots on open via the NodeFs bridge.
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
        } catch (err) {
            console.error('[useOpenLocalProject] failed to create local project', err);
            toast.error(err instanceof Error ? err.message : 'Could not create the local project.');
            setPhase('idle');
        }
    };

    return {
        openLocalFolder,
        createLocalFolder,
        phase,
        isBusy: phase !== 'idle',
        isAuthed: !!user,
        isDesktop: isDesktopLocalAvailable(),
    };
}
