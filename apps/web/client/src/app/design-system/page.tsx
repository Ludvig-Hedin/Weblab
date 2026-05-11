'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

import { BrandLogo, BrandWordmark } from '@weblab/ui/brand';
import { Separator } from '@weblab/ui/separator';
import { Skeleton } from '@weblab/ui/skeleton';
import { Toaster } from '@weblab/ui/sonner';
import { TooltipProvider } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import { ControlBar } from './_components/control-bar';
import { AccordionsDemo } from './_components/demos/accordions';
import { AvatarsDemo } from './_components/demos/avatars';
import { BadgesDemo } from './_components/demos/badges';
import { BrandDemo } from './_components/demos/brand';
import { ButtonsDemo } from './_components/demos/buttons';
import { ChatDemo } from './_components/demos/chat';
import { ColorsDemo } from './_components/demos/colors';
import { ControlsDemo } from './_components/demos/controls';
import { DataDisplayDemo } from './_components/demos/data-display';
import { FeedbackDemo } from './_components/demos/feedback';
import { InputsDemo } from './_components/demos/inputs';
import { KeyboardDemo } from './_components/demos/keyboard';
import { LayoutDemo } from './_components/demos/layout';
import { MenusDemo } from './_components/demos/menus';
import { MotionDemo } from './_components/demos/motion';
import { OverlaysDemo } from './_components/demos/overlays';
import { RadiusDemo } from './_components/demos/radius';
import { SelectionDemo } from './_components/demos/selection';
import { SpacingDemo } from './_components/demos/spacing';
import { TabsDemo } from './_components/demos/tabs';
import { TypographyDemo } from './_components/demos/typography';
import { InspectorSheet } from './_components/inspector/inspector-sheet';
import {
    EditModeProvider,
    InspectorProvider,
    OverridesProvider,
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

const NAV_ITEMS = [
    { label: 'Colors', id: 'colors' },
    { label: 'Typography', id: 'typography' },
    { label: 'Radius', id: 'radius' },
    { label: 'Spacing', id: 'spacing' },
    { label: 'Buttons', id: 'buttons' },
    { label: 'Badges', id: 'badges' },
    { label: 'Avatars', id: 'avatars' },
    { label: 'Inputs', id: 'inputs' },
    { label: 'Controls', id: 'controls' },
    { label: 'Selection', id: 'selection' },
    { label: 'Overlays', id: 'overlays' },
    { label: 'Menus', id: 'menus' },
    { label: 'Tabs', id: 'tabs' },
    { label: 'Accordions', id: 'accordions' },
    { label: 'Layout', id: 'layout' },
    { label: 'Data', id: 'data' },
    { label: 'Feedback', id: 'feedback' },
    { label: 'Motion', id: 'motion' },
    { label: 'Keyboard', id: 'keyboard' },
    { label: 'Command', id: 'command' },
    { label: 'Calendar', id: 'calendar' },
    { label: 'Chart', id: 'chart' },
    { label: 'Color picker', id: 'color-picker' },
    { label: 'AI elements', id: 'ai-elements' },
    { label: 'Chat', id: 'chat' },
    { label: 'Brand', id: 'brand' },
];

export default function DesignSystemPage() {
    return (
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
    );
}

function Shell() {
    const { overrides } = useOverrides();
    const [activeSection, setActiveSection] = useState('colors');
    const totalEdited = Object.keys(overrides).length;

    const scrollTo = useCallback((id: string) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) =>
                entries.forEach((e) => {
                    if (e.isIntersecting) setActiveSection(e.target.id);
                }),
            { rootMargin: '-15% 0px -75% 0px', threshold: 0 },
        );
        NAV_ITEMS.forEach(({ id }) => {
            const el = document.getElementById(id);
            if (el) observer.observe(el);
        });
        return () => observer.disconnect();
    }, []);

    return (
        <div className="bg-background min-h-screen">
            <header className="border-border sticky top-0 z-40 border-b bg-black/80 backdrop-blur-md">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-3">
                        <BrandLogo className="h-4" />
                        <span className="text-foreground-tertiary text-xs">/</span>
                        <span className="text-foreground text-xs font-medium">design system</span>
                        {totalEdited > 0 && (
                            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                                {totalEdited} custom
                            </span>
                        )}
                    </div>
                    <nav className="hidden items-center gap-0.5 overflow-x-auto lg:flex">
                        {NAV_ITEMS.map((item) => (
                            <button
                                key={item.id}
                                onClick={() => scrollTo(item.id)}
                                className={cn(
                                    'rounded px-2 py-1 text-xs whitespace-nowrap transition-colors',
                                    activeSection === item.id
                                        ? 'text-foreground'
                                        : 'text-foreground-tertiary hover:text-foreground',
                                )}
                            >
                                {item.label}
                            </button>
                        ))}
                    </nav>
                </div>
            </header>

            <div className="mx-auto max-w-7xl px-6 py-10">
                <div className="mb-12">
                    <div className="mb-3 flex items-center gap-3">
                        <BrandWordmark className="h-6" />
                    </div>
                    <p className="text-foreground-tertiary text-sm">
                        Component library, visual tokens, and design language reference. Toggle{' '}
                        <em>Edit mode</em> in the bottom-right to expose the per-component
                        inspector.
                    </p>
                </div>

                <ColorsDemo />
                <Separator className="mb-12" />
                <TypographyDemo />
                <Separator className="mb-12" />
                <RadiusDemo />
                <Separator className="mb-12" />
                <SpacingDemo />
                <Separator className="mb-12" />
                <ButtonsDemo />
                <Separator className="mb-12" />
                <BadgesDemo />
                <Separator className="mb-12" />
                <AvatarsDemo />
                <Separator className="mb-12" />
                <InputsDemo />
                <Separator className="mb-12" />
                <ControlsDemo />
                <Separator className="mb-12" />
                <SelectionDemo />
                <Separator className="mb-12" />
                <OverlaysDemo />
                <Separator className="mb-12" />
                <MenusDemo />
                <Separator className="mb-12" />
                <TabsDemo />
                <Separator className="mb-12" />
                <AccordionsDemo />
                <Separator className="mb-12" />
                <LayoutDemo />
                <Separator className="mb-12" />
                <DataDisplayDemo />
                <Separator className="mb-12" />
                <FeedbackDemo />
                <Separator className="mb-12" />
                <MotionDemo />
                <Separator className="mb-12" />
                <KeyboardDemo />
                <Separator className="mb-12" />
                <CommandDemo />
                <Separator className="mb-12" />
                <CalendarDemo />
                <Separator className="mb-12" />
                <ChartDemo />
                <Separator className="mb-12" />
                <ColorPickerDemo />
                <Separator className="mb-12" />
                <AIElementsDemo />
                <Separator className="mb-12" />
                <ChatDemo />
                <Separator className="mb-12" />
                <BrandDemo />

                <div className="pb-28" />
            </div>
        </div>
    );
}
