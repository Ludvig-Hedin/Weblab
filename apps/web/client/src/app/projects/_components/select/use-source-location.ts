'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface SourceLocation {
    status: 'available' | 'missing' | 'permissionDenied' | 'needsConfirmation';
    sourcePath?: string;
    workingPath?: string;
    generation?: number;
    error?: string;
}
interface SourceCandidate {
    canceled?: boolean;
    token?: string;
    sourcePath?: string;
    previousPath?: string;
    sourceChanged?: boolean;
    error?: string;
}
interface SourceBridge {
    sourceLocation(root: string, resolve?: boolean): Promise<SourceLocation>;
    locateSource(root: string): Promise<SourceCandidate>;
    confirmSource(root: string, token: string): Promise<SourceLocation>;
    revealSource(root: string): Promise<{ error?: string }>;
}
const getBridge = (): Partial<SourceBridge> | undefined =>
    typeof window === 'undefined'
        ? undefined
        : (window as unknown as { weblabNative?: { localfs?: Partial<SourceBridge> } }).weblabNative
              ?.localfs;

export function useSourceLocation(root?: string, active = false) {
    const [location, setLocation] = useState<SourceLocation>();
    const [candidate, setCandidate] = useState<SourceCandidate>();
    const [loading, setLoading] = useState(false);
    const [supported, setSupported] = useState(false);
    const [error, setError] = useState<string>();
    const busy = useRef<{ root: string } | undefined>(undefined);
    const lastResolved = useRef(0);
    const currentRoot = useRef(root);
    currentRoot.current = root;

    useEffect(() => {
        setLocation(undefined);
        setCandidate(undefined);
        setError(undefined);
        lastResolved.current = 0;
        setSupported(Boolean(getBridge()?.sourceLocation));
    }, [root]);

    const run = useCallback(
        async (operation: (bridge: Partial<SourceBridge>, root: string) => Promise<void>) => {
            if (!root || busy.current?.root === root) return;
            const bridge = getBridge();
            if (!bridge?.sourceLocation) return;
            const operationId = { root };
            busy.current = operationId;
            setLoading(true);
            setError(undefined);
            try {
                await operation(bridge, root);
            } catch (failure) {
                if (currentRoot.current === root) {
                    setError(failure instanceof Error ? failure.message : String(failure));
                }
            } finally {
                if (busy.current === operationId) {
                    busy.current = undefined;
                    setLoading(false);
                }
            }
        },
        [root],
    );

    const refresh = useCallback(
        (force = false) =>
            run(async (bridge, requestedRoot) => {
                // Name hovers resolve only the project being inspected, with a short cache.
                if (!force && Date.now() - lastResolved.current < 5000) return;
                if (!bridge.sourceLocation) return;
                const result = await bridge.sourceLocation(requestedRoot, true);
                if (currentRoot.current !== requestedRoot) return;
                setLocation(result);
                setError(result.error);
                lastResolved.current = Date.now();
            }),
        [run],
    );

    useEffect(() => {
        if (!active) return;
        void refresh(true);
        const onFocus = () => void refresh(true);
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [active, refresh]);

    const locate = () =>
        run(async (bridge, requestedRoot) => {
            if (!bridge.locateSource) return;
            const result = await bridge.locateSource(requestedRoot);
            if (currentRoot.current !== requestedRoot || result.canceled) return;
            if (result.error) setError(result.error);
            else setCandidate(result);
        });
    const confirm = () =>
        run(async (bridge, requestedRoot) => {
            if (!candidate?.token || !bridge.confirmSource) return;
            const result = await bridge.confirmSource(requestedRoot, candidate.token);
            if (currentRoot.current !== requestedRoot) return;
            setLocation(result);
            setError(result.error);
            if (!result.error && result.status === 'available') setCandidate(undefined);
        });
    const reveal = () =>
        run(async (bridge, requestedRoot) => {
            if (!bridge.revealSource) return;
            const result = await bridge.revealSource(requestedRoot);
            if (currentRoot.current === requestedRoot) setError(result.error);
        });

    return {
        location,
        candidate,
        loading,
        supported,
        error,
        refresh,
        locate,
        confirm,
        reveal,
        cancel: () => setCandidate(undefined),
    };
}
