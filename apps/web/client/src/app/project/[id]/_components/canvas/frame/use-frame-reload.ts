import { useEffect, useRef, useState } from 'react';
import { debounce } from 'lodash';

// Reload timing constants
const RELOAD_BASE_DELAY_MS = 2000;
const RELOAD_INCREMENT_MS = 1000;
const PENPAL_BASE_TIMEOUT_MS = 5000;
const PENPAL_TIMEOUT_INCREMENT_MS = 2000;
const PENPAL_MAX_TIMEOUT_MS = 30000;

export function useFrameReload() {
    const reloadCountRef = useRef(0);
    const reloadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    const [isPenpalConnected, setIsPenpalConnected] = useState(false);

    const clearScheduledReload = () => {
        if (reloadTimeoutRef.current) {
            clearTimeout(reloadTimeoutRef.current);
            reloadTimeoutRef.current = null;
        }
    };

    const immediateReload = () => {
        clearScheduledReload();
        setReloadKey((prev) => prev + 1);
    };

    const scheduleReload = () => {
        clearScheduledReload();

        reloadCountRef.current += 1;
        const reloadDelay =
            RELOAD_BASE_DELAY_MS + RELOAD_INCREMENT_MS * (reloadCountRef.current - 1);

        reloadTimeoutRef.current = setTimeout(() => {
            setReloadKey((prev) => prev + 1);
            reloadTimeoutRef.current = null;
        }, reloadDelay);
    };

    const handleConnectionFailed = debounce(
        () => {
            setIsPenpalConnected(false);
            scheduleReload();
        },
        1000,
        { leading: true },
    );

    const handleConnectionSuccess = () => {
        handleConnectionFailed.cancel();
        clearScheduledReload();
        setIsPenpalConnected(true);
    };

    const getPenpalTimeout = () => {
        return Math.min(
            PENPAL_BASE_TIMEOUT_MS + reloadCountRef.current * PENPAL_TIMEOUT_INCREMENT_MS,
            PENPAL_MAX_TIMEOUT_MS,
        );
    };

    // Reset reload counter on successful connection
    useEffect(() => {
        if (isPenpalConnected && reloadCountRef.current > 0) {
            reloadCountRef.current = 0;
        }
    }, [isPenpalConnected]);

    // Reset connection state on reload
    useEffect(() => {
        setIsPenpalConnected(false);
    }, [reloadKey]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            handleConnectionFailed.cancel();
            clearScheduledReload();
        };
    }, []);

    return {
        reloadKey,
        isPenpalConnected,
        immediateReload,
        handleConnectionFailed,
        handleConnectionSuccess,
        getPenpalTimeout,
    };
}
