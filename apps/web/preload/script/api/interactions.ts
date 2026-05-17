import type { InteractionsDocument } from '@weblab/models';

interface IxRuntimeBridge {
    loadConfig(doc: InteractionsDocument): void;
    reloadFromUrl(): Promise<void>;
    playInteraction(ixId: string, animationId: string, opts?: { restart?: boolean }): unknown;
    pauseInteraction(ixId: string, animationId: string): void;
    setScrubTime(ixId: string, animationId: string, tMs: number): void;
    applyInitialStates(): void;
    resolveTargets(ixId: string): HTMLElement[];
}

declare global {
    interface Window {
        __weblabIx?: IxRuntimeBridge;
    }
}

/**
 * Thin wrappers over `window.__weblabIx` exposed by the IX runtime bundle.
 *
 * The IX runtime ships in a separate script tag (`weblab-ix-runtime.js`)
 * that registers itself on `window.__weblabIx`. The preload script's only
 * job is to proxy editor RPC calls through to the runtime — both bundles
 * may load asynchronously and in arbitrary order, so every method here
 * tolerates a missing `__weblabIx` and returns a sentinel.
 */

function getRuntime() {
    return typeof window !== 'undefined' ? window.__weblabIx : undefined;
}

export async function playInteraction(ixId: string, animationId: string): Promise<boolean> {
    const rt = getRuntime();
    if (!rt) return false;
    rt.playInteraction(ixId, animationId, { restart: true });
    return true;
}

export async function pauseInteraction(ixId: string, animationId: string): Promise<void> {
    getRuntime()?.pauseInteraction(ixId, animationId);
}

export async function scrubInteraction(
    ixId: string,
    animationId: string,
    tMs: number,
): Promise<void> {
    getRuntime()?.setScrubTime(ixId, animationId, tMs);
}

export async function applyInitialStates(): Promise<void> {
    getRuntime()?.applyInitialStates();
}

export async function reloadInteractions(): Promise<void> {
    await getRuntime()?.reloadFromUrl();
}

export async function applyInteractionsConfig(doc: InteractionsDocument): Promise<void> {
    getRuntime()?.loadConfig(doc);
}

export async function listInteractionTargets(ixId: string): Promise<string[]> {
    const rt = getRuntime();
    if (!rt) return [];
    return rt.resolveTargets(ixId).map((el) => el.getAttribute('data-odid') ?? '');
}
