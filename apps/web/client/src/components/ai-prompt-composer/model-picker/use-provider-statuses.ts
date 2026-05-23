'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';

import type { ProviderKind, ProviderStatus } from '@weblab/ai/client';
import type { LocalModelOption } from '@weblab/models';
import {
    CLI_PROVIDER_KINDS,
    DEFAULT_PROVIDER_STATUS,
    getProviderManifest,
} from '@weblab/ai/client';

import { useHasAuthCookie } from '@/hooks/use-has-auth-cookie';

type StatusMap = Record<ProviderKind, ProviderStatus>;

export type UseProviderStatusesResult = {
    statuses: StatusMap;
    /** Re-probe the desktop bridge and re-fetch web connections. */
    refresh: () => void;
};

/**
 * In step 1 we only know two things:
 *   1. Whether Ollama responded (existing /api/models/local probe, passed in).
 *   2. Whether we're inside the desktop shell (window.weblabNative.cli).
 *
 * The desktop CLI bridge and the web OAuth lookups arrive in steps 2-4 of the
 * rollout — this hook is the seam they will plug into. Until then, CLI
 * providers render as `desktop-only` on the hosted web (no native bridge).
 */
const cloudReady: ProviderStatus = { kind: 'ready' };

function buildInitial(): StatusMap {
    return {
        openrouter: cloudReady,
        ollama: { ...DEFAULT_PROVIDER_STATUS },
        codex: { ...DEFAULT_PROVIDER_STATUS },
        'claude-code': { ...DEFAULT_PROVIDER_STATUS },
        gemini: { ...DEFAULT_PROVIDER_STATUS },
        opencode: { ...DEFAULT_PROVIDER_STATUS },
        cursor: { ...DEFAULT_PROVIDER_STATUS },
    };
}

export function useProviderStatuses({
    localModels,
    localModelsLoading,
}: {
    localModels: ReadonlyArray<LocalModelOption>;
    localModelsLoading: boolean;
}): UseProviderStatusesResult {
    const [desktopStatuses, setDesktopStatuses] = useState<Partial<
        Record<ProviderKind, ProviderStatus>
    > | null>(null);
    const [hasNativeBridge, setHasNativeBridge] = useState<boolean | null>(null);
    // Bumped to force the desktop probe useEffect to re-run.
    const [probeNonce, setProbeNonce] = useState(0);
    const hasAuthCookie = useHasAuthCookie();
    // Only fire on hosted web for signed-in users — desktop uses the IPC
    // bridge instead, and anonymous visitors have no providers to list.
    const isHostedWebSignedIn =
        typeof window !== 'undefined' && !window.weblabNative?.cli && hasAuthCookie === true;
    const webConnections = useQuery(
        api.users.listProviderConnections,
        isHostedWebSignedIn ? {} : 'skip',
    );

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const native = window.weblabNative;
        const probe = native?.cli?.providerStatus;
        if (!probe) {
            setHasNativeBridge(false);
            return;
        }
        setHasNativeBridge(true);
        let cancelled = false;
        probe()
            .then((result) => {
                if (cancelled) return;
                const next: Partial<Record<ProviderKind, ProviderStatus>> = {};
                for (const kind of CLI_PROVIDER_KINDS) {
                    const r = result[kind];
                    if (!r) continue;
                    next[kind] = !r.installed
                        ? { kind: 'install' }
                        : r.authStatus === 'sign-in'
                          ? { kind: 'sign-in' }
                          : { kind: 'ready', version: r.version };
                }
                setDesktopStatuses(next);
            })
            .catch(() => {
                if (!cancelled) setDesktopStatuses({});
            });
        return () => {
            cancelled = true;
        };
    }, [probeNonce]);

    const refresh = useCallback(() => {
        setProbeNonce((n) => n + 1);
        // Convex live queries auto-refresh; bumping probeNonce is enough to
        // re-run the desktop probe.
    }, []);

    const statuses = useMemo<StatusMap>(() => {
        const map = buildInitial();

        // Ollama is special: its discovery already runs through /api/models/local.
        if (localModelsLoading) {
            map.ollama = { kind: 'loading' };
        } else if (localModels.length > 0) {
            map.ollama = {
                kind: 'ready',
                discoveredModels: localModels.map((m) => ({
                    id: m.model,
                    label: m.label,
                })),
            };
        } else {
            map.ollama = { kind: 'install' };
        }

        // CLI providers
        for (const kind of CLI_PROVIDER_KINDS) {
            if (hasNativeBridge === null) {
                map[kind] = { kind: 'loading' };
                continue;
            }
            if (hasNativeBridge && desktopStatuses) {
                map[kind] = desktopStatuses[kind] ?? { kind: 'install' };
                continue;
            }
            // Hosted web. If the provider supports OAuth and the user has
            // connected an account, light up Ready; otherwise show the
            // appropriate fallback (Sign in if OAuth is available; Desktop only
            // for Claude which has no web OAuth).
            const manifest = getProviderManifest(kind);
            if (!manifest.webOAuth) {
                map[kind] = { kind: 'desktop-only' };
                continue;
            }
            const connection = webConnections?.find(
                (c) => c.provider === manifest.webOAuth?.provider,
            );
            if (connection) {
                map[kind] = {
                    kind: 'ready',
                    accountEmail: connection.accountEmail ?? undefined,
                };
            } else {
                map[kind] = { kind: 'sign-in' };
            }
        }

        return map;
    }, [hasNativeBridge, desktopStatuses, localModels, localModelsLoading, webConnections]);

    return useMemo(() => ({ statuses, refresh }), [statuses, refresh]);
}
