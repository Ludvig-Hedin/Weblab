'use client';

import { useEffect, useRef, useState } from 'react';

import type { ProjectListItem } from './project-card-utils';
import { api } from '@/trpc/react';

const STALE_MS = 24 * 60 * 60 * 1000; // 24h — cards older than this re-capture
const CONCURRENCY = 3;
const GAP_MS = 250;

interface BackfillState {
    inFlight: Set<string>;
    completed: number;
    total: number;
}

const isStale = (project: ProjectListItem): boolean => {
    const preview = project.metadata?.previewImg ?? null;
    if (!preview) {
        return true;
    }
    if (!preview.updatedAt) {
        return true;
    }
    const captured = new Date(preview.updatedAt).getTime();
    return Number.isFinite(captured) && Date.now() - captured > STALE_MS;
};

/**
 * Captures fresh previews for projects whose stored screenshot is missing or
 * stale. Runs with a small concurrency pool so a heavy account doesn't queue
 * dozens of serial Firecrawl calls — each card flips from fallback → image
 * within a few seconds of being eligible.
 *
 * The server-side procedure has its own 30-min dedupe guard, so this hook
 * is intentionally fire-and-forget: re-entering the page while captures are
 * still warm is cheap.
 */
export function useScreenshotBackfill(projects: ProjectListItem[]) {
    const utils = api.useUtils();
    const captureMutation = api.project.captureScreenshot.useMutation();
    const captureRef = useRef(captureMutation);
    captureRef.current = captureMutation;
    const utilsRef = useRef(utils);
    utilsRef.current = utils;

    const [state, setState] = useState<BackfillState>({
        inFlight: new Set(),
        completed: 0,
        total: 0,
    });

    // Stable key drives re-runs when the candidate set actually changes
    // (project added / deleted / preview refreshed by another tab). A new
    // identity on every render would otherwise restart the queue every time
    // the parent re-renders, doubling up requests.
    const projectIdsKey = projects.map((project) => project.id).join('|');

    useEffect(() => {
        const candidates = projects.filter(isStale);
        if (candidates.length === 0) {
            // Reset progress so a previous run's whisper line disappears
            // once everything is fresh.
            setState((prev) =>
                prev.total === 0 && prev.inFlight.size === 0
                    ? prev
                    : { inFlight: new Set(), completed: 0, total: 0 },
            );
            return;
        }

        let cancelled = false;
        setState({
            inFlight: new Set(),
            completed: 0,
            total: candidates.length,
        });

        const captureOne = async (project: ProjectListItem) => {
            if (cancelled) return;
            setState((prev) => {
                const next = new Set(prev.inFlight);
                next.add(project.id);
                return { ...prev, inFlight: next };
            });
            try {
                await captureRef.current.mutateAsync({ projectId: project.id });
                if (!cancelled) {
                    await utilsRef.current.project.list.invalidate();
                }
            } catch (error) {
                console.warn('Preview backfill failed for', project.id, error);
            } finally {
                if (!cancelled) {
                    setState((prev) => {
                        const next = new Set(prev.inFlight);
                        next.delete(project.id);
                        return {
                            ...prev,
                            inFlight: next,
                            completed: prev.completed + 1,
                        };
                    });
                }
            }
        };

        const queue = [...candidates];
        const runWorker = async () => {
            while (!cancelled) {
                const next = queue.shift();
                if (!next) return;
                await captureOne(next);
                if (cancelled) return;
                if (GAP_MS > 0) {
                    await new Promise((resolve) => setTimeout(resolve, GAP_MS));
                }
            }
        };

        const workerCount = Math.min(CONCURRENCY, queue.length);
        for (let i = 0; i < workerCount; i++) {
            void runWorker();
        }

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectIdsKey]);

    return state;
}
