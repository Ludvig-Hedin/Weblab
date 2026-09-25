'use client';

import { observer } from 'mobx-react-lite';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import { HotkeyLabel } from '@weblab/ui/hotkey-label';
import { Icons } from '@weblab/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';

import { Hotkey } from '@/components/hotkey';
import { useEditorEngine } from '@/components/store/editor';
import { useStateManager } from '@/components/store/state';
import { CurrentUserAvatar } from '@/components/ui/avatar-dropdown';
import { SettingsTabValue } from '@/components/ui/settings-modal/helpers';
import { transKeys } from '@/i18n/keys';
import { EDITOR_SCOPE } from '@/lib/editor-scope';
import { Members } from '../members';
import { BranchDisplay } from './branch';
import { ComponentEditCrumb } from './component-edit-crumb';
import { ConnectionChip } from './connection-chip';
import { CurrentPageSelector } from './current-page-selector';
import { DiffButton } from './diff';
import { GitActionsButton } from './git-actions';
import { ModeToggle } from './mode-toggle';
import { ProjectBreadcrumb } from './project-breadcrumb';
import { PublishButton } from './publish';

export const TopBar = observer(() => {
    const stateManager = useStateManager();
    const editorEngine = useEditorEngine();
    const t = useTranslations();

    const UNDO_REDO_BUTTONS = [
        {
            click: () => editorEngine.action.undo(),
            isDisabled: !editorEngine.history.canUndo || editorEngine.chat.isStreaming,
            hotkey: Hotkey.UNDO,
            icon: <Icons.Reset className="h-4 w-4" />,
        },
        {
            click: () => editorEngine.action.redo(),
            isDisabled: !editorEngine.history.canRedo || editorEngine.chat.isStreaming,
            hotkey: Hotkey.REDO,
            icon: <Icons.Reset className="h-4 w-4 scale-x-[-1]" />,
        },
    ];

    // 36px square (Button size="icon") — the old 32px targets were easy to miss.
    const headerIconBtnClass =
        'text-foreground-secondary hover:text-foreground-primary hover:bg-background-tertiary/60 rounded-md';

    return (
        <div className="bg-background-chrome border-border desktop-drag-region flex h-14 flex-row items-center justify-center border-b pr-3 pl-1.5">
            {/* Left: breadcrumb + branch. ConnectionChip hidden on mobile — too wide. */}
            <div className="flex flex-grow basis-0 flex-row items-center justify-start gap-1 overflow-hidden">
                <ProjectBreadcrumb />
                {EDITOR_SCOPE.branches && (
                    <>
                        <span className="text-foreground-secondary/50 text-small">/</span>
                        <BranchDisplay />
                    </>
                )}
                <CurrentPageSelector />
                {EDITOR_SCOPE.components && <ComponentEditCrumb />}
                <span className="ml-2 hidden md:block">
                    <ConnectionChip />
                </span>
            </div>

            {/* Center: mode toggle (dropdown on mobile, tabs on desktop) */}
            <ModeToggle />

            {/* Right: desktop shows all actions; mobile shows only avatar + publish */}
            <div className="flex flex-grow basis-0 items-center justify-end gap-1.5">
                {/* md+: undo/redo */}
                <motion.div
                    className="hidden md:flex md:items-center"
                    layout
                    transition={{ type: 'spring', stiffness: 300, damping: 30, delay: 0 }}
                >
                    {UNDO_REDO_BUTTONS.map(({ click, hotkey, icon, isDisabled }) => (
                        <Tooltip key={hotkey.description}>
                            <TooltipTrigger asChild>
                                <span>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className={headerIconBtnClass}
                                        onClick={click}
                                        disabled={isDisabled}
                                        aria-label={hotkey.description}
                                    >
                                        {icon}
                                    </Button>
                                </span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" hideArrow className="mt-2">
                                <HotkeyLabel hotkey={hotkey} />
                            </TooltipContent>
                        </Tooltip>
                    ))}
                </motion.div>

                {/* md+ only: history, diff, git actions, members */}
                <div className="hidden md:contents">
                    {EDITOR_SCOPE.versionHistory && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className={headerIconBtnClass}
                                onClick={() => {
                                    stateManager.setSettingsTab(SettingsTabValue.VERSIONS);
                                    stateManager.setIsSettingsModalOpen(true);
                                }}
                                aria-label={t(transKeys.editor.toolbar.versionHistory)}
                            >
                                <Icons.CounterClockwiseClock className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="mt-1" hideArrow>
                            <HotkeyLabel hotkey={Hotkey.OPEN_VERSION_HISTORY} />
                        </TooltipContent>
                    </Tooltip>
                    )}
                    {EDITOR_SCOPE.versionHistory && <DiffButton />}
                    <GitActionsButton />
                    {EDITOR_SCOPE.members && <Members />}
                </div>

                {/* Always visible: avatar + publish */}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <div className="flex items-center">
                            <CurrentUserAvatar className="hover:border-foreground-primary size-9 cursor-pointer" />
                        </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="mt-1" hideArrow>
                        <p>{t('editor.topBar.profile')}</p>
                    </TooltipContent>
                </Tooltip>
                <PublishButton />
            </div>
        </div>
    );
});
