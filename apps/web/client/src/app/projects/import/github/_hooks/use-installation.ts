'use client';

import { useEffect, useRef, useState } from 'react';

import { api } from '@/trpc/react';

export interface GitHubAppInstallation {
    hasInstallation: boolean;
    installationId: string | null;
    isChecking: boolean;
    isConnecting: boolean;
    error: string | null;
    redirectToInstallation: (redirectUrl?: string) => Promise<void>;
    refetch: () => void;
    clearError: () => void;
}

/**
 * Polling deadline for installation detection (issue #10).
 * `refetchOnWindowFocus` alone misses Cmd-Tab returns that don't fire focus
 * events, so we additionally poll every INSTALL_POLL_INTERVAL_MS for up to
 * INSTALL_POLL_DEADLINE_MS after the user is sent to the install flow.
 */
const INSTALL_POLL_INTERVAL_MS = 3000;
const INSTALL_POLL_DEADLINE_MS = 60_000;

export const useGitHubAppInstallation: () => GitHubAppInstallation = () => {
    const generateInstallationUrl = api.github.generateInstallationUrl.useMutation();

    // Tracks until when polling should run. Set by redirectToInstallation,
    // cleared once an installation is detected or the deadline passes.
    const pollDeadlineRef = useRef<number | null>(null);

    const {
        data: installationId,
        refetch: checkInstallation,
        isFetching: isChecking,
        error: checkInstallationError,
    } = api.github.checkGitHubAppInstallation.useQuery(undefined, {
        refetchOnWindowFocus: true,
        refetchInterval: (query) => {
            const data = query.state.data;
            if (data) return false;
            const deadline = pollDeadlineRef.current;
            if (deadline === null) return false;
            if (Date.now() >= deadline) {
                pollDeadlineRef.current = null;
                return false;
            }
            return INSTALL_POLL_INTERVAL_MS;
        },
    });

    const [error, setError] = useState<string | null>(null);
    // True after user clicks "Connect GitHub" and until installation is confirmed.
    const [isConnecting, setIsConnecting] = useState(false);
    const hasInstallation = !!installationId;

    useEffect(() => {
        // PRECONDITION_FAILED just means no installation yet — not a user-facing error.
        const code = (checkInstallationError as { data?: { code?: string } } | null)?.data?.code;
        setError(code === 'PRECONDITION_FAILED' ? null : (checkInstallationError?.message ?? null));
    }, [checkInstallationError]);

    // Stop polling and clear connecting state as soon as the install lands.
    useEffect(() => {
        if (hasInstallation) {
            pollDeadlineRef.current = null;
            setIsConnecting(false);
        }
    }, [hasInstallation]);

    const clearError = () => {
        setError(null);
    };

    const redirectToInstallation = async (redirectUrl?: string) => {
        try {
            const result = await generateInstallationUrl.mutateAsync({
                redirectUrl,
            });

            if (result?.url) {
                const newWindow = window.open(result.url, '_blank');
                if (!newWindow) {
                    // Popup was blocked — tell the user instead of silently failing.
                    setError(
                        'A popup was blocked. Please allow popups for this site and try again.',
                    );
                    return;
                }
                pollDeadlineRef.current = Date.now() + INSTALL_POLL_DEADLINE_MS;
                setIsConnecting(true);
            }
        } catch (error) {
            console.error('Error generating GitHub App installation URL:', error);
        }
    };

    return {
        hasInstallation,
        installationId: installationId || null,
        isChecking,
        isConnecting,
        error,
        redirectToInstallation,
        refetch: checkInstallation,
        clearError,
    };
};
