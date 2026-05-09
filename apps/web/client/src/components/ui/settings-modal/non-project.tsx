import { observer } from 'mobx-react-lite';
import { AnimatePresence, motion } from 'motion/react';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Separator } from '@weblab/ui/separator';
import { cn } from '@weblab/ui/utils';
import { capitalizeFirstLetter } from '@weblab/utility';

import type { SettingTab } from './helpers';
import { useStateManager } from '@/components/store/state';
import { AccountTab } from './account-tab';
import { AITab } from './ai-tab';
import { AppearanceTab } from './appearance-tab';
import { EditorTab } from './editor-tab';
import { GitTab } from './git-tab';
import { GitHubTab } from './github-tab';
import { SettingsTabValue } from './helpers';
import { LanguageTab } from './language-tab';
import { ShortcutsTab } from './shortcuts-tab';
import { SkillsTab } from './skills-tab';
import { SubscriptionTab } from './subscription-tab';

export const NonProjectSettingsModal = observer(() => {
    const stateManager = useStateManager();

    const tabs: SettingTab[] = [
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
            component: <SkillsTab />,
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
                        onClick={() => (stateManager.isSettingsModalOpen = false)}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
                    >
                        <div className="bg-background pointer-events-auto h-[700px] max-h-screen w-[900px] max-w-4xl rounded-lg border p-0 shadow-lg">
                            <div className="flex h-full flex-col overflow-hidden">
                                {/* Top bar */}
                                <div className="ml-1 flex shrink-0 items-center p-5 pb-4 select-none">
                                    <h1 className="text-title3">Settings</h1>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="ml-auto"
                                        onClick={() => (stateManager.isSettingsModalOpen = false)}
                                    >
                                        <Icons.CrossS className="h-4 w-4" />
                                    </Button>
                                </div>
                                <Separator orientation="horizontal" className="shrink-0" />

                                {/* Main content */}
                                <div className="flex min-h-0 flex-1 overflow-hidden">
                                    {/* Left navigation */}
                                    <div className="flex flex-col overflow-y-scroll select-none">
                                        <div className="text-regularPlus w-48 shrink-0 space-y-1 p-5">
                                            <p className="text-muted-foreground text-smallPlus mt-2 mb-2 ml-2.5">
                                                Global Settings
                                            </p>
                                            {tabs.map((tab) => (
                                                <Button
                                                    key={tab.label}
                                                    variant="ghost"
                                                    className={cn(
                                                        'w-full justify-start px-0 hover:bg-transparent',
                                                        stateManager.settingsTab === tab.label
                                                            ? 'text-foreground-active'
                                                            : 'text-muted-foreground',
                                                    )}
                                                    onClick={() =>
                                                        (stateManager.settingsTab = tab.label)
                                                    }
                                                >
                                                    {tab.icon}
                                                    {capitalizeFirstLetter(tab.label.toLowerCase())}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>
                                    <Separator orientation="vertical" className="h-full" />
                                    {/* Right content */}
                                    <div className="flex-1 overflow-y-auto">
                                        {
                                            tabs.find(
                                                (tab) => tab.label === stateManager.settingsTab,
                                            )?.component
                                        }
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
});
