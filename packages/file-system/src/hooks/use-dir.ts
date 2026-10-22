'use client';

import { useEffect, useState } from 'react';

import { type FileEntry } from '../types';
import { useFS } from './use-fs';

export function useDirectory(projectId: string, branchId: string, path: string) {
    const { fs, isInitializing, error: fsError } = useFS(projectId, branchId);
    const [entries, setEntries] = useState<FileEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!fs) return;
        let cancelled = false;
        let running = false;
        let pending = false;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const loadDirectory = async () => {
            if (cancelled || running) return;
            running = true;
            pending = false;
            try {
                const dirEntries = await fs.readDirectory(path);
                if (cancelled) return;
                setEntries(dirEntries);
                setError(null);
                setIsLoading(false);
            } catch (err) {
                if (cancelled) return;
                setError(err instanceof Error ? err : new Error('Unknown error'));
                setEntries([]);
                setIsLoading(false);
            } finally {
                running = false;
                if (!cancelled && pending) scheduleRefresh();
            }
        };

        // A snapshot can update hundreds of files. Coalesce their events into
        // one scan, with one trailing refresh for changes arriving mid-scan.
        const scheduleRefresh = () => {
            if (cancelled) return;
            pending = true;
            if (running) return;
            if (timer !== null) clearTimeout(timer);
            timer = setTimeout(() => {
                timer = null;
                void loadDirectory();
            }, 50);
        };

        const unsubscribe = fs.watchDirectory(path, scheduleRefresh);
        void loadDirectory();
        return () => {
            cancelled = true;
            pending = false;
            if (timer !== null) clearTimeout(timer);
            unsubscribe();
        };
    }, [fs, path, projectId, branchId]);

    useEffect(() => {
        setIsLoading(true);
    }, [projectId, branchId, path]);

    // Type guards are used below to ensure that the resultant type is correct
    if (isInitializing || isLoading) {
        return { entries: [], loading: true, error: null };
    }

    if (error ?? fsError) {
        return { entries: [], loading: false, error: error ?? fsError };
    }

    return { entries, loading: false, error: null };
}

export type UseDirectoryResult = ReturnType<typeof useDirectory>;
