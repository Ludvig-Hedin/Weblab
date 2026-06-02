import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { observer } from 'mobx-react-lite';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { LeftPanelTabValue } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { HotkeyLabel } from '@weblab/ui/hotkey-label';
import { Icons } from '@weblab/ui/icons';
import { ResizablePanel } from '@weblab/ui/resizable';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import { Hotkey } from '@/components/hotkey';
import { useEditorEngine } from '@/components/store/editor';
import { transKeys } from '@/i18n/keys';
// HelpButton hidden per request — the "?" feedback button did nothing useful.
// Import kept commented so it can be restored without re-wiring.
// import { HelpButton } from './help-button';
import { ZoomControls } from './zoom-controls';

// Tab contents are gated by `selectedTab === X` below, so only one renders at
// a time. Lazy-loading keeps the eight tab modules out of the initial editor
// chunk — users rarely open all of them in a session.
const InsertTab = dynamic(() => import('./insert-tab').then((m) => m.InsertTab), { ssr: false });
const ComponentsTab = dynamic(() => import('./components-tab').then((m) => m.ComponentsTab), {
    ssr: false,
});
const LayersTab = dynamic(() => import('./layers-tab').then((m) => m.LayersTab), { ssr: false });
const SearchTab = dynamic(() => import('./search-tab').then((m) => m.SearchTab), { ssr: false });
const BrandTab = dynamic(() => import('./brand-tab').then((m) => m.BrandTab), {
    ssr: false,
});
const PagesTab = dynamic(() => import('./page-tab').then((m) => m.PagesTab), {
    ssr: false,
});
const AssetsTab = dynamic(() => import('./asset-tab').then((m) => m.AssetsTab), { ssr: false });
const BranchesTab = dynamic(() => import('./branches-tab').then((m) => m.BranchesTab), {
    ssr: false,
});

const PANEL_DEFAULT_WIDTH = 300;
const PANEL_MIN_WIDTH = 240;
const PANEL_MAX_WIDTH = 560;

const tabs: {
    value: LeftPanelTabValue;
    icon: ReactNode;
    hotkey: Hotkey;
    disabled?: boolean;
}[] = [
    {
        value: LeftPanelTabValue.INSERT,
        icon: <Icons.Plus className="h-5 w-5" />,
        hotkey: Hotkey.SIDEBAR_INSERT,
    },
    {
        value: LeftPanelTabValue.COMPONENTS,
        icon: <Icons.Component className="h-5 w-5" />,
        hotkey: Hotkey.SIDEBAR_COMPONENTS,
    },
    {
        value: LeftPanelTabValue.LAYERS,
        icon: <Icons.Layers className="h-5 w-5" />,
        hotkey: Hotkey.SIDEBAR_LAYERS,
    },
    {
        value: LeftPanelTabValue.SEARCH,
        icon: <Icons.MagnifyingGlass className="h-5 w-5" />,
        hotkey: Hotkey.SIDEBAR_SEARCH,
    },
    {
        value: LeftPanelTabValue.BRAND,
        icon: <Icons.Brand className="h-5 w-5" />,
        hotkey: Hotkey.SIDEBAR_BRAND,
    },
    {
        value: LeftPanelTabValue.PAGES,
        icon: <Icons.File className="h-5 w-5" />,
        hotkey: Hotkey.SIDEBAR_PAGES,
    },
    {
        value: LeftPanelTabValue.IMAGES,
        icon: <Icons.Image className="h-5 w-5" />,
        hotkey: Hotkey.SIDEBAR_IMAGES,
    },
    {
        value: LeftPanelTabValue.BRANCHES,
        icon: <Icons.Branch className="h-5 w-5" />,
        hotkey: Hotkey.SIDEBAR_BRANCHES,
    },
];

export const DesignPanel = observer(() => {
    const editorEngine = useEditorEngine();
    const t = useTranslations();
    const isLocked = editorEngine.state.leftPanelLocked;
    const selectedTab = editorEngine.state.leftPanelTab;
    const [isCollapsed, setIsCollapsed] = useState(false);
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleMouseEnter = (tab: LeftPanelTabValue) => {
        if (isLocked) return;
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = setTimeout(() => {
            editorEngine.state.setLeftPanelTab(tab);
        }, 150);
    };

    const isMouseInContentPanel = (e: React.MouseEvent<HTMLDivElement>): boolean => {
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        const contentPanel = e.currentTarget;
        if (contentPanel) {
            const { left, right, top, bottom } = contentPanel.getBoundingClientRect();
            if (mouseX < left || mouseX > right || mouseY < top || mouseY > bottom) {
                return false;
            }
        }
        return true;
    };

    const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }
        if (!isLocked) {
            // This is to handle things like dropdown where the mouse is still in the content panel
            if (!isMouseInContentPanel(e)) {
                editorEngine.state.setLeftPanelTab(null);
            } else {
                // TODO: Since mouse leave won't trigger anymore, we need to listen and check
                //  if the mouse actually left the content panel and then close the content panel
            }
        } else {
            // If we're locked, return to the locked tab when mouse leaves
            editorEngine.state.setLeftPanelTab(selectedTab);
        }
    };

    const handleClick = (tab: LeftPanelTabValue) => {
        if (selectedTab === tab && isLocked) {
            editorEngine.state.setLeftPanelLocked(false);
        } else {
            editorEngine.state.setLeftPanelTab(tab);
            editorEngine.state.setLeftPanelLocked(true);
        }
    };

    const getTabLabel = (tab: LeftPanelTabValue) => {
        switch (tab) {
            case LeftPanelTabValue.INSERT:
                return t(transKeys.editor.panels.layers.tabs.insert);
            case LeftPanelTabValue.COMPONENTS:
                return t(transKeys.editor.panels.layers.tabs.components);
            case LeftPanelTabValue.LAYERS:
                return t(transKeys.editor.panels.layers.tabs.layers);
            case LeftPanelTabValue.SEARCH:
                return t(transKeys.editor.panels.layers.tabs.search);
            case LeftPanelTabValue.BRAND:
                return t(transKeys.editor.panels.layers.tabs.brand);
            case LeftPanelTabValue.PAGES:
                return t(transKeys.editor.panels.layers.tabs.pages);
            case LeftPanelTabValue.IMAGES:
                return t(transKeys.editor.panels.layers.tabs.images);
            case LeftPanelTabValue.BRANCHES:
                return t(transKeys.editor.panels.layers.tabs.branches);
            default:
                return '';
        }
    };

    if (isCollapsed || editorEngine.state.panelsHidden) {
        // Anchored to the exact rectangle the rail's collapse button occupies
        // (w-14 lane, pt-2, h-9) so the toggle never jumps position or size
        // between open and collapsed states — only the icon flips.
        return (
            <div className="flex w-14 flex-col items-center pt-2">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t(transKeys.editor.panels.layers.rail.openLeftPanel)}
                            className="border-border-bar bg-background-chrome text-foreground-secondary hover:bg-background-bar-active hover:text-foreground-primary h-9 w-9 rounded-md border shadow-sm"
                            onClick={() => {
                                if (editorEngine.state.panelsHidden) {
                                    editorEngine.state.togglePanelsHidden();
                                }
                                setIsCollapsed(false);
                            }}
                        >
                            {/* size-5 (not h-5 w-5) so the Button icon-size rule
                                doesn't shrink it to 16px — matches the open-state
                                rail collapse button's 20px icon exactly. */}
                            <Icons.SidebarLeftExpand className="size-5" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right" hideArrow>
                        {t(transKeys.editor.panels.layers.rail.openLeftPanel)}
                    </TooltipContent>
                </Tooltip>
            </div>
        );
    }

    const panelTitle = selectedTab ? getTabLabel(selectedTab) : '';

    const tabContent = (
        <div className="bg-background-chrome border-border-bar flex h-full flex-col overflow-hidden border-r">
            {/* Panel header — current tab title with inline pin / unpin control. */}
            <div className="border-border-bar/60 flex h-10 shrink-0 items-center justify-between border-b px-3">
                <span className="text-foreground-primary text-small truncate font-medium">
                    {panelTitle}
                </span>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            aria-label={
                                isLocked
                                    ? t(transKeys.editor.panels.layers.rail.unpinPanel)
                                    : t(transKeys.editor.panels.layers.rail.pinPanel)
                            }
                            aria-pressed={isLocked}
                            onClick={() => editorEngine.state.setLeftPanelLocked(!isLocked)}
                            className={cn(
                                'flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150',
                                isLocked
                                    ? 'bg-background-bar-active text-foreground-primary'
                                    : 'text-foreground-tertiary hover:text-foreground-primary hover:bg-background-bar-active',
                            )}
                        >
                            {isLocked ? (
                                <Icons.PinFilled className="h-3.5 w-3.5" />
                            ) : (
                                <Icons.Pin className="h-3.5 w-3.5" />
                            )}
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" hideArrow>
                        {isLocked
                            ? t(transKeys.editor.panels.layers.rail.unpinPanel)
                            : t(transKeys.editor.panels.layers.rail.pinPanel)}
                    </TooltipContent>
                </Tooltip>
            </div>
            <div className="flex-1 overflow-auto p-0">
                {selectedTab === LeftPanelTabValue.INSERT && <InsertTab />}
                {selectedTab === LeftPanelTabValue.COMPONENTS && <ComponentsTab />}
                {selectedTab === LeftPanelTabValue.LAYERS && <LayersTab />}
                {selectedTab === LeftPanelTabValue.SEARCH && <SearchTab />}
                {selectedTab === LeftPanelTabValue.BRAND && <BrandTab />}
                {selectedTab === LeftPanelTabValue.PAGES && <PagesTab />}
                {selectedTab === LeftPanelTabValue.IMAGES && <AssetsTab />}
                {selectedTab === LeftPanelTabValue.BRANCHES && <BranchesTab />}
            </div>
        </div>
    );

    return (
        // Short slide+fade so expanding the panel reads as a smooth open rather
        // than a hard pop. Plays on collapse→expand (the open tree mounts) and
        // on first paint; tab/hover switches keep this wrapper mounted so they
        // don't replay it.
        <motion.div
            className="flex h-full overflow-auto"
            onMouseLeave={handleMouseLeave}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
        >
            {/* Left sidebar with tabs */}
            <div className="bg-background-chrome border-border-bar flex w-14 flex-col items-center gap-1 border-r px-1.5 py-2">
                {/* Collapse toggle pinned to the top of the rail — occupies the
                    same rectangle as the collapsed-state expand button so it
                    never jumps position or size, only flips its icon. */}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            aria-label={t(transKeys.editor.panels.layers.rail.collapsePanel)}
                            className="text-foreground-tertiary hover:text-foreground-primary hover:bg-background-bar-active flex h-9 w-9 items-center justify-center rounded-md transition-colors duration-150"
                            // TEMP: left toggle now collapses BOTH panels (right
                            // toggle is hidden). Revert → `onClick={() => setIsCollapsed(true)}`.
                            onClick={() => editorEngine.state.togglePanelsHidden()}
                        >
                            <Icons.SidebarLeftCollapse className="h-5 w-5" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" hideArrow>
                        {t(transKeys.editor.panels.layers.rail.collapsePanel)}
                    </TooltipContent>
                </Tooltip>
                <div className="bg-border-bar/60 my-1 h-px w-6" />
                {tabs.map((tab) => {
                    const label = getTabLabel(tab.value);

                    return (
                        <Tooltip key={tab.value}>
                            <TooltipTrigger asChild>
                                <button
                                    aria-label={label}
                                    className={cn(
                                        'flex h-9 w-9 items-center justify-center rounded-md transition-colors duration-150',
                                        selectedTab === tab.value && isLocked
                                            ? 'bg-background-bar-active text-foreground-primary'
                                            : 'text-foreground-tertiary hover:text-foreground-primary hover:bg-background-bar-active',
                                        tab.disabled &&
                                            'hover:text-foreground-tertiary cursor-not-allowed opacity-40 hover:bg-transparent',
                                    )}
                                    disabled={tab.disabled}
                                    onClick={() => !tab.disabled && handleClick(tab.value)}
                                    onMouseEnter={() =>
                                        !tab.disabled && handleMouseEnter(tab.value)
                                    }
                                >
                                    {tab.icon}
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="right" hideArrow>
                                <HotkeyLabel
                                    hotkey={{
                                        command: tab.hotkey.command,
                                        description: label,
                                        readableCommand: tab.hotkey.readableCommand,
                                    }}
                                />
                            </TooltipContent>
                        </Tooltip>
                    );
                })}

                <div className="mt-auto mb-4 flex flex-col items-center gap-0">
                    <ZoomControls />
                    {/* HelpButton hidden per request — non-functional "?" button. */}
                    {/* <HelpButton /> */}
                </div>
            </div>

            {/* Content panel — resizable when pinned, fixed-width on hover preview. */}
            {editorEngine.state.leftPanelTab && (
                <>
                    {isLocked ? (
                        <ResizablePanel
                            side="left"
                            defaultWidth={PANEL_DEFAULT_WIDTH}
                            minWidth={PANEL_MIN_WIDTH}
                            maxWidth={PANEL_MAX_WIDTH}
                        >
                            {tabContent}
                        </ResizablePanel>
                    ) : (
                        <div className="flex-1" style={{ width: PANEL_DEFAULT_WIDTH }}>
                            {tabContent}
                        </div>
                    )}

                    {/* Invisible padding area that maintains hover state */}
                    {!isLocked && <div className="h-full w-24" />}
                </>
            )}
        </motion.div>
    );
});
