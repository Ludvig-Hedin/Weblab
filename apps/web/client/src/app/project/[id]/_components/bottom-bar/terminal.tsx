'use client';

import '@xterm/xterm/css/xterm.css';

import { memo, useEffect, useRef } from 'react';
import { type ITheme } from '@xterm/xterm';
import { observer } from 'mobx-react-lite';
import { useTheme } from 'next-themes';

import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';

interface TerminalProps {
    hidden: boolean;
    terminalSessionId: string;
    branchId?: string;
    isActive?: boolean;
}

// Both themes render on a TRANSPARENT background so the panel's `bg-background`
// is the single continuous surface — no pure-black xterm rectangle nested inside
// the panel (the old `DARK: {}` fell back to xterm's #000 default → the harsh
// "card-in-a-card" look). Foreground + ANSI palette are tuned to the Weblab
// tokens so terminal output matches the rest of the editor chrome.
const TERMINAL_THEME: Record<'LIGHT' | 'DARK', ITheme> = {
    LIGHT: {
        background: 'rgba(0,0,0,0)',
        foreground: '#2d2d2d',
        cursor: '#333333',
        cursorAccent: '#f7f7f4',
        selectionBackground: 'rgba(0,0,0,0.12)',
        black: '#2d2d2d',
        red: '#c0392b',
        green: '#0b953f',
        yellow: '#b8860b',
        blue: '#0169cc',
        magenta: '#7e3bd0',
        cyan: '#0e7490',
        white: '#5c5c5c',
        brightBlack: '#939393',
        brightRed: '#e35446',
        brightGreen: '#16a34a',
        brightYellow: '#d9a23a',
        brightBlue: '#3b82f6',
        brightMagenta: '#9333ea',
        brightCyan: '#0891b2',
        brightWhite: '#1a1a1a',
    },
    DARK: {
        background: 'rgba(0,0,0,0)',
        foreground: '#e4e4e4',
        cursor: '#e4e4e4',
        cursorAccent: '#181818',
        selectionBackground: 'rgba(255,255,255,0.16)',
        black: '#3f3f3f',
        red: '#e35446',
        green: '#6fc57e',
        yellow: '#d9a23a',
        blue: '#458ef7',
        magenta: '#bc69ff',
        cyan: '#3ebaf4',
        white: '#b2b2b2',
        brightBlack: '#717171',
        brightRed: '#ff6b5e',
        brightGreen: '#84d693',
        brightYellow: '#f0c75e',
        brightBlue: '#6fa8ff',
        brightMagenta: '#cf8bff',
        brightCyan: '#5fc8f5',
        brightWhite: '#ffffff',
    },
};

export const Terminal = memo(
    observer(({ hidden = false, terminalSessionId, branchId, isActive = true }: TerminalProps) => {
        const editorEngine = useEditorEngine();

        // Get terminal session from the appropriate branch's sandbox
        const terminalSession = branchId
            ? editorEngine.branches
                  .getSandboxById(branchId)
                  ?.session?.getTerminalSession(terminalSessionId)
            : editorEngine.activeSandbox?.session?.getTerminalSession(terminalSessionId);
        const containerRef = useRef<HTMLDivElement>(null);
        // resolvedTheme (not theme) so 'system' maps to the actual light/dark in
        // effect — otherwise system-light would wrongly get the dark palette.
        const { resolvedTheme } = useTheme();

        // Mount xterm to DOM
        useEffect(() => {
            if (hidden || !isActive || !containerRef.current || !terminalSession?.xterm) return;
            let fitTimeoutId: ReturnType<typeof setTimeout> | null = null;
            // Only open if not already attached
            if (
                !terminalSession.xterm.element ||
                terminalSession.xterm.element.parentElement !== containerRef.current
            ) {
                terminalSession.xterm.open(containerRef.current);
                // Ensure proper sizing after opening
                fitTimeoutId = setTimeout(() => {
                    if (terminalSession?.fitAddon && containerRef.current && !hidden && isActive) {
                        terminalSession.fitAddon.fit();
                    }
                }, 100);
            }
            return () => {
                if (fitTimeoutId) clearTimeout(fitTimeoutId);
                // Detach xterm from DOM on unmount (but do not dispose)
                if (
                    terminalSession?.xterm?.element &&
                    containerRef.current &&
                    terminalSession?.xterm?.element?.parentElement === containerRef.current
                ) {
                    containerRef.current.innerHTML = '';
                }
            };
        }, [terminalSessionId, terminalSession, branchId, hidden, isActive]);

        useEffect(() => {
            if (terminalSession?.xterm) {
                terminalSession.xterm.options.theme =
                    resolvedTheme === 'light' ? TERMINAL_THEME.LIGHT : TERMINAL_THEME.DARK;
                terminalSession.xterm.refresh(0, terminalSession.xterm.rows - 1);
            }
        }, [resolvedTheme, terminalSession]);

        useEffect(() => {
            let timeoutId: ReturnType<typeof setTimeout> | null = null;
            if (!hidden && isActive && terminalSession?.xterm) {
                timeoutId = setTimeout(() => {
                    terminalSession.xterm?.focus();
                    // Fit terminal when it becomes visible
                    if (terminalSession.fitAddon) {
                        terminalSession.fitAddon.fit();
                    }
                }, 100);
            }
            return () => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
            };
        }, [hidden, isActive, terminalSession]);

        // Handle container resize
        useEffect(() => {
            if (!containerRef.current || !terminalSession?.fitAddon || hidden || !isActive) return;

            const resizeObserver = new ResizeObserver(() => {
                if (!hidden && isActive) {
                    terminalSession.fitAddon?.fit();
                }
            });

            resizeObserver.observe(containerRef.current);

            return () => {
                resizeObserver.disconnect();
            };
        }, [terminalSession, hidden, isActive]);

        return (
            <div
                ref={containerRef}
                className={cn(
                    'h-full w-full px-3 py-2 transition-opacity duration-200',
                    hidden ? 'opacity-0' : 'opacity-100 delay-300',
                )}
            />
        );
    }),
);
