'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

import { BrandWordmark } from '@weblab/ui/brand';
import { Skeleton } from '@weblab/ui/skeleton';
import { Toaster } from '@weblab/ui/sonner';
import { TooltipProvider } from '@weblab/ui/tooltip';

import { ControlBar } from './_components/control-bar';
import { AccordionsDemo } from './_components/demos/accordions';
import { AvatarsDemo } from './_components/demos/avatars';
import { BadgesDemo } from './_components/demos/badges';
import { BrandDemo } from './_components/demos/brand';
import { ButtonsDemo } from './_components/demos/buttons';
import { ChatDemo } from './_components/demos/chat';
import { ColorsDemo } from './_components/demos/colors';
import { ComboboxDemo } from './_components/demos/combobox';
import { ControlsDemo } from './_components/demos/controls';
import { DataDisplayDemo } from './_components/demos/data-display';
import { FeedbackDemo } from './_components/demos/feedback';
import { FormsDemo } from './_components/demos/forms';
import { InputsDemo } from './_components/demos/inputs';
import { KeyboardDemo } from './_components/demos/keyboard';
import { LayoutDemo } from './_components/demos/layout';
import { MenusDemo } from './_components/demos/menus';
import { MotionDemo } from './_components/demos/motion';
import { OverlaysDemo } from './_components/demos/overlays';
import { PromoBannerDemo } from './_components/demos/promo-banner';
import { RadiusDemo } from './_components/demos/radius';
import { SelectionDemo } from './_components/demos/selection';
import { SpacingDemo } from './_components/demos/spacing';
import { TabsDemo } from './_components/demos/tabs';
import { TypographyDemo } from './_components/demos/typography';
import { DesignSidebar } from './_components/design-sidebar';
import { GroupHeader } from './_components/group-header';
import { InspectorSheet } from './_components/inspector/inspector-sheet';
import {
    EditModeProvider,
    InspectorProvider,
    OverridesProvider,
    RepoRootProvider,
    useOverrides,
} from './_components/overrides-context';

const lazyFallback = <Skeleton className="h-48 w-full max-w-2xl rounded-xl" />;

const CommandDemo = dynamic(
    () => import('./_components/demos/command').then((m) => m.CommandDemo),
    { ssr: false, loading: () => lazyFallback },
);
const CalendarDemo = dynamic(
    () => import('./_components/demos/calendar').then((m) => m.CalendarDemo),
    { ssr: false, loading: () => lazyFallback },
);
const ChartDemo = dynamic(() => import('./_components/demos/chart').then((m) => m.ChartDemo), {
    ssr: false,
    loading: () => lazyFallback,
});
const ColorPickerDemo = dynamic(
    () => import('./_components/demos/color-picker').then((m) => m.ColorPickerDemo),
    { ssr: false, loading: () => lazyFallback },
);
const AIElementsDemo = dynamic(
    () => import('./_components/demos/ai-elements').then((m) => m.AIElementsDemo),
    { ssr: false, loading: () => lazyFallback },
);

interface GroupSpec {
    id: string;
    label: string;
    eyebrow?: string;
    title?: string;
    description?: string;
    filePath?: string;
}

const GROUPS: (GroupSpec & { Demo: React.ComponentType })[] = [
    {
        id: 'colors',
        label: 'Colors',
        eyebrow: 'Tokens',
        title: 'Colors',
        description: 'Semantic, surface, and palette tokens. Click any swatch to edit live.',
        filePath: 'packages/ui/src/globals.css',
        Demo: ColorsDemo,
    },
    {
        id: 'typography',
        label: 'Typography',
        eyebrow: 'Tokens',
        title: 'Typography',
        description: 'App + marketing scales, weights, leading, and tracking.',
        filePath: 'packages/ui/src/globals.css',
        Demo: TypographyDemo,
    },
    {
        id: 'radius',
        label: 'Radius',
        eyebrow: 'Tokens',
        title: 'Radius',
        description: 'Corner radius scale and global multiplier.',
        filePath: 'packages/ui/src/globals.css',
        Demo: RadiusDemo,
    },
    {
        id: 'spacing',
        label: 'Spacing',
        eyebrow: 'Tokens',
        title: 'Spacing',
        description: '4px-based scale used across the product.',
        Demo: SpacingDemo,
    },
    {
        id: 'buttons',
        label: 'Buttons',
        eyebrow: 'Actions',
        title: 'Buttons',
        description: 'Every variant, size, and state of the primary action component.',
        filePath: 'packages/ui/src/components/button.tsx',
        Demo: ButtonsDemo,
    },
    {
        id: 'badges',
        label: 'Badges',
        eyebrow: 'Status',
        title: 'Badges',
        description: 'Compact status, count, and label affordances.',
        filePath: 'packages/ui/src/components/badge.tsx',
        Demo: BadgesDemo,
    },
    {
        id: 'avatars',
        label: 'Avatars',
        eyebrow: 'Identity',
        title: 'Avatars',
        description: 'User and entity avatars, sizes, fallbacks, and groups.',
        filePath: 'packages/ui/src/components/avatar.tsx',
        Demo: AvatarsDemo,
    },
    {
        id: 'inputs',
        label: 'Inputs',
        eyebrow: 'Forms',
        title: 'Inputs',
        description: 'Text, textarea, number, OTP, input group, draftable, and prefixed inputs.',
        filePath: 'packages/ui/src/components/input.tsx',
        Demo: InputsDemo,
    },
    {
        id: 'controls',
        label: 'Controls',
        eyebrow: 'Forms',
        title: 'Controls',
        description: 'Checkbox, radio, switch, slider, toggle, and toggle groups.',
        filePath: 'packages/ui/src/components/checkbox.tsx',
        Demo: ControlsDemo,
    },
    {
        id: 'forms',
        label: 'Forms',
        eyebrow: 'Forms',
        title: 'Forms',
        description:
            'react-hook-form scaffold — FormField + FormControl + FormMessage. Canonical replacement for hand-rolled validation markup.',
        filePath: 'packages/ui/src/components/form.tsx',
        Demo: FormsDemo,
    },
    {
        id: 'selection',
        label: 'Selection',
        eyebrow: 'Forms',
        title: 'Selection',
        description: 'Select dropdowns and grouped, icon, and disabled variants.',
        filePath: 'packages/ui/src/components/select.tsx',
        Demo: SelectionDemo,
    },
    {
        id: 'combobox',
        label: 'Combobox',
        eyebrow: 'Forms',
        title: 'Combobox & search',
        description:
            'Command palettes inside popovers — project pickers, @mentions, slash commands, async loading.',
        filePath: 'packages/ui/src/components/command.tsx',
        Demo: ComboboxDemo,
    },
    {
        id: 'overlays',
        label: 'Overlays',
        eyebrow: 'Layers',
        title: 'Overlays',
        description: 'Dialogs, sheets, drawers, popovers, hover cards, and tooltips.',
        filePath: 'packages/ui/src/components/dialog.tsx',
        Demo: OverlaysDemo,
    },
    {
        id: 'menus',
        label: 'Menus',
        eyebrow: 'Layers',
        title: 'Menus',
        description: 'Dropdown, context, menubar, and navigation menus.',
        filePath: 'packages/ui/src/components/dropdown-menu.tsx',
        Demo: MenusDemo,
    },
    {
        id: 'tabs',
        label: 'Tabs',
        eyebrow: 'Navigation',
        title: 'Tabs',
        description: 'Horizontal segmented tabs with icons and disabled states.',
        filePath: 'packages/ui/src/components/tabs.tsx',
        Demo: TabsDemo,
    },
    {
        id: 'accordions',
        label: 'Accordions',
        eyebrow: 'Disclosure',
        title: 'Accordions',
        description: 'Single and multiple expandable rows.',
        filePath: 'packages/ui/src/components/accordion.tsx',
        Demo: AccordionsDemo,
    },
    {
        id: 'layout',
        label: 'Layout',
        eyebrow: 'Structure',
        title: 'Layout',
        description: 'Cards, separators, scroll areas, aspect ratios, collapsibles, and sidebar.',
        filePath: 'packages/ui/src/components/card.tsx',
        Demo: LayoutDemo,
    },
    {
        id: 'data',
        label: 'Data',
        eyebrow: 'Display',
        title: 'Data display',
        description: 'Table, pagination, and breadcrumb patterns.',
        filePath: 'packages/ui/src/components/table.tsx',
        Demo: DataDisplayDemo,
    },
    {
        id: 'feedback',
        label: 'Feedback',
        eyebrow: 'Status',
        title: 'Feedback',
        description: 'Alerts, toasts, progress, and skeleton loaders.',
        filePath: 'packages/ui/src/components/alert.tsx',
        Demo: FeedbackDemo,
    },
    {
        id: 'motion',
        label: 'Motion',
        eyebrow: 'Motion',
        title: 'Motion',
        description: 'Transitions, animated cards, and shine borders.',
        Demo: MotionDemo,
    },
    {
        id: 'keyboard',
        label: 'Keyboard',
        eyebrow: 'Hints',
        title: 'Keyboard',
        description: 'Keycaps and hotkey labels for shortcuts.',
        filePath: 'packages/ui/src/components/kbd.tsx',
        Demo: KeyboardDemo,
    },
    {
        id: 'command',
        label: 'Command',
        eyebrow: 'Forms',
        title: 'Command palette',
        description: 'cmdk-based search and shortcut palette.',
        filePath: 'packages/ui/src/components/command.tsx',
        Demo: CommandDemo,
    },
    {
        id: 'calendar',
        label: 'Calendar',
        eyebrow: 'Display',
        title: 'Calendar',
        description: 'react-day-picker calendar with single date and disabled day patterns.',
        filePath: 'packages/ui/src/components/calendar.tsx',
        Demo: CalendarDemo,
    },
    {
        id: 'chart',
        label: 'Chart',
        eyebrow: 'Display',
        title: 'Chart',
        description: 'Bar and line charts via the recharts wrapper.',
        filePath: 'packages/ui/src/components/chart.tsx',
        Demo: ChartDemo,
    },
    {
        id: 'color-picker',
        label: 'Color picker',
        eyebrow: 'Forms',
        title: 'Color picker',
        description: 'Full HSL / HSV / RGB / Hex color picker.',
        filePath: 'packages/ui/src/components/color-picker',
        Demo: ColorPickerDemo,
    },
    {
        id: 'ai-elements',
        label: 'AI elements',
        eyebrow: 'AI',
        title: 'AI elements',
        description: 'Response, reasoning, tool, and code block primitives for chat UIs.',
        filePath: 'packages/ui/src/components/ai-elements',
        Demo: AIElementsDemo,
    },
    {
        id: 'chat',
        label: 'Chat',
        eyebrow: 'AI',
        title: 'Chat',
        description: 'Chat bubbles, tool-call rows, and reasoning effort control.',
        filePath: 'apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab',
        Demo: ChatDemo,
    },
    {
        id: 'brand',
        label: 'Brand',
        eyebrow: 'Brand',
        title: 'Brand',
        description: 'Logo and wordmark at every size.',
        filePath: 'packages/ui/src/components/brand.tsx',
        Demo: BrandDemo,
    },
    {
        id: 'promo-banner',
        label: 'Promo banner',
        eyebrow: 'Brand',
        title: 'Promo banner',
        description: 'Marketing banner with editable copy and CTA.',
        Demo: PromoBannerDemo,
    },
];

const NAV_ITEMS = GROUPS.map((g) => ({ id: g.id, label: g.label }));

export default function DesignSystemPage() {
    return (
        <RepoRootProvider>
            <OverridesProvider>
                <EditModeProvider>
                    <InspectorProvider>
                        <TooltipProvider>
                            <Shell />
                            <InspectorSheet />
                            <ControlBar />
                            <Toaster />
                        </TooltipProvider>
                    </InspectorProvider>
                </EditModeProvider>
            </OverridesProvider>
        </RepoRootProvider>
    );
}

function Shell() {
    const { overrides } = useOverrides();
    const [activeSection, setActiveSection] = useState('colors');
    const totalEdited = Object.keys(overrides).length;

    const scrollTo = useCallback((id: string) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);

    // Track the most-visible section[id] anywhere on the page. Includes the group
    // anchors (set on GroupHeader) and every sub-section produced by Section.
    useEffect(() => {
        const visible = new Map<string, number>();
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (e.isIntersecting) {
                        visible.set(e.target.id, e.intersectionRatio);
                    } else {
                        visible.delete(e.target.id);
                    }
                });
                let bestId: string | null = null;
                let bestRatio = -1;
                visible.forEach((ratio, id) => {
                    if (ratio > bestRatio) {
                        bestId = id;
                        bestRatio = ratio;
                    }
                });
                if (bestId) setActiveSection(bestId);
            },
            { rootMargin: '-20% 0px -70% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] },
        );
        document.querySelectorAll('section[id], [data-toc-anchor]').forEach((el) => {
            observer.observe(el);
        });
        // Refresh observed targets when DOM changes (lazy demos load late).
        const mut = new MutationObserver(() => {
            document.querySelectorAll('section[id], [data-toc-anchor]').forEach((el) => {
                observer.observe(el);
            });
        });
        mut.observe(document.body, { childList: true, subtree: true });
        return () => {
            observer.disconnect();
            mut.disconnect();
        };
    }, []);

    return (
        <div className="bg-background flex min-h-screen">
            <DesignSidebar groups={NAV_ITEMS} activeId={activeSection} onJump={scrollTo} />

            <main className="min-w-0 flex-1">
                <div className="mx-auto max-w-6xl px-6 py-10 pt-14 lg:pt-10">
                    <div className="mb-16">
                        <div className="mb-3 flex items-center gap-3">
                            <BrandWordmark className="h-6" />
                            {totalEdited > 0 && (
                                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                                    {totalEdited} custom
                                </span>
                            )}
                        </div>
                        <p className="text-foreground-tertiary text-sm">
                            Component library, visual tokens, and design language reference. Toggle{' '}
                            <em>Edit mode</em> in the bottom-right to expose the per-component
                            inspector. Open file paths in Cursor with the link beside each title.
                        </p>
                    </div>

                    {GROUPS.map(({ id, eyebrow, title, description, filePath, Demo }) => (
                        <div key={id} className="mb-20">
                            <GroupHeader
                                id={id}
                                eyebrow={eyebrow}
                                title={title ?? id}
                                description={description}
                                filePath={filePath}
                            />
                            <Demo />
                        </div>
                    ))}

                    <div className="pb-28" />
                </div>
            </main>
        </div>
    );
}
