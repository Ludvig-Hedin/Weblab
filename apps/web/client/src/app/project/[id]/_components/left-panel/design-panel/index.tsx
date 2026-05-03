import type { ReactNode } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { LeftPanelTabValue } from '@weblab/models';
import { HotkeyLabel } from '@weblab/ui/hotkey-label';
import { Icons } from '@weblab/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import { Hotkey } from '@/components/hotkey';
import { useEditorEngine } from '@/components/store/editor';
import { transKeys } from '@/i18n/keys';
import { BranchesTab } from './branches-tab';
import { ComponentsTab } from './components-tab';
import { BrandTab } from './brand-tab';
import { HelpButton } from './help-button';
import { ImagesTab } from './image-tab';
import { InsertTab } from './insert-tab';
import { LayersTab } from './layers-tab';
import { PagesTab } from './page-tab';
import { SearchTab } from './search-tab';
import { ZoomControls } from './zoom-controls';

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

    const handleMouseEnter = (tab: LeftPanelTabValue) => {
        if (isLocked) {
            return;
        }
        editorEngine.state.setLeftPanelTab(tab);
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

    return (
        <div className="flex h-full overflow-auto" onMouseLeave={handleMouseLeave}>
            {/* Left sidebar with tabs */}
            <div className="bg-background-weblab/60 flex w-14 flex-col items-center gap-1.5 px-1.5 py-1.5 backdrop-blur-xl">
                {tabs.map((tab) => {
                    const label = getTabLabel(tab.value);

                    return (
                        <Tooltip key={tab.value}>
                            <TooltipTrigger asChild>
                                <button
                                    aria-label={label}
                                    className={cn(
                                        'flex h-10 w-10 items-center justify-center rounded-lg p-2',
                                        selectedTab === tab.value && isLocked
                                            ? 'bg-accent text-foreground border-foreground/20 border-[0.5px]'
                                            : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                                        tab.disabled &&
                                            'hover:text-muted-foreground cursor-not-allowed opacity-50 hover:bg-transparent',
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
                    <HelpButton />
                </div>
            </div>

            {/* Content panel */}
            {editorEngine.state.leftPanelTab && (
                <>
                    <div className="bg-background/95 w-[272px] flex-1 rounded-xl">
                        <div className="h-full overflow-auto rounded-xl border p-0 shadow backdrop-blur-xl">
                            {selectedTab === LeftPanelTabValue.INSERT && <InsertTab />}
                            {selectedTab === LeftPanelTabValue.COMPONENTS && <ComponentsTab />}
                            {selectedTab === LeftPanelTabValue.LAYERS && <LayersTab />}
                            {selectedTab === LeftPanelTabValue.SEARCH && <SearchTab />}
                            {selectedTab === LeftPanelTabValue.BRAND && <BrandTab />}
                            {selectedTab === LeftPanelTabValue.PAGES && <PagesTab />}
                            {selectedTab === LeftPanelTabValue.IMAGES && <ImagesTab />}
                            {selectedTab === LeftPanelTabValue.BRANCHES && <BranchesTab />}
                        </div>
                    </div>

                    {/* Invisible padding area that maintains hover state */}
                    {!isLocked && <div className="h-full w-24" />}
                </>
            )}
        </div>
    );
});
