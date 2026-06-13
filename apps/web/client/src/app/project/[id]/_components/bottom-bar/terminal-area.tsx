'use client';

import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { AnimatePresence, motion } from 'motion/react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';

import type { TerminalTab } from './terminal-panel';
import { useEditorEngine } from '@/components/store/editor';
import { RestartSandboxButton } from './restart-sandbox-button';
import { TerminalPanel } from './terminal-panel';

export const TerminalArea = observer(({ children }: { children: React.ReactNode }) => {
    const t = useTranslations('editor.terminal');
    const editorEngine = useEditorEngine();
    const branches = editorEngine.branches;

    // Collect terminal sessions from all branches, preserving branch order then
    // each branch's session-map order (which drag-to-reorder rewrites).
    const tabs: TerminalTab[] = [];
    let activeSessionId: string | null = null;

    for (const branch of branches.allBranches) {
        try {
            const branchData = branches.getBranchById(branch.id);
            if (!branchData) continue;

            const sandbox = branches.getSandboxById(branch.id);
            if (!sandbox?.session?.terminalSessions) continue;

            for (const [sessionId, session] of sandbox.session.terminalSessions) {
                const key = `${branch.id}-${sessionId}`;
                tabs.push({
                    key,
                    name: session.name,
                    branchName: branch.name,
                    branchId: branch.id,
                    sessionId,
                    type: session.type,
                    session: session,
                });

                if (
                    branch.id === branches.activeBranch.id &&
                    sessionId === sandbox.session.activeTerminalSessionId
                ) {
                    activeSessionId = key;
                }
            }
        } catch {
            // Skip branches that aren't properly initialized.
            continue;
        }
    }

    const [terminalHidden, setTerminalHidden] = useState(true);

    useEffect(() => {
        const handleToggle = () => setTerminalHidden((prev) => !prev);
        window.addEventListener('toggle-terminal', handleToggle);
        return () => window.removeEventListener('toggle-terminal', handleToggle);
    }, []);

    const sessionKeys = tabs.map((t) => t.key);

    const switchToSessionByKey = (key: string) => {
        const tab = tabs.find((t) => t.key === key);
        if (!tab) return;
        void editorEngine.branches.switchToBranch(tab.branchId);
        const sandbox = branches.getSandboxById(tab.branchId);
        // Guard `.session` — during sandbox cold-boot the branch can have a
        // sandbox record but no session yet; writing into `.session` would throw.
        if (sandbox?.session) {
            sandbox.session.activeTerminalSessionId = tab.sessionId;
        }
    };

    const handleClose = (key: string) => {
        const tab = tabs.find((t) => t.key === key);
        if (!tab) return;
        const sandbox = branches.getSandboxById(tab.branchId);
        void sandbox?.session?.disposeTerminal(tab.sessionId);
    };

    const handleNew = async () => {
        const active = branches.activeBranch;
        const sandbox = branches.getSandboxById(active.id);
        if (!sandbox?.session) {
            toast.error(t('sandboxNotReady'));
            return;
        }
        const id = await sandbox.session.createTerminalSession();
        if (!id) {
            toast.error(t('terminalUnavailable'));
        }
    };

    // Drag-to-reorder, scoped to a single branch (cross-branch interleaving
    // can't be represented in per-branch session maps). Same-branch reorder
    // covers the common single-branch project.
    const handleReorder = (dragKey: string, targetKey: string) => {
        const dragTab = tabs.find((t) => t.key === dragKey);
        const targetTab = tabs.find((t) => t.key === targetKey);
        if (!dragTab || !targetTab) return;
        if (dragTab.branchId !== targetTab.branchId) return;
        const session = branches.getSandboxById(dragTab.branchId)?.session;
        if (!session) return;

        const ids = tabs.filter((t) => t.branchId === dragTab.branchId).map((t) => t.sessionId);
        const fromIdx = ids.indexOf(dragTab.sessionId);
        const toIdx = ids.indexOf(targetTab.sessionId);
        if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

        const reordered = [...ids];
        const [moved] = reordered.splice(fromIdx, 1);
        if (moved === undefined) return;
        reordered.splice(toIdx, 0, moved);
        session.reorderTerminalSessions(reordered);
    };

    const cycleSession = (delta: 1 | -1) => {
        if (terminalHidden || sessionKeys.length < 2) return;
        const currentIndex = activeSessionId ? sessionKeys.indexOf(activeSessionId) : -1;
        const base = currentIndex === -1 ? 0 : currentIndex;
        const nextIndex = (base + delta + sessionKeys.length) % sessionKeys.length;
        const nextKey = sessionKeys[nextIndex];
        if (nextKey) switchToSessionByKey(nextKey);
    };

    useHotkeys(
        'mod+shift+]',
        (e) => {
            e.preventDefault();
            cycleSession(1);
        },
        {
            enabled: !terminalHidden && sessionKeys.length > 1,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [terminalHidden, sessionKeys.join('|'), activeSessionId],
    );

    useHotkeys(
        'mod+shift+[',
        (e) => {
            e.preventDefault();
            cycleSession(-1);
        },
        {
            enabled: !terminalHidden && sessionKeys.length > 1,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [terminalHidden, sessionKeys.join('|'), activeSessionId],
    );

    return (
        <>
            {/* Terminal card — slides up ABOVE the toolbar and grows the pill
                smoothly (height + fade). Rendered before the toolbar so the
                toolbar stays pinned at the bottom of the bottom-anchored pill;
                its icons never shift when the terminal opens. */}
            <AnimatePresence initial={false}>
                {!terminalHidden && (
                    <motion.div
                        key="terminal-card"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{
                            height: { type: 'spring', stiffness: 360, damping: 38 },
                            opacity: { duration: 0.18, ease: 'easeOut' },
                        }}
                        className="w-full overflow-hidden"
                    >
                        <TerminalPanel
                            tabs={tabs}
                            activeKey={activeSessionId}
                            onSelect={switchToSessionByKey}
                            onClose={handleClose}
                            onNew={() => void handleNew()}
                            onReorder={handleReorder}
                            projectId={editorEngine.projectId}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Bottom toolbar row — pinned at the bottom of the pill. Plain div
                (no layout animation) so opening the terminal never reflows the
                toolbar icons. */}
            <div className="flex w-full items-center gap-1">
                {children}
                <div className="ml-auto flex items-center gap-1">
                    <RestartSandboxButton />
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                onClick={() => setTerminalHidden((prev) => !prev)}
                                aria-label={t('toggleTerminal')}
                                aria-pressed={!terminalHidden}
                                className="hover:text-foreground-hover text-foreground-tertiary hover:bg-background-bar-active flex h-9 w-9 items-center justify-center rounded-md border border-transparent"
                            >
                                {terminalHidden ? <Icons.Terminal /> : <Icons.ChevronDown />}
                            </button>
                        </TooltipTrigger>
                        <TooltipContent sideOffset={5} hideArrow>
                            {t('toggleTerminal')}
                        </TooltipContent>
                    </Tooltip>
                </div>
            </div>
        </>
    );
});
