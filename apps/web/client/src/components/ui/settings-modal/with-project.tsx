import { useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { AnimatePresence, motion } from 'motion/react';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Separator } from '@weblab/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';
import { capitalizeFirstLetter } from '@weblab/utility';

import type { SettingTab } from './helpers';
import { useEditorEngine } from '@/components/store/editor';
import { useStateManager } from '@/components/store/state';
import { env } from '@/env';
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
import { PageTab } from './site/page';
import { SkillsTab } from './skills-tab';
import { SubscriptionTab } from './subscription-tab';
import { VersionsTab } from './versions';

function TruncatedLabelWithTooltip({ label }: { label: string }) {
    const [isTruncated, setIsTruncated] = useState(false);
    const spanRef = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        const el = spanRef.current;
        if (el) {
            setIsTruncated(el.scrollWidth > el.clientWidth);
        }
    }, [label]);
    return isTruncated ? (
        <Tooltip>
            <TooltipTrigger asChild>
                <span ref={spanRef} className="truncate">
                    {label}
                </span>
            </TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
    ) : (
        <span ref={spanRef} className="truncate">
            {label}
        </span>
    );
}

export const SettingsModalWithProjects = observer(() => {
    const editorEngine = useEditorEngine();
    const stateManager = useStateManager();
    const pagesManager = editorEngine.pages;

    useEffect(() => {
        if (!stateManager.isSettingsModalOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') stateManager.isSettingsModalOpen = false;
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [stateManager, stateManager.isSettingsModalOpen]);

    const flattenPages = useMemo(() => {
        return pagesManager.flatPages;
    }, [pagesManager.flatPages]);

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

    // Bug fix #59: The page-scan flow has a known TODO ("use file system like code tab")
    // and ships incomplete UI in environments where flattenPages is wrong/empty. Gate the
    // entire feature behind NEXT_PUBLIC_PROJECT_FILESYSTEM_ENABLED so production users
    // don't see half-built page settings until we re-implement on top of the file system.
    const pagesFilesystemEnabled = env.NEXT_PUBLIC_PROJECT_FILESYSTEM_ENABLED;

    const pagesTabs: SettingTab[] = pagesFilesystemEnabled
        ? flattenPages.map((page) => ({
              label: page.path,
              icon: page.isRoot ? (
                  <svg viewBox="0 0 16 16" className="mr-2 h-4 min-w-4" fill="currentColor">
                      <path d="M8 1.5 1.5 6.7v7.8h4.2V10h4.6v4.5h4.2V6.7z" />
                  </svg>
              ) : (
                  <Icons.File className="mr-2 h-4 min-w-4" />
              ),
              component: <PageTab metadata={page.metadata} path={page.path} />,
          }))
        : [];

    const tabs = [...globalTabs, ...pagesTabs, ...projectTabs];

    useEffect(() => {
        if (!stateManager.isSettingsModalOpen) {
            return;
        }
        if (!pagesFilesystemEnabled) {
            return;
        }
        void editorEngine.pages.scanPages();
    }, [editorEngine.pages, stateManager.isSettingsModalOpen, pagesFilesystemEnabled]);

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
                                {/* Top bar - fixed height */}
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
                                    {/* Left navigation - fixed width */}
                                    <div className="bg-background-secondary flex flex-col overflow-y-scroll select-none">
                                        <div className="w-48 shrink-0 space-y-1 p-5">
                                            <p className="text-mini text-foreground-tertiary mt-2 mb-0.5 ml-2.5">
                                                Project
                                            </p>
                                            <div className="text-foreground-tertiary mb-3 ml-2.5 flex items-center gap-1.5">
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
                                        <Separator />
                                        {pagesTabs.length > 0 && (
                                            <>
                                                <div className="w-48 shrink-0 space-y-1 p-5">
                                                    <p className="text-mini text-foreground-tertiary mt-2 mb-2 ml-2.5">
                                                        Pages Settings
                                                    </p>
                                                    {pagesTabs.map((tab) => (
                                                        <Button
                                                            key={tab.label}
                                                            variant="ghost"
                                                            className={cn(
                                                                'w-full justify-start px-0 hover:bg-transparent',
                                                                'truncate',
                                                                stateManager.settingsTab ===
                                                                    tab.label
                                                                    ? 'text-foreground-active'
                                                                    : 'text-muted-foreground',
                                                            )}
                                                            onClick={() =>
                                                                (stateManager.settingsTab =
                                                                    tab.label)
                                                            }
                                                        >
                                                            {tab.icon}
                                                            <TruncatedLabelWithTooltip
                                                                label={
                                                                    flattenPages.find(
                                                                        (page) =>
                                                                            page.path === tab.label,
                                                                    )?.name ??
                                                                    capitalizeFirstLetter(
                                                                        tab.label.toLowerCase(),
                                                                    )
                                                                }
                                                            />
                                                        </Button>
                                                    ))}
                                                </div>
                                                <Separator />
                                            </>
                                        )}
                                        <div className="text-regularPlus w-48 shrink-0 space-y-1 p-5">
                                            <p className="text-muted-foreground text-smallPlus mt-2 mb-2 ml-2.5">
                                                Global Settings
                                            </p>
                                            {globalTabs.map((tab) => (
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
