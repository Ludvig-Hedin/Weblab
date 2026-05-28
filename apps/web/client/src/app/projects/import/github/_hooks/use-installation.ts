'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useAction, useConvex } from 'convex/react';

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
 * Polling deadline for installation detection. checkGitHubAppInstallation is
 * an action (not a reactive query) so we still need to poll after the user
 * is sent to the install flow.
 */
const INSTALL_POLL_INTERVAL_MS = 3000;
const INSTALL_POLL_DEADLINE_MS = 60_000;

export const useGitHubAppInstallation: () => GitHubAppInstallation = () => {
    const convex = useConvex();
    const generateInstallationUrl = useAction(api.githubActions.generateInstallationUrlAction);

    const pollDeadlineRef = useRef<number | null>(null);
    const [installationId, setInstallationId] = useState<string | null>(null);
    const [isChecking, setIsChecking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);
    const hasInstallation = !!installationId;

    const checkInstallation = useCallback(async () => {
        setIsChecking(true);
        try {
            const result = await convex.action(api.githubActions.checkGitHubAppInstallation, {});
            setInstallationId(result ?? null);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            // PRECONDITION_FAILED just means no installation yet — not user-facing.
            if (!message.includes('PRECONDITION_FAILED')) {
                setError(message);
            }
            setInstallationId(null);
        } finally {
            setIsChecking(false);
        }
    }, [convex]);

    useEffect(() => {
        void checkInstallation();
    }, [checkInstallation]);

    useEffect(() => {
        const onFocus = () => void checkInstallation();
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [checkInstallation]);

    useEffect(() => {
        if (hasInstallation || pollDeadlineRef.current === null) return;
        const id = window.setInterval(() => {
            const deadline = pollDeadlineRef.current;
            if (deadline === null || Date.now() >= deadline) {
                pollDeadlineRef.current = null;
                window.clearInterval(id);
                return;
            }
            void checkInstallation();
        }, INSTALL_POLL_INTERVAL_MS);
        return () => window.clearInterval(id);
    }, [hasInstallation, checkInstallation, isConnecting]);

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
        // Open the tab synchronously to preserve the user-gesture. window.open
        // called *after* an await is treated as non-user-initiated and gets
        // blocked by Safari/strict popup blockers.
        const newWindow = window.open('about:blank', '_blank');
        if (!newWindow) {
            setError('A popup was blocked. Please allow popups for this site and try again.');
            return;
        }
        setError(null);
        try {
            const result = await generateInstallationUrl({
                redirectUrl,
            });

            if (result?.url) {
                newWindow.location.href = result.url;
                pollDeadlineRef.current = Date.now() + INSTALL_POLL_DEADLINE_MS;
                setIsConnecting(true);
            } else {
                newWindow.close();
                setError('Could not generate the GitHub installation link. Please try again.');
            }
        } catch (err) {
            // Was previously swallowed (console-only) — the import modal showed
            // no feedback when URL generation failed (e.g. missing GitHub env).
            newWindow.close();
            console.error('Error generating GitHub App installation URL:', err);
            setError('Could not generate the GitHub installation link. Please try again.');
        }
    };

    return {
        hasInstallation,
        installationId: installationId || null,
        isChecking,
        isConnecting,
        error,
        redirectToInstallation,
        refetch: () => void checkInstallation(),
        clearError,
    };
};
