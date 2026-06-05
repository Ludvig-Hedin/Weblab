'use client';

import { useState } from 'react';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@weblab/ui/alert-dialog';
import { Avatar, AvatarFallback } from '@weblab/ui/avatar';
import { Button } from '@weblab/ui/button';
import { Checkbox } from '@weblab/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@weblab/ui/dialog';
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from '@weblab/ui/drawer';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@weblab/ui/hover-card';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@weblab/ui/popover';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@weblab/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';

import { Section } from '../section';

const FILTER_TAGS = ['Marketing', 'Engineering', 'Design', 'Sales', 'Archived'] as const;

export function OverlaysDemo() {
    const [filterState, setFilterState] = useState<Record<string, boolean>>({
        Marketing: true,
        Engineering: false,
        Design: true,
        Sales: false,
        Archived: false,
    });
    const activeCount = Object.values(filterState).filter(Boolean).length;
    const resetFilters = () =>
        setFilterState({
            Marketing: false,
            Engineering: false,
            Design: false,
            Sales: false,
            Archived: false,
        });

    return (
        <div id="overlays">
            <Section
                title="Dialog"
                tag="overlays"
                inspectId="dialog"
                filePath="packages/ui/src/components/dialog.tsx"
            >
                <div className="flex flex-wrap items-center gap-3">
                    <Dialog>
                        <DialogTrigger asChild>
                            <Button variant="outline">Open dialog</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Create project</DialogTitle>
                                <DialogDescription>
                                    Give your project a name and choose how you want to get started.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-3 py-2">
                                <div className="space-y-2">
                                    <Label htmlFor="dg-name">Project name</Label>
                                    <Input id="dg-name" placeholder="My awesome project" />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline">Cancel</Button>
                                <Button>Create</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive">Delete project</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This action cannot be undone. All project data will be
                                    permanently deleted.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </Section>

            <Section
                title="Sheet"
                tag="overlays"
                inspectId="sheet"
                filePath="packages/ui/src/components/sheet.tsx"
            >
                <div className="flex flex-wrap items-center gap-3">
                    {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                        <Sheet key={side}>
                            <SheetTrigger asChild>
                                <Button variant="outline">From {side}</Button>
                            </SheetTrigger>
                            <SheetContent side={side}>
                                <SheetHeader>
                                    <SheetTitle>Sheet from {side}</SheetTitle>
                                    <SheetDescription>
                                        Slides in from the {side} edge of the viewport.
                                    </SheetDescription>
                                </SheetHeader>
                            </SheetContent>
                        </Sheet>
                    ))}
                </div>
            </Section>

            <Section
                title="Drawer"
                tag="overlays"
                inspectId="drawer"
                filePath="packages/ui/src/components/drawer.tsx"
            >
                <Drawer>
                    <DrawerTrigger asChild>
                        <Button variant="outline">Open drawer</Button>
                    </DrawerTrigger>
                    <DrawerContent>
                        <div className="mx-auto w-full max-w-md p-4">
                            <DrawerHeader>
                                <DrawerTitle>Drawer title</DrawerTitle>
                                <DrawerDescription>
                                    Swipe-up drawer powered by Vaul.
                                </DrawerDescription>
                            </DrawerHeader>
                            <DrawerFooter>
                                <Button>Confirm</Button>
                                <DrawerClose asChild>
                                    <Button variant="outline">Cancel</Button>
                                </DrawerClose>
                            </DrawerFooter>
                        </div>
                    </DrawerContent>
                </Drawer>
            </Section>

            <Section
                title="Popover"
                tag="overlays"
                inspectId="popover"
                filePath="packages/ui/src/components/popover.tsx"
            >
                <div className="flex flex-wrap items-center gap-3">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline">Open popover</Button>
                        </PopoverTrigger>
                        <PopoverContent>
                            <div className="space-y-3">
                                <p className="text-foreground text-sm font-medium">Dimensions</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label>Width</Label>
                                        <Input defaultValue="100%" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Height</Label>
                                        <Input defaultValue="auto" />
                                    </div>
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
                    {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                        <Popover key={side}>
                            <PopoverTrigger asChild>
                                <Button variant="ghost" size="sm">
                                    {side}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent side={side} className="w-48">
                                <p className="text-foreground text-sm">
                                    Popover anchored to <code>{side}</code>.
                                </p>
                            </PopoverContent>
                        </Popover>
                    ))}
                </div>
            </Section>

            <Section
                title="Popover sizes"
                tag="overlays"
                inspectId="popover"
                filePath="packages/ui/src/components/popover.tsx"
            >
                <div className="flex flex-wrap items-start gap-3">
                    {(
                        [
                            { w: 'w-56', label: 'Compact (w-56)' },
                            { w: 'w-72', label: 'Default (w-72)' },
                            { w: 'w-80', label: 'Form (w-80)' },
                            { w: 'w-96', label: 'Rich (w-96)' },
                            { w: 'w-[28rem]', label: 'Wide (w-[28rem])' },
                        ] as const
                    ).map(({ w, label }) => (
                        <Popover key={w}>
                            <PopoverTrigger asChild>
                                <Button variant="outline" size="sm">
                                    {label}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent align="start" className={w}>
                                <p className="text-foreground text-sm font-medium">{label}</p>
                                <p className="text-foreground-tertiary mt-1 text-xs">
                                    Width preset for the {label.toLowerCase()} use case.
                                </p>
                            </PopoverContent>
                        </Popover>
                    ))}
                </div>
            </Section>

            <Section
                title="Color-picker popover"
                tag="overlays"
                inspectId="popover"
                filePath="packages/ui/src/components/popover.tsx"
            >
                <div className="flex items-center gap-3">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="icon" aria-label="Pick color">
                                <span
                                    className="border-border h-4 w-4 rounded-sm border"
                                    style={{ backgroundColor: '#3b82f6' }}
                                />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-72 p-3">
                            <div className="space-y-3">
                                <div className="bg-muted h-32 w-full rounded-md" />
                                <div className="grid grid-cols-6 gap-2">
                                    {[
                                        '#0ea5e9',
                                        '#22c55e',
                                        '#eab308',
                                        '#f97316',
                                        '#ef4444',
                                        '#a855f7',
                                    ].map((c) => (
                                        <button
                                            key={c}
                                            type="button"
                                            aria-label={`Pick ${c}`}
                                            className="border-border focus-visible:ring-foreground/40 h-7 w-7 rounded-md border focus-visible:ring-2 focus-visible:outline-none"
                                            style={{ backgroundColor: c }}
                                        />
                                    ))}
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <Label className="text-foreground-tertiary text-xs">
                                            Hex
                                        </Label>
                                        <Input defaultValue="#3b82f6" className="h-7 text-xs" />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-foreground-tertiary text-xs">
                                            Alpha
                                        </Label>
                                        <Input defaultValue="100%" className="h-7 text-xs" />
                                    </div>
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
                    <p className="text-foreground-tertiary text-xs">
                        Canonical pattern for the inspector color-field popover.
                    </p>
                </div>
            </Section>

            <Section
                title="Font-picker popover"
                tag="overlays"
                inspectId="popover"
                filePath="packages/ui/src/components/popover.tsx"
            >
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" className="justify-between" size="sm">
                            <span>Inter</span>
                            <Icons.ChevronDown className="ml-2 h-3.5 w-3.5" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-72 p-0">
                        <div className="border-border border-b p-2">
                            <div className="relative">
                                <Icons.MagnifyingGlass className="text-foreground-tertiary pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2" />
                                <Input placeholder="Search fonts…" className="h-7 pl-7 text-xs" />
                            </div>
                        </div>
                        <div className="max-h-56 overflow-y-auto p-1">
                            {[
                                'Inter',
                                'Geist',
                                'IBM Plex Sans',
                                'JetBrains Mono',
                                'Manrope',
                                'Söhne',
                                'Roboto',
                            ].map((font) => (
                                <button
                                    key={font}
                                    type="button"
                                    className="hover:bg-accent hover:text-accent-foreground flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm transition-colors"
                                    style={{ fontFamily: font }}
                                >
                                    <span>{font}</span>
                                    <span className="text-foreground-tertiary text-xs">Aa</span>
                                </button>
                            ))}
                        </div>
                    </PopoverContent>
                </Popover>
                <p className="text-foreground-tertiary mt-2 text-xs">
                    Pattern for the inspector font-field popover.
                </p>
            </Section>

            <Section
                title="Filter popover"
                tag="overlays"
                inspectId="popover"
                filePath="packages/ui/src/components/popover.tsx"
            >
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" size="sm">
                            <Icons.MixerHorizontal className="mr-1 h-3.5 w-3.5" />
                            Filter
                            {activeCount > 0 && (
                                <span className="bg-accent text-accent-foreground ml-1.5 rounded-full px-1.5 py-0.5 text-tiny font-medium">
                                    {activeCount}
                                </span>
                            )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-72 p-0">
                        <div className="border-border flex items-center justify-between border-b px-3 py-2">
                            <span className="text-foreground text-sm font-medium">
                                Filter by tag
                            </span>
                            <button
                                type="button"
                                onClick={resetFilters}
                                className="text-foreground-tertiary hover:text-foreground text-xs"
                            >
                                Reset
                            </button>
                        </div>
                        <div className="flex flex-col gap-1 p-2">
                            {FILTER_TAGS.map((tag) => {
                                const id = `ds-pop-filter-${tag}`;
                                return (
                                    <label
                                        key={tag}
                                        htmlFor={id}
                                        className="hover:bg-accent flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
                                    >
                                        <Checkbox
                                            id={id}
                                            checked={filterState[tag]}
                                            onCheckedChange={(v) =>
                                                setFilterState((s) => ({
                                                    ...s,
                                                    [tag]: Boolean(v),
                                                }))
                                            }
                                        />
                                        {tag}
                                    </label>
                                );
                            })}
                        </div>
                        <div className="border-border flex items-center justify-end gap-2 border-t px-3 py-2">
                            <Button variant="ghost" size="sm" onClick={resetFilters}>
                                Clear
                            </Button>
                            <Button size="sm">Apply</Button>
                        </div>
                    </PopoverContent>
                </Popover>
            </Section>

            <Section
                title="Errors-console popover"
                tag="overlays"
                inspectId="popover"
                filePath="packages/ui/src/components/popover.tsx"
            >
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive relative"
                            aria-label="Open errors console"
                        >
                            <Icons.ExclamationTriangle className="h-4 w-4" />
                            <span className="bg-destructive text-destructive-foreground absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-tiny leading-none font-medium">
                                3
                            </span>
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-[28rem] p-0">
                        <div className="border-border flex items-center justify-between border-b px-3 py-2">
                            <div className="text-foreground flex items-center gap-2 text-sm font-medium">
                                <Icons.ExclamationTriangle className="text-destructive h-4 w-4" />3
                                issues
                            </div>
                            <Button variant="ghost" size="sm">
                                <Icons.Copy className="mr-1 h-3.5 w-3.5" /> Copy
                            </Button>
                        </div>
                        <ul className="max-h-72 divide-y overflow-y-auto">
                            <li className="text-foreground flex items-start gap-2 px-3 py-2 text-xs">
                                <Icons.ExclamationTriangle className="text-destructive mt-0.5 h-3.5 w-3.5 shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-foreground truncate text-sm">
                                        TypeError: Cannot read properties of undefined
                                    </p>
                                    <p className="text-foreground-tertiary mt-0.5 truncate">
                                        editor/canvas/frame.ts:142
                                    </p>
                                </div>
                            </li>
                            <li className="text-foreground flex items-start gap-2 px-3 py-2 text-xs">
                                <Icons.ExclamationTriangle className="text-foreground-warning mt-0.5 h-3.5 w-3.5 shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-foreground truncate text-sm">
                                        Deprecated API: <code>useLegacyEditor</code>
                                    </p>
                                    <p className="text-foreground-tertiary mt-0.5 truncate">
                                        ai-chat/composer.tsx:28
                                    </p>
                                </div>
                            </li>
                            <li className="text-foreground flex items-start gap-2 px-3 py-2 text-xs">
                                <Icons.CheckCircled className="text-foreground-success mt-0.5 h-3.5 w-3.5 shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-foreground truncate text-sm">
                                        HMR reconnected after 3 retries
                                    </p>
                                    <p className="text-foreground-tertiary mt-0.5 truncate">
                                        dev-server.ts
                                    </p>
                                </div>
                            </li>
                        </ul>
                    </PopoverContent>
                </Popover>
                <p className="text-foreground-tertiary mt-2 text-xs">
                    Uses <code>text-destructive</code> / <code>text-foreground-warning</code> /{' '}
                    <code>text-foreground-success</code> — no raw red/yellow/green palette.
                </p>
            </Section>

            <Section
                title="Hover card"
                tag="overlays"
                inspectId="hover-card"
                filePath="packages/ui/src/components/hover-card.tsx"
            >
                <HoverCard>
                    <HoverCardTrigger asChild>
                        <Button variant="link">@weblab</Button>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-72">
                        <div className="flex items-start gap-3">
                            <Avatar className="h-10 w-10">
                                <AvatarFallback>WB</AvatarFallback>
                            </Avatar>
                            <div>
                                <p className="text-foreground text-sm font-medium">Weblab</p>
                                <p className="text-foreground-tertiary text-xs">
                                    AI-powered visual editor for production codebases.
                                </p>
                            </div>
                        </div>
                    </HoverCardContent>
                </HoverCard>
            </Section>

            <Section title="Tooltip" tag="overlays" inspectId="tooltip">
                <div className="flex flex-wrap items-center gap-4">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="outline" size="icon">
                                <Icons.InfoCircled className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Info tooltip</TooltipContent>
                    </Tooltip>
                    {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                        <Tooltip key={side}>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="sm">
                                    {side}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side={side}>{side} side</TooltipContent>
                        </Tooltip>
                    ))}
                </div>
            </Section>
        </div>
    );
}
