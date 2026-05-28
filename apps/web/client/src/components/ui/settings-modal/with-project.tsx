import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { AnimatePresence, motion } from 'motion/react';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';
import { capitalizeFirstLetter } from '@weblab/utility';

import type { SettingTab } from './helpers';
import { useEditorEngine } from '@/components/store/editor';
import { useStateManager } from '@/components/store/state';
import { AccountTab } from './account-tab';
import { AITab } from './ai-tab';
import { AppearanceTab } from './appearance-tab';
import DomainTab from './domain';
import { EditorTab } from './editor-tab';
import { GitTab } from './git-tab';
import { GitHubTab } from './github-tab';
import { SettingsTabValue } from './helpers';
import { LanguageTab } from './language-tab';
import { ProjectTab } from './project';
import { ShortcutsTab } from './shortcuts-tab';
import { SiteTab } from './site';
import { SkillsTab } from './skills-tab';
import { SubscriptionTab } from './subscription-tab';
import { VersionsTab } from './versions';

export const SettingsModalWithProjects = observer(() => {
    const editorEngine = useEditorEngine();
    const stateManager = useStateManager();

    useEffect(() => {
        if (!stateManager.isSettingsModalOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') stateManager.setIsSettingsModalOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [stateManager, stateManager.isSettingsModalOpen]);

    const globalTabs: SettingTab[] = [
        {
            label: SettingsTabValue.ACCOUNT,
            icon: <Icons.Person className="mr-2 h-4 w-4" />,
            component: <AccountTab />,
        },
        {
            label: SettingsTabValue.APPEARANCE,
            icon: <Icons.Sun className="mr-2 h-4 w-4" />,
            component: <AppearanceTab />,
        },
        {
            label: SettingsTabValue.LANGUAGE,
            icon: <Icons.Globe className="mr-2 h-4 w-4" />,
            component: <LanguageTab />,
        },
        {
            label: SettingsTabValue.EDITOR,
            icon: <Icons.MixerHorizontal className="mr-2 h-4 w-4" />,
            component: <EditorTab />,
        },
        {
            label: SettingsTabValue.AI,
            icon: <Icons.Sparkles className="mr-2 h-4 w-4" />,
            component: <AITab />,
        },
        {
            label: SettingsTabValue.SKILLS,
            icon: <Icons.Brand className="mr-2 h-4 w-4" />,
            component: <SkillsTab projectId={editorEngine.projectId} />,
        },
        {
            label: SettingsTabValue.SHORTCUTS,
            icon: <Icons.Keyboard className="mr-2 h-4 w-4" />,
            component: <ShortcutsTab />,
        },
        {
            label: SettingsTabValue.GITHUB,
            icon: <Icons.GitHubLogo className="mr-2 h-4 w-4" />,
            component: <GitHubTab />,
        },
        {
            label: SettingsTabValue.GIT,
            icon: <Icons.Branch className="mr-2 h-4 w-4" />,
            component: <GitTab />,
        },
        {
            label: SettingsTabValue.SUBSCRIPTION,
            icon: <Icons.CreditCard className="mr-2 h-4 w-4" />,
            component: <SubscriptionTab />,
        },
    ];

    const projectTabs: SettingTab[] = [
        {
            label: SettingsTabValue.SITE,
            icon: <Icons.File className="mr-2 h-4 w-4" />,
            component: <SiteTab />,
        },
        {
            label: SettingsTabValue.DOMAIN,
            icon: <Icons.Globe className="mr-2 h-4 w-4" />,
            component: <DomainTab />,
        },
        {
            label: SettingsTabValue.PROJECT,
            icon: <Icons.Gear className="mr-2 h-4 w-4" />,
            component: <ProjectTab />,
        },
        {
            label: SettingsTabValue.VERSIONS,
            icon: <Icons.Code className="mr-2 h-4 w-4" />,
            component: <VersionsTab />,
        },
    ];

    // Per-page settings now live in the dedicated page settings drawer
    // (opened from the cog on a page row in the left-panel Pages tab).
    // This modal only owns global/account/site/project settings.
    const tabs = [...globalTabs, ...projectTabs];

    return (
        <AnimatePresence>
            {stateManager.isSettingsModalOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="bg-background/80 fixed inset-0 z-50 backdrop-blur-sm"
                        onClick={() => stateManager.setIsSettingsModalOpen(false)}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="pointer-events-none fixed inset-0 z-50 flex items-start justify-center sm:items-center"
                    >
                        <div className="bg-background pointer-events-auto h-[100dvh] w-screen overflow-hidden rounded-none border p-0 shadow-lg sm:h-[700px] sm:max-h-screen sm:w-[900px] sm:max-w-4xl sm:rounded-lg">
                            <div className="flex h-full overflow-hidden">
                                {/* Sidebar */}
                                <div className="flex w-44 shrink-0 flex-col overflow-y-auto p-3 select-none sm:w-52">
                                    <div className="mb-3 flex items-center justify-between px-2.5 pt-3">
                                        <h1 className="text-largePlus">Settings</h1>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() =>
                                                stateManager.setIsSettingsModalOpen(false)
                                            }
                                        >
                                            <Icons.CrossS className="h-4 w-4" />
                                        </Button>
                                    </div>

                                    {/* Project group */}
                                    <div className="space-y-1">
                                        <p className="text-mini text-foreground-tertiary mb-0.5 ml-2.5">
                                            Project
                                        </p>
                                        <div className="text-foreground-tertiary mb-2 ml-2.5 flex items-center gap-1.5">
                                            <Icons.Branch className="min-h-3 min-w-3" />
                                            <span
                                                className="text-mini max-w-30 truncate"
                                                title={editorEngine.branches.activeBranch.name}
                                            >
                                                {editorEngine.branches.activeBranch.name}
                                            </span>
                                        </div>
                                        {projectTabs.map((tab) => (
                                            <Button
                                                key={tab.label}
                                                variant="ghost"
                                                className={cn(
                                                    'w-full justify-start px-2.5',
                                                    stateManager.settingsTab === tab.label
                                                        ? 'bg-background-secondary text-foreground hover:bg-background-secondary hover:text-foreground'
                                                        : 'text-foreground-secondary hover:bg-background-secondary/60 hover:text-foreground',
                                                )}
                                                onClick={() =>
                                                    stateManager.setSettingsTab(tab.label)
                                                }
                                            >
                                                {tab.icon}
                                                {capitalizeFirstLetter(tab.label.toLowerCase())}
                                            </Button>
                                        ))}
                                    </div>

                                    {/* Global group */}
                                    <div className="mt-4 space-y-1">
                                        <p className="text-mini text-foreground-tertiary mb-1 ml-2.5">
                                            Global Settings
                                        </p>
                                        {globalTabs.map((tab) => (
                                            <Button
                                                key={tab.label}
                                                variant="ghost"
                                                className={cn(
                                                    'w-full justify-start px-2.5',
                                                    stateManager.settingsTab === tab.label
                                                        ? 'bg-background-secondary text-foreground hover:bg-background-secondary hover:text-foreground'
                                                        : 'text-foreground-secondary hover:bg-background-secondary/60 hover:text-foreground',
                                                )}
                                                onClick={() =>
                                                    stateManager.setSettingsTab(tab.label)
                                                }
                                            >
                                                {tab.icon}
                                                {capitalizeFirstLetter(tab.label.toLowerCase())}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                                {/* Content */}
                                <div className="flex-1 overflow-y-auto">
                                    {
                                        tabs.find((tab) => tab.label === stateManager.settingsTab)
                                            ?.component
                                    }
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
});
