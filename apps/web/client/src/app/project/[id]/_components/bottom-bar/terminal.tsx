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

const TERMINAL_THEME: Record<'LIGHT' | 'DARK', ITheme> = {
    LIGHT: {
        background: '#ffffff',
        foreground: '#2d2d2d',
        cursor: '#333333',
        cursorAccent: '#ffffff',
        black: '#2d2d2d',
        red: '#d64646',
        green: '#4e9a06',
        yellow: '#c4a000',
        blue: '#3465a4',
        magenta: '#75507b',
        cyan: '#06989a',
        white: '#d3d7cf',
        brightBlack: '#555753',
        brightRed: '#ef2929',
        brightGreen: '#8ae234',
        brightYellow: '#fce94f',
        brightBlue: '#729fcf',
        brightMagenta: '#ad7fa8',
        brightCyan: '#34e2e2',
        brightWhite: '#eeeeec',
        selectionBackground: '#bfbfbf',
    },
    DARK: {}, // Use default dark theme
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
        const { theme } = useTheme();

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
                    theme === 'light' ? TERMINAL_THEME.LIGHT : TERMINAL_THEME.DARK;
            }
        }, [theme, terminalSession]);

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
                    'h-full w-full p-2 transition-opacity duration-200',
                    hidden ? 'opacity-0' : 'opacity-100 delay-300',
                )}
            />
        );
    }),
);
