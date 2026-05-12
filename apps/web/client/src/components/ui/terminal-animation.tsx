'use client';

import type { ReactNode } from 'react';
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import { cn } from '@/lib/utils';

export interface TerminalLine {
    text: string;
    color?: string;
    delay?: number;
}

export interface TabContent {
    label: string;
    command: string;
    lines: TerminalLine[];
}

interface TerminalAnimationContextValue {
    tabs: TabContent[];
    activeTabIndex: number;
    setActiveTabIndex: (i: number) => void;
    typedCommand: string;
    visibleLineCount: number;
    isComplete: boolean;
    hideCursorOnComplete: boolean;
    alwaysDark: boolean;
}

const TerminalAnimationContext = createContext<TerminalAnimationContextValue | null>(null);

function useTerminalAnimation() {
    const ctx = useContext(TerminalAnimationContext);
    if (!ctx) {
        throw new Error(
            'TerminalAnimation subcomponents must be used inside <TerminalAnimationRoot>',
        );
    }
    return ctx;
}

const COMMAND_TYPE_INTERVAL_MS = 35;

export interface TerminalAnimationRootProps {
    tabs: TabContent[];
    defaultActiveTab?: number;
    hideCursorOnComplete?: boolean;
    alwaysDark?: boolean;
    backgroundImage?: string;
    /** When true, auto-advance to next tab after each animation completes. */
    loopTabs?: boolean;
    /** Pause (ms) after completion before advancing to next tab. */
    loopDelayMs?: number;
    className?: string;
    children?: ReactNode;
}

export function TerminalAnimationRoot({
    tabs,
    defaultActiveTab = 0,
    hideCursorOnComplete = false,
    alwaysDark = false,
    backgroundImage,
    loopTabs = false,
    loopDelayMs = 1800,
    className,
    children,
}: TerminalAnimationRootProps) {
    const [activeTabIndex, setActiveTabIndex] = useState(defaultActiveTab);
    const [typedCommand, setTypedCommand] = useState('');
    const [visibleLineCount, setVisibleLineCount] = useState(0);
    const [isComplete, setIsComplete] = useState(false);
    const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

    const clearTimers = useCallback(() => {
        timersRef.current.forEach((t) => clearTimeout(t));
        timersRef.current = [];
    }, []);

    useEffect(() => {
        clearTimers();
        setTypedCommand('');
        setVisibleLineCount(0);
        setIsComplete(false);

        const tab = tabs[activeTabIndex];
        if (!tab) return;

        let charIdx = 0;
        const typeNextChar = () => {
            charIdx += 1;
            setTypedCommand(tab.command.slice(0, charIdx));
            if (charIdx < tab.command.length) {
                const t = setTimeout(typeNextChar, COMMAND_TYPE_INTERVAL_MS);
                timersRef.current.push(t);
            } else {
                let cumulative = 0;
                tab.lines.forEach((line, i) => {
                    cumulative += line.delay ?? 100;
                    const t = setTimeout(() => {
                        setVisibleLineCount(i + 1);
                        if (i === tab.lines.length - 1) {
                            setIsComplete(true);
                        }
                    }, cumulative);
                    timersRef.current.push(t);
                });
                if (tab.lines.length === 0) {
                    setIsComplete(true);
                }
            }
        };

        const initial = setTimeout(typeNextChar, COMMAND_TYPE_INTERVAL_MS);
        timersRef.current.push(initial);

        return () => clearTimers();
    }, [activeTabIndex, tabs, clearTimers]);

    useEffect(() => {
        if (!loopTabs || !isComplete || tabs.length <= 1) return;
        const t = setTimeout(() => {
            setActiveTabIndex((i) => (i + 1) % tabs.length);
        }, loopDelayMs);
        return () => clearTimeout(t);
    }, [loopTabs, isComplete, tabs.length, loopDelayMs]);

    const value = useMemo<TerminalAnimationContextValue>(
        () => ({
            tabs,
            activeTabIndex,
            setActiveTabIndex,
            typedCommand,
            visibleLineCount,
            isComplete,
            hideCursorOnComplete,
            alwaysDark,
        }),
        [
            tabs,
            activeTabIndex,
            typedCommand,
            visibleLineCount,
            isComplete,
            hideCursorOnComplete,
            alwaysDark,
        ],
    );

    const style = backgroundImage
        ? {
              backgroundImage: `url(${backgroundImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
          }
        : undefined;

    return (
        <TerminalAnimationContext.Provider value={value}>
            <div className={cn('relative', alwaysDark && 'dark', className)} style={style}>
                {children}
            </div>
        </TerminalAnimationContext.Provider>
    );
}

export function TerminalAnimationBackgroundGradient({ className }: { className?: string }) {
    return (
        <div
            aria-hidden
            className={cn(
                'pointer-events-none absolute inset-0 -z-0',
                'bg-[radial-gradient(ellipse_at_center,_color-mix(in srgb, var(--foreground-brand) 10%, transparent),_transparent_65%)]',
                className,
            )}
        />
    );
}

export function TerminalAnimationContainer({
    className,
    children,
}: {
    className?: string;
    children?: ReactNode;
}) {
    return <div className={cn('relative z-10 w-full px-4', className)}>{children}</div>;
}

export function TerminalAnimationWindow({
    className,
    children,
}: {
    className?: string;
    children?: ReactNode;
}) {
    return (
        <div
            className={cn(
                'rounded-xl border border-white/10 bg-[#0b0b0d]/95 shadow-2xl backdrop-blur',
                className,
            )}
        >
            <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
            </div>
            {children}
        </div>
    );
}

export function TerminalAnimationContent({
    className,
    children,
}: {
    className?: string;
    children?: ReactNode;
}) {
    return <div className={cn('px-5 py-4', className)}>{children}</div>;
}

export function TerminalAnimationBlinkingCursor({ className }: { className?: string }) {
    return (
        <span
            aria-hidden
            className={cn(
                'inline-block h-3.5 w-2 translate-y-[1px] animate-pulse bg-white/90 md:h-4',
                className,
            )}
        />
    );
}

export interface TerminalAnimationCommandBarProps {
    className?: string;
    cursor?: ReactNode;
}

export function TerminalAnimationCommandBar({
    className,
    cursor,
}: TerminalAnimationCommandBarProps) {
    const { typedCommand, tabs, activeTabIndex, isComplete, hideCursorOnComplete } =
        useTerminalAnimation();
    const tab = tabs[activeTabIndex];
    const commandFullyTyped = !!tab && typedCommand.length >= tab.command.length;
    const showCursor = !(hideCursorOnComplete && isComplete);

    return (
        <span className={cn('inline-flex items-center', className)}>
            <span>{typedCommand}</span>
            {!commandFullyTyped && cursor}
            {commandFullyTyped && showCursor && !isComplete && cursor}
        </span>
    );
}

export interface TerminalAnimationOutputProps {
    className?: string;
    renderLine: (line: TerminalLine, index: number, visible: boolean) => ReactNode;
}

export function TerminalAnimationOutput({ className, renderLine }: TerminalAnimationOutputProps) {
    const { tabs, activeTabIndex, visibleLineCount } = useTerminalAnimation();
    const tab = tabs[activeTabIndex];
    if (!tab) return null;
    return (
        <div className={className}>
            {tab.lines.map((line, i) => (
                <React.Fragment key={i}>{renderLine(line, i, i < visibleLineCount)}</React.Fragment>
            ))}
        </div>
    );
}

export function TerminalAnimationTrailingPrompt({
    className,
    children,
}: {
    className?: string;
    children?: ReactNode;
}) {
    const { isComplete, hideCursorOnComplete } = useTerminalAnimation();
    if (!isComplete || hideCursorOnComplete) return null;
    return <div className={className}>{children}</div>;
}

export function TerminalAnimationTabList({
    className,
    children,
}: {
    className?: string;
    children?: ReactNode;
}) {
    return (
        <div className={className} role="tablist">
            {children}
        </div>
    );
}

export interface TerminalAnimationTabTriggerProps {
    index: number;
    className?: string;
    children?: ReactNode;
}

export function TerminalAnimationTabTrigger({
    index,
    className,
    children,
}: TerminalAnimationTabTriggerProps) {
    const { activeTabIndex, setActiveTabIndex } = useTerminalAnimation();
    const state = activeTabIndex === index ? 'active' : 'inactive';
    return (
        <button
            aria-selected={state === 'active'}
            className={className}
            data-state={state}
            onClick={() => setActiveTabIndex(index)}
            role="tab"
            type="button"
        >
            {children}
        </button>
    );
}

export function TerminalAnimationCommandBarLabel({ children }: { children?: ReactNode }) {
    return <span className="select-none">{children}</span>;
}
