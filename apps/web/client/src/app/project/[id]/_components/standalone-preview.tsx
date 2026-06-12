'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useAction } from 'convex/react';

import { DEVICE_OPTIONS } from '@weblab/constants';
import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { Switch } from '@weblab/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import type { Id } from '@convex/_generated/dataModel';
import { planReload } from './canvas/frame/frame-reload-policy';
import { toPreviewableUrl } from './canvas/frame/preview-url';

const AUTO_RECOVER_STORAGE_KEY = 'weblab.preview.popout.autoRecover';
const WIDTH_STORAGE_KEY = 'weblab.preview.popout.width';

// Gentle heartbeat once the sandbox is healthy — cheap server-side HEAD that
// lets us notice a later recycle and re-arm the auto-recover loop.
const HEARTBEAT_MS = 20_000;
// Let the initial iframe load attempt happen before the first probe.
const INITIAL_PROBE_DELAY_MS = 1_500;

type Status = 'connecting' | 'live' | 'reconnecting';

function readBool(key: string, fallback: boolean): boolean {
    if (typeof window === 'undefined') return fallback;
    try {
        const raw = window.localStorage.getItem(key);
        return raw === null ? fallback : raw === 'true';
    } catch {
        return fallback;
    }
}

function readNumber(key: string): number | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return null;
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
        return null;
    }
}

/**
 * Resilient, full-window preview of a cloud (Vercel sandbox) dev server.
 *
 * Hot reload comes free from the dev server's own HMR — this tab is just
 * another client of the live URL. The value this component adds over a raw
 * tab is **auto-recovery**: it polls the sandbox liveness (reusing the same
 * `checkSandboxLiveness` action + `planReload` schedule as the editor canvas)
 * and remounts the iframe on cold-boot / recycle / network errors, showing a
 * non-blocking "Reconnecting" chip instead of leaving a dead page.
 *
 * It cannot suppress Next.js's own in-iframe compile-error overlay (that's the
 * dev server's UI inside a cross-origin frame) — the toggle governs only this
 * self-heal loop.
 */
export function StandalonePreview({
    projectId: _projectId,
    branchId,
    url,
}: {
    projectId: Id<'projects'>;
    branchId: Id<'branches'>;
    url: string;
}) {
    const checkLiveness = useAction(api.projectActions.checkSandboxLiveness);
    const src = toPreviewableUrl(url);

    const [reloadKey, setReloadKey] = useState(0);
    const [autoRecover, setAutoRecover] = useState(() => readBool(AUTO_RECOVER_STORAGE_KEY, true));
    const [width, setWidth] = useState<number | null>(() => readNumber(WIDTH_STORAGE_KEY));
    const [status, setStatus] = useState<Status>('connecting');

    const attemptRef = useRef(0);

    const reload = useCallback(() => {
        attemptRef.current = 0;
        setReloadKey((k) => k + 1);
    }, []);

    // Persist controls.
    useEffect(() => {
        try {
            window.localStorage.setItem(AUTO_RECOVER_STORAGE_KEY, String(autoRecover));
        } catch {
            // storage blocked — ignore
        }
    }, [autoRecover]);

    useEffect(() => {
        try {
            if (width === null) window.localStorage.removeItem(WIDTH_STORAGE_KEY);
            else window.localStorage.setItem(WIDTH_STORAGE_KEY, String(width));
        } catch {
            // storage blocked — ignore
        }
    }, [width]);

    // Auto-recover loop. A single chained-timeout poller; cancelled on unmount
    // or when the toggle flips off. `reloadKey` is intentionally NOT a dep —
    // bumping it here must not restart the loop.
    useEffect(() => {
        if (!autoRecover) {
            setStatus('live');
            attemptRef.current = 0;
            return;
        }

        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        setStatus(attemptRef.current > 0 ? 'reconnecting' : 'connecting');

        const schedule = (ms: number) => {
            timer = setTimeout(() => void probe(), ms);
        };

        const probe = async () => {
            if (cancelled) return;
            let alive = false;
            try {
                const res = await checkLiveness({ branchId, previewUrl: url });
                alive = res.state === 'alive';
            } catch {
                alive = false;
            }
            if (cancelled) return;

            if (alive) {
                // Transition unhealthy → healthy: remount once to reconnect cleanly.
                if (attemptRef.current > 0) {
                    attemptRef.current = 0;
                    setReloadKey((k) => k + 1);
                }
                setStatus('live');
                schedule(HEARTBEAT_MS);
            } else {
                attemptRef.current += 1;
                setStatus('reconnecting');
                const plan = planReload(attemptRef.current);
                setReloadKey((k) => k + 1);
                schedule(plan.delayMs);
            }
        };

        schedule(INITIAL_PROBE_DELAY_MS);
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [autoRecover, branchId, url, checkLiveness]);

    const applyDeviceSize = useCallback((dimensions: string) => {
        const [w] = dimensions.split('x').map(Number);
        if (typeof w === 'number' && Number.isFinite(w) && w > 0) setWidth(w);
    }, []);

    const widthLabel = width === null ? 'Full width' : `${Math.round(width)}px`;

    return (
        <div className="bg-background-canvas fixed inset-0 flex flex-col">
            <header className="bg-background-chrome border-border-bar flex h-12 shrink-0 items-center gap-2 border-b px-3">
                <div className="flex flex-1 items-center gap-2 overflow-hidden">
                    <Icons.Globe className="text-foreground-tertiary h-4 w-4 shrink-0" />
                    <span className="text-foreground-secondary truncate text-xs">{src}</span>
                </div>

                <div className="flex items-center gap-1.5">
                    {/* Width / device selector */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="bg-background-bar-active text-foreground-primary hover:bg-background-bar-active h-8 gap-1.5 rounded-md px-2.5 text-xs"
                            >
                                <span>{widthLabel}</span>
                                <Icons.ChevronDown className="text-foreground-tertiary h-3.5 w-3.5" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="max-h-[60vh] overflow-y-auto">
                            <DropdownMenuItem onSelect={() => setWidth(null)}>
                                Full width
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {Object.entries(DEVICE_OPTIONS)
                                .filter(([category]) => category !== 'Custom')
                                .map(([category, devices]) => (
                                    <DropdownMenuGroup key={category}>
                                        <DropdownMenuLabel className="text-mini text-foreground-tertiary">
                                            {category}
                                        </DropdownMenuLabel>
                                        {Object.entries(devices).map(([name, dimensions]) => (
                                            <DropdownMenuItem
                                                key={`${category}:${name}`}
                                                onSelect={() => applyDeviceSize(dimensions)}
                                                className="flex items-center gap-3"
                                            >
                                                <span className="flex-1">{name}</span>
                                                <span className="text-foreground-tertiary text-micro tabular-nums">
                                                    {dimensions.replace('x', '×')}
                                                </span>
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuGroup>
                                ))}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Manual reload */}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Reload preview"
                                onClick={reload}
                                className="text-foreground-secondary hover:text-foreground-primary hover:bg-background-bar-active h-8 w-8 rounded-md"
                            >
                                <Icons.Reload className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" hideArrow>
                            Reload
                        </TooltipContent>
                    </Tooltip>

                    {/* Open raw URL */}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <a href={src} target="_blank" rel="noopener noreferrer">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Open raw URL"
                                    className="text-foreground-secondary hover:text-foreground-primary hover:bg-background-bar-active h-8 w-8 rounded-md"
                                >
                                    <Icons.ExternalLink className="h-4 w-4" />
                                </Button>
                            </a>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" hideArrow>
                            Open raw URL
                        </TooltipContent>
                    </Tooltip>

                    {/* Auto-recover toggle */}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <label
                                htmlFor="popout-auto-recover"
                                className="hover:bg-background-bar-active flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2"
                            >
                                <span className="text-foreground-secondary text-xs">
                                    Auto-recover
                                </span>
                                <Switch
                                    id="popout-auto-recover"
                                    checked={autoRecover}
                                    onCheckedChange={setAutoRecover}
                                    aria-label="Auto-recover on sandbox errors"
                                />
                            </label>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" hideArrow className="max-w-60">
                            Auto-reloads the preview when the sandbox cold-boots, recycles, or drops
                            the connection.
                        </TooltipContent>
                    </Tooltip>
                </div>
            </header>

            <div className="bg-background-canvas relative flex-1 overflow-auto">
                {status === 'reconnecting' && (
                    <div className="bg-background-secondary border-border/20 text-foreground-secondary absolute top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border px-3 py-1.5 text-xs shadow-sm">
                        <Icons.LoadingSpinner className="h-3 w-3 animate-spin" />
                        Reconnecting…
                    </div>
                )}
                <div
                    className={cn('mx-auto h-full', width === null ? 'w-full' : '')}
                    style={width === null ? undefined : { width: `${width}px`, maxWidth: '100%' }}
                >
                    <iframe
                        key={reloadKey}
                        title="Site preview"
                        src={src}
                        className="h-full w-full border-0 bg-white"
                    />
                </div>
            </div>
        </div>
    );
}
