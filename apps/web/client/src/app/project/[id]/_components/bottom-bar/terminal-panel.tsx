'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';

import { Icons } from '@weblab/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import type { CLISession } from '@/components/store/editor/sandbox/terminal';
import { useEditorEngine } from '@/components/store/editor';
import { CLISessionType } from '@/components/store/editor/sandbox/terminal';
import { Terminal } from './terminal';
import { TerminalInput } from './terminal-input';

export interface TerminalTab {
    key: string;
    name: string;
    branchName: string;
    branchId: string;
    sessionId: string;
    type: CLISessionType;
    session: CLISession;
}

interface TerminalPanelProps {
    tabs: TerminalTab[];
    activeKey: string | null;
    onSelect: (key: string) => void;
    onClose: (key: string) => void;
    onNew: () => void;
    onReorder: (dragKey: string, targetKey: string) => void;
    projectId: string;
}

const HEIGHT_KEY = 'weblab:terminal-height';
const MIN_HEIGHT = 160;
const MAX_HEIGHT = 720;
const DEFAULT_HEIGHT = 352; // 22rem — the previous fixed height.

// The box is anchored at the screen bottom and grows upward, so cap the height
// against the viewport too (leave room for the top bar) — otherwise dragging
// tall on a short screen pushes the panel over the editor chrome.
const clampHeight = (h: number) => {
    const viewportCap =
        typeof window !== 'undefined' ? Math.max(MIN_HEIGHT, window.innerHeight - 180) : MAX_HEIGHT;
    return Math.min(MAX_HEIGHT, viewportCap, Math.max(MIN_HEIGHT, h));
};

export const TerminalPanel = observer(
    ({ tabs, activeKey, onSelect, onClose, onNew, onReorder, projectId }: TerminalPanelProps) => {
        const editorEngine = useEditorEngine();
        const [height, setHeight] = useState(DEFAULT_HEIGHT);
        const [dragKey, setDragKey] = useState<string | null>(null);
        const resizeStart = useRef<{ y: number; height: number } | null>(null);
        // Mirror height into a ref so the pointer-up handler can persist the
        // latest value synchronously without a side effect inside setState.
        const heightRef = useRef(DEFAULT_HEIGHT);

        // Hydrate persisted height after mount (avoid SSR mismatch).
        useEffect(() => {
            try {
                const raw = window.localStorage.getItem(HEIGHT_KEY);
                if (raw) setHeight(clampHeight(parseInt(raw, 10) || DEFAULT_HEIGHT));
            } catch {
                // ignore
            }
        }, []);

        useEffect(() => {
            heightRef.current = height;
        }, [height]);

        const onResizePointerMove = useCallback((e: PointerEvent) => {
            if (!resizeStart.current) return;
            // Drag the top edge up → taller. dy negative when moving up.
            const dy = e.clientY - resizeStart.current.y;
            setHeight(clampHeight(resizeStart.current.height - dy));
        }, []);

        const onResizePointerUp = useCallback(() => {
            resizeStart.current = null;
            window.removeEventListener('pointermove', onResizePointerMove);
            window.removeEventListener('pointerup', onResizePointerUp);
            try {
                window.localStorage.setItem(HEIGHT_KEY, String(heightRef.current));
            } catch {
                // ignore
            }
        }, [onResizePointerMove]);

        const onResizePointerDown = useCallback(
            (e: React.PointerEvent) => {
                e.preventDefault();
                resizeStart.current = { y: e.clientY, height };
                window.addEventListener('pointermove', onResizePointerMove);
                window.addEventListener('pointerup', onResizePointerUp);
            },
            [height, onResizePointerMove, onResizePointerUp],
        );

        useEffect(() => {
            return () => {
                window.removeEventListener('pointermove', onResizePointerMove);
                window.removeEventListener('pointerup', onResizePointerUp);
            };
        }, [onResizePointerMove, onResizePointerUp]);

        // Resolve the active interactive terminal + its branch session so the
        // input row can write commands into the right PTY.
        const activeTab = activeKey ? (tabs.find((t) => t.key === activeKey) ?? null) : null;
        const activeTerminal =
            activeTab && activeTab.type === CLISessionType.TERMINAL ? activeTab.session : null;
        const branchSession = activeTab
            ? (editorEngine.branches.getSandboxById(activeTab.branchId)?.session ?? null)
            : null;

        const handleRun = useCallback(
            (command: string) => {
                if (!activeTerminal) return;
                if (activeTerminal.terminal) {
                    // Real PTY: write the line + carriage return. The shell echoes
                    // it back through onOutput → xterm, so we don't pre-echo.
                    void activeTerminal.terminal.write(command + '\r');
                } else if (branchSession) {
                    // PTY never attached (cold-boot / stubbed provider): fall back
                    // to a one-shot runCommand and echo into this tab's xterm so
                    // the user still sees the command and its output.
                    const xterm = activeTerminal.xterm;
                    // Guard every write: if the user closes the tab mid-command the
                    // xterm is disposed, and write-after-dispose throws (optional
                    // chaining only guards null, not a disposed instance).
                    const safeWrite = (data: string) => {
                        try {
                            xterm?.write(data);
                        } catch {
                            // tab closed / xterm disposed — drop the write
                        }
                    };
                    safeWrite(`\r\n$ ${command}\r\n`);
                    void branchSession.runCommand(command, safeWrite).then((res) => {
                        // runCommand resolves (never rejects) with success/error — it
                        // streams stdout but not the failure message, so surface it
                        // here, otherwise a failed fallback command looks like it
                        // silently did nothing.
                        if (!res.success && res.error) {
                            safeWrite(`\r\n\x1b[31m${res.error}\x1b[0m\r\n`);
                        }
                    });
                }
            },
            [activeTerminal, branchSession],
        );

        return (
            <div
                className="bg-background border-border/60 mb-1 flex w-[40rem] max-w-[80vw] flex-col overflow-hidden rounded-lg border"
                style={{ height }}
            >
                {/* Resize handle — drag the top edge to grow/shrink height. */}
                <div
                    onPointerDown={onResizePointerDown}
                    className="group flex h-2 w-full shrink-0 cursor-ns-resize items-center justify-center"
                    aria-label="Resize terminal"
                    role="separator"
                >
                    <div className="bg-border group-hover:bg-foreground-tertiary h-0.5 w-8 rounded-full transition-colors" />
                </div>

                {/* Tab strip — flat header (hairline divider, quiet text tabs) so
                    the panel reads as one continuous surface, not stacked cards. */}
                <div className="border-border/50 flex items-center gap-1 border-b px-2 pb-1.5">
                    <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
                        {tabs.map((tab) => {
                            const isActive = tab.key === activeKey;
                            const closable = tab.type === CLISessionType.TERMINAL;
                            return (
                                <div
                                    key={tab.key}
                                    role="tab"
                                    aria-selected={isActive}
                                    tabIndex={0}
                                    draggable
                                    onDragStart={() => setDragKey(tab.key)}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        if (dragKey && dragKey !== tab.key) {
                                            onReorder(dragKey, tab.key);
                                        }
                                        setDragKey(null);
                                    }}
                                    onDragEnd={() => setDragKey(null)}
                                    onClick={() => onSelect(tab.key)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            onSelect(tab.key);
                                        }
                                    }}
                                    className={cn(
                                        'group text-small flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors select-none',
                                        isActive
                                            ? 'bg-background-tertiary text-foreground'
                                            : 'text-foreground-secondary hover:text-foreground hover:bg-background-secondary',
                                        dragKey === tab.key && 'opacity-50',
                                    )}
                                >
                                    <span
                                        className="truncate"
                                        title={`${tab.name} • ${tab.branchName}`}
                                    >
                                        {tab.name} • {tab.branchName}
                                    </span>
                                    {closable && (
                                        <button
                                            type="button"
                                            aria-label={`Close ${tab.name}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onClose(tab.key);
                                            }}
                                            className={cn(
                                                'hover:bg-background-bar-active flex h-4 w-4 items-center justify-center rounded-full transition-colors',
                                                isActive
                                                    ? 'text-foreground-tertiary hover:text-foreground'
                                                    : 'text-foreground/40 hover:text-foreground opacity-0 group-hover:opacity-100',
                                            )}
                                        >
                                            <Icons.CrossS className="h-2.5 w-2.5" />
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                type="button"
                                onClick={onNew}
                                aria-label="New terminal"
                                className="text-foreground-tertiary hover:text-foreground-hover hover:bg-background-bar-active flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent transition-colors"
                            >
                                <Icons.Plus className="h-4 w-4" />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent sideOffset={5} hideArrow>
                            New terminal
                        </TooltipContent>
                    </Tooltip>
                </div>

                {/* Terminal bodies — all mounted (PTYs stay warm across switches),
                    only the active one is visible/interactive. */}
                <div className="relative min-h-0 flex-1">
                    {tabs.length > 0 ? (
                        tabs.map((tab) => {
                            const isActive = tab.key === activeKey;
                            return (
                                <div
                                    key={tab.key}
                                    className={cn(
                                        'absolute inset-0',
                                        isActive ? 'z-10' : 'pointer-events-none -z-10 opacity-0',
                                    )}
                                >
                                    <Terminal
                                        hidden={!isActive}
                                        isActive={isActive}
                                        terminalSessionId={tab.sessionId}
                                        branchId={tab.branchId}
                                    />
                                </div>
                            );
                        })
                    ) : (
                        <div className="text-muted-foreground flex h-full items-center justify-center">
                            <span className="text-small">
                                No terminal open. Start the app to open one.
                            </span>
                        </div>
                    )}
                </div>

                {/* Command input — type a command, or toggle AI to use natural language. */}
                <TerminalInput projectId={projectId} canRun={!!activeTerminal} onRun={handleRun} />
            </div>
        );
    },
);
